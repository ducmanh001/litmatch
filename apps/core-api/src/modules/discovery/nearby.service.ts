import { HttpStatus, Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { buildCursorPage, decodeCursor } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, Repository } from 'typeorm';

import {
  computeDistanceBucket,
  haversineDistanceKm,
  nearbyJitterKm,
  quantizeCoordinate,
} from './nearby.constants';
import { DiscoverySetting } from './entities/discovery-setting.entity';
import { UserLocation } from './entities/user-location.entity';
import { DiscoveryErrors } from './discovery.errors';
import { checkRateLimit } from '../../common/redis/rate-limit';
import { todayUtc } from '../../common/date/utc-date';
import {
  DISCOVERY_REDIS,
  locationUpdateCountKey,
  nearbyQueryCountKey,
} from './redis/discovery-redis.provider';
import { SafetyService } from '../safety';
import { UserService } from '../user';

import type Redis from 'ioredis';
import type { CursorPage } from '@litmatch/common-dtos';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { User } from '../user';
import type { NearbyQueryDto, SetLocationDto } from './dto/nearby.dtos';

const RATE_LIMIT_WINDOW_SECONDS = 3600;

export type NearbyCardRow = { user: User; distanceBucket: string };

/**
 * Nearby (docs/services/discovery-service.md § Nearby, W4). 3 lớp chống trilateration:
 * (1) quantize toạ độ ~500m tại nguồn — bảng `user_locations` không bao giờ chứa toạ độ thô;
 * (2) jitter tất định theo cặp-theo-ngày trước khi tính bucket (`nearbyJitterKm`);
 * (3) rate limit ghi vị trí + truy vấn nearby (Redis, cùng pattern Lua của Matching speed-up).
 * Reciprocity: chưa opt-in (`nearbyVisible=false`) thì không xem được nearby của người khác.
 * Spatial MVP: bounding-box btree + haversine tính ở app (không PostGIS) — candidate set giới
 * hạn `DISCOVERY_NEARBY_CANDIDATE_CAP`, sort/cursor cũng ở app (đủ cho quy mô MVP, không phải
 * cơ chế phân trang vô hạn — deferred optimization nếu cần scale sau, KHÔNG phải vấn đề đúng-sai).
 */
@Injectable()
export class NearbyService {
  constructor(
    @InjectRepository(UserLocation)
    private readonly locationRepo: Repository<UserLocation>,
    @InjectRepository(DiscoverySetting)
    private readonly settingRepo: Repository<DiscoverySetting>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly safetyService: SafetyService,
    @Inject(DISCOVERY_REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /** Ghi vị trí (quantize tại nguồn) — không giữ toạ độ thô ở bất kỳ bước nào. */
  async setLocation(
    user: AuthenticatedUser,
    dto: SetLocationDto,
  ): Promise<void> {
    if (dto.lat < -90 || dto.lat > 90 || dto.lon < -180 || dto.lon > 180) {
      throw new DomainException(
        DiscoveryErrors.LOCATION_INVALID,
        'Toạ độ không hợp lệ',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const allowed = await checkRateLimit(
      this.redis,
      locationUpdateCountKey(user.userId),
      this.config.getOrThrow('DISCOVERY_LOCATION_UPDATE_RATE_LIMIT_PER_HOUR', {
        infer: true,
      }),
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new DomainException(
        DiscoveryErrors.NEARBY_RATE_LIMITED,
        'Cập nhật vị trí quá nhanh, thử lại sau',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const step = this.config.getOrThrow('DISCOVERY_LOCATION_QUANTIZE_DEGREES', {
      infer: true,
    });
    const latQuantized = quantizeCoordinate(dto.lat, step);
    const lonQuantized = quantizeCoordinate(dto.lon, step);

    await this.locationRepo.query(
      `INSERT INTO user_locations (user_id, lat_quantized, lon_quantized, updated_at)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (user_id) DO UPDATE
         SET lat_quantized = $2, lon_quantized = $3, updated_at = now()`,
      [user.userId, latQuantized, lonQuantized],
    );
  }

  /** Bật/tắt hiển thị nearby — tắt PHẢI xoá `user_locations` cùng transaction. */
  async setVisible(user: AuthenticatedUser, visible: boolean): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.query(
        `INSERT INTO discovery_settings (user_id, nearby_visible)
         VALUES ($1, $2)
         ON CONFLICT (user_id) DO UPDATE SET nearby_visible = $2`,
        [user.userId, visible],
      );
      if (!visible) {
        await manager.query(`DELETE FROM user_locations WHERE user_id = $1`, [
          user.userId,
        ]);
      }
    });
  }

  async listNearby(
    user: AuthenticatedUser,
    query: NearbyQueryDto,
  ): Promise<CursorPage<NearbyCardRow>> {
    const allowed = await checkRateLimit(
      this.redis,
      nearbyQueryCountKey(user.userId),
      this.config.getOrThrow('DISCOVERY_NEARBY_QUERY_RATE_LIMIT_PER_HOUR', {
        infer: true,
      }),
      RATE_LIMIT_WINDOW_SECONDS,
    );
    if (!allowed) {
      throw new DomainException(
        DiscoveryErrors.NEARBY_RATE_LIMITED,
        'Truy vấn nearby quá nhanh, thử lại sau',
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const mySetting = await this.settingRepo.findOne({
      where: { userId: user.userId },
    });
    if (!mySetting?.nearbyVisible) {
      throw new DomainException(
        DiscoveryErrors.NEARBY_NOT_OPTED_IN,
        'Bạn cần bật hiển thị Nearby trước khi xem người khác',
        HttpStatus.FORBIDDEN,
      );
    }

    const myLocation = await this.locationRepo.findOne({
      where: { userId: user.userId },
    });
    const freshnessHours = this.config.getOrThrow(
      'DISCOVERY_LOCATION_FRESHNESS_HOURS',
      { infer: true },
    );
    if (!myLocation || !this.isFresh(myLocation.updatedAt, freshnessHours)) {
      throw new DomainException(
        DiscoveryErrors.NEARBY_LOCATION_MISSING,
        'Bạn chưa cập nhật vị trí (hoặc vị trí đã quá hạn)',
        HttpStatus.CONFLICT,
      );
    }

    const cursor = this.decodeNearbyCursor(query.cursor);
    const radiusKm = this.config.getOrThrow('DISCOVERY_NEARBY_RADIUS_KM', {
      infer: true,
    });
    const hiddenUserIds = await this.safetyService.getHiddenUserIds(
      user.userId,
    );

    const candidates = await this.queryCandidates(
      myLocation,
      radiusKm,
      [user.userId, ...hiddenUserIds],
      freshnessHours,
    );
    if (candidates.length === 0) {
      return { items: [], meta: { nextCursor: null } };
    }

    const users = await this.userService.findActiveByIds(
      candidates.map((c) => c.userId),
      {
        gender: query.gender,
        ageMin: query.ageMin,
        ageMax: query.ageMax,
        excludeGuests: !this.config.getOrThrow('DISCOVERY_GUEST_VISIBLE', {
          infer: true,
        }),
      },
    );
    const userById = new Map(users.map((u) => [u.id, u]));

    const forDate = todayUtc();
    const distanceBucketsCsv = this.config.getOrThrow(
      'DISCOVERY_DISTANCE_BUCKETS_KM',
      { infer: true },
    );
    const jitterMaxKm = radiusKm * 0.1;

    const rows = candidates
      .filter((c) => userById.has(c.userId))
      .map((c) => {
        const rawDistanceKm = haversineDistanceKm(
          myLocation.latQuantized,
          myLocation.lonQuantized,
          c.latQuantized,
          c.lonQuantized,
        );
        const jitter = nearbyJitterKm(
          user.userId,
          c.userId,
          forDate,
          jitterMaxKm,
        );
        const jitteredDistanceKm = Math.max(0, rawDistanceKm + jitter);
        return {
          userId: c.userId,
          jitteredDistanceKm,
          user: userById.get(c.userId) as User,
        };
      })
      .sort(
        (a, b) =>
          a.jitteredDistanceKm - b.jitteredDistanceKm ||
          (a.userId < b.userId ? -1 : a.userId > b.userId ? 1 : 0),
      )
      .filter((r) => !cursor || this.isAfterCursor(r, cursor));

    const page = buildCursorPage(rows, query.limit, (last) => ({
      distanceKm: last.jitteredDistanceKm,
      userId: last.userId,
    }));
    return {
      items: page.items.map((r) => ({
        user: r.user,
        distanceBucket: computeDistanceBucket(
          r.jitteredDistanceKm,
          distanceBucketsCsv,
        ),
      })),
      meta: page.meta,
    };
  }

  private isFresh(updatedAt: Date, freshnessHours: number): boolean {
    const ageMs = Date.now() - updatedAt.getTime();
    return ageMs <= freshnessHours * 60 * 60 * 1000;
  }

  private isAfterCursor(
    row: { jitteredDistanceKm: number; userId: string },
    cursor: { distanceKm: number; userId: string },
  ): boolean {
    if (row.jitteredDistanceKm !== cursor.distanceKm) {
      return row.jitteredDistanceKm > cursor.distanceKm;
    }
    return row.userId > cursor.userId;
  }

  private decodeNearbyCursor(
    cursor: string | undefined,
  ): { distanceKm: number; userId: string } | undefined {
    if (!cursor) return undefined;
    const pos = decodeCursor<{ distanceKm?: unknown; userId?: unknown }>(
      cursor,
    );
    if (
      !pos ||
      typeof pos.distanceKm !== 'number' ||
      typeof pos.userId !== 'string'
    ) {
      throw new DomainException(
        DiscoveryErrors.NEARBY_CURSOR_INVALID,
        'Cursor không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { distanceKm: pos.distanceKm, userId: pos.userId };
  }

  /** Bounding-box prefilter (MVP, không PostGIS) — lat/lon delta xấp xỉ từ bán kính km. */
  private async queryCandidates(
    myLocation: UserLocation,
    radiusKm: number,
    excludeUserIds: string[],
    freshnessHours: number,
  ): Promise<UserLocation[]> {
    const latDeltaDeg = radiusKm / 111.32;
    const lonDeltaDeg =
      radiusKm /
      (111.32 *
        Math.max(0.1, Math.cos((myLocation.latQuantized * Math.PI) / 180)));
    const cap = this.config.getOrThrow('DISCOVERY_NEARBY_CANDIDATE_CAP', {
      infer: true,
    });

    const rows: Array<{
      user_id: string;
      lat_quantized: string;
      lon_quantized: string;
      updated_at: Date;
    }> = await this.locationRepo.query(
      `SELECT ul.user_id, ul.lat_quantized, ul.lon_quantized, ul.updated_at
       FROM user_locations ul
       JOIN discovery_settings ds ON ds.user_id = ul.user_id
       WHERE ds.nearby_visible = true
         AND ul.updated_at > now() - make_interval(hours => $1::int)
         AND ul.lat_quantized BETWEEN $2 AND $3
         AND ul.lon_quantized BETWEEN $4 AND $5
         AND ul.user_id != ALL($6::uuid[])
       LIMIT $7`,
      [
        freshnessHours,
        myLocation.latQuantized - latDeltaDeg,
        myLocation.latQuantized + latDeltaDeg,
        myLocation.lonQuantized - lonDeltaDeg,
        myLocation.lonQuantized + lonDeltaDeg,
        excludeUserIds,
        cap,
      ],
    );

    return rows
      .map((r) => {
        const loc = new UserLocation();
        loc.userId = r.user_id;
        loc.latQuantized = Number(r.lat_quantized);
        loc.lonQuantized = Number(r.lon_quantized);
        loc.updatedAt = r.updated_at;
        return loc;
      })
      .filter(
        (loc) =>
          haversineDistanceKm(
            myLocation.latQuantized,
            myLocation.lonQuantized,
            loc.latQuantized,
            loc.lonQuantized,
          ) <= radiusKm,
      );
  }
}
