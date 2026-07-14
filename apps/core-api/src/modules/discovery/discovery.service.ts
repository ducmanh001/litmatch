import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { decodeCursor } from '@litmatch/common-dtos';
import { DomainException } from '@litmatch/common-exceptions';

import { DiscoveryErrors } from './discovery.errors';
import { SafetyService } from '../safety';
import { UserService } from '../user';

import type { CursorPage } from '@litmatch/common-dtos';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { UserBrowseCursorPosition, UserBrowseFilter, User } from '../user';
import type { BrowseQueryDto } from './dto/discovery.dtos';

export type DiscoveryCardRow = { user: User; ageBucket: string | null };

/**
 * Facade Discovery (docs/services/discovery-service.md): duyệt user chủ động theo tiêu chí
 * (đợt W1 — browse-only, chưa có nearby/vị trí, xem docs/plans/2026-07-14-plan-6-tinh-nang-
 * social-discovery.md). Loại trừ block+report 2 chiều qua `SafetyService.getHiddenUserIds`;
 * card trả composition `PublicProfileDto` + `ageBucket`, KHÔNG sửa DTO công khai chung.
 */
@Injectable()
export class DiscoveryService {
  constructor(
    private readonly userService: UserService,
    private readonly safetyService: SafetyService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  async browse(
    user: AuthenticatedUser,
    query: BrowseQueryDto,
  ): Promise<CursorPage<DiscoveryCardRow>> {
    if (
      query.ageMin !== undefined &&
      query.ageMax !== undefined &&
      query.ageMin > query.ageMax
    ) {
      throw new DomainException(
        DiscoveryErrors.FILTER_INVALID,
        'ageMin phải nhỏ hơn hoặc bằng ageMax',
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }

    const after = this.decodeBrowseCursor(query.cursor);
    const hiddenUserIds = await this.safetyService.getHiddenUserIds(
      user.userId,
    );

    const filter: UserBrowseFilter = {
      gender: query.gender,
      ageMin: query.ageMin,
      ageMax: query.ageMax,
      excludeUserIds: [user.userId, ...hiddenUserIds],
      excludeGuests: !this.config.getOrThrow('DISCOVERY_GUEST_VISIBLE', {
        infer: true,
      }),
    };

    const page = await this.userService.browsePage(filter, query.limit, after);
    return {
      items: page.items.map((u) => ({
        user: u,
        ageBucket: this.computeAgeBucket(u.birthDate),
      })),
      meta: page.meta,
    };
  }

  private decodeBrowseCursor(
    cursor: string | undefined,
  ): UserBrowseCursorPosition | undefined {
    if (!cursor) return undefined;
    const pos = decodeCursor<{ createdAt?: unknown; id?: unknown }>(cursor);
    if (
      !pos ||
      typeof pos.createdAt !== 'string' ||
      typeof pos.id !== 'string'
    ) {
      throw new DomainException(
        DiscoveryErrors.CURSOR_INVALID,
        'Cursor không hợp lệ',
        HttpStatus.BAD_REQUEST,
      );
    }
    return { createdAt: pos.createdAt, id: pos.id };
  }

  /**
   * Bucket rộng (không lộ tuổi chính xác) từ `DISCOVERY_AGE_BUCKETS` — CSV mốc tuổi tăng dần
   * (vd `18,25,31,41` → bucket `18-24`, `25-30`, `31-40`, `41+`).
   */
  private computeAgeBucket(birthDate: string | null): string | null {
    if (!birthDate) return null;
    const age = this.calculateAge(birthDate);
    const boundaries = this.config
      .getOrThrow('DISCOVERY_AGE_BUCKETS', { infer: true })
      .split(',')
      .map((s) => Number(s.trim()))
      .filter((n) => Number.isFinite(n))
      .sort((a, b) => a - b);

    for (let i = boundaries.length - 1; i >= 0; i--) {
      if (age >= boundaries[i]) {
        const lower = boundaries[i];
        const upper = i + 1 < boundaries.length ? boundaries[i + 1] - 1 : null;
        return upper !== null ? `${lower}-${upper}` : `${lower}+`;
      }
    }
    return null;
  }

  private calculateAge(birthDate: string): number {
    const now = new Date();
    const birth = new Date(birthDate);
    let age = now.getFullYear() - birth.getFullYear();
    const monthDiff = now.getMonth() - birth.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < birth.getDate())) {
      age -= 1;
    }
    return age;
  }
}
