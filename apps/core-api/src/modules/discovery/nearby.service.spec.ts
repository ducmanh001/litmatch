import { NearbyService } from './nearby.service';
import { DiscoveryErrors } from './discovery.errors';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import type Redis from 'ioredis';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { SafetyService } from '../safety';
import type { UserService } from '../user';
import type { DiscoverySetting } from './entities/discovery-setting.entity';
import type { UserLocation } from './entities/user-location.entity';

const me: AuthenticatedUser = {
  userId: 'user-me',
  isGuest: false,
  role: 'user',
};

const CONFIG: Record<string, unknown> = {
  DISCOVERY_LOCATION_UPDATE_RATE_LIMIT_PER_HOUR: 12,
  DISCOVERY_NEARBY_QUERY_RATE_LIMIT_PER_HOUR: 30,
  DISCOVERY_LOCATION_QUANTIZE_DEGREES: 0.0045,
  DISCOVERY_LOCATION_FRESHNESS_HOURS: 24,
  DISCOVERY_NEARBY_RADIUS_KM: 20,
  DISCOVERY_DISTANCE_BUCKETS_KM: '1,3,5,10,20',
  DISCOVERY_NEARBY_CANDIDATE_CAP: 500,
  DISCOVERY_GUEST_VISIBLE: false,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

describe('NearbyService (unit — mock repo/redis/deps)', () => {
  let locationRepo: { findOne: jest.Mock; query: jest.Mock };
  let settingRepo: { findOne: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let userService: { findActiveByIds: jest.Mock };
  let safetyService: { getHiddenUserIds: jest.Mock };
  let redis: { eval: jest.Mock };
  let service: NearbyService;

  beforeEach(() => {
    locationRepo = { findOne: jest.fn(), query: jest.fn(async () => []) };
    settingRepo = { findOne: jest.fn() };
    dataSource = {
      transaction: jest.fn(async (cb) => cb({ query: jest.fn() })),
    };
    userService = { findActiveByIds: jest.fn(async () => []) };
    safetyService = { getHiddenUserIds: jest.fn(async () => []) };
    redis = { eval: jest.fn(async () => 1) }; // 1 = trong hạn mức (không phải -1)

    service = new NearbyService(
      locationRepo as unknown as Repository<UserLocation>,
      settingRepo as unknown as Repository<DiscoverySetting>,
      dataSource as unknown as DataSource,
      userService as unknown as UserService,
      safetyService as unknown as SafetyService,
      redis as unknown as Redis,
      configStub,
    );
  });

  describe('setLocation', () => {
    it('toạ độ ngoài phạm vi hợp lệ → LOCATION_INVALID, không chạm Redis/DB', async () => {
      await expect(
        service.setLocation(me, { lat: 999, lon: 106.7 }),
      ).rejects.toMatchObject({ code: DiscoveryErrors.LOCATION_INVALID });
      expect(redis.eval).not.toHaveBeenCalled();
      expect(locationRepo.query).not.toHaveBeenCalled();
    });

    it('vượt rate limit ghi vị trí → NEARBY_RATE_LIMITED, không ghi DB', async () => {
      redis.eval.mockResolvedValue(-1); // -1 = vượt giới hạn (theo checkRateLimit)
      await expect(
        service.setLocation(me, { lat: 10.7, lon: 106.7 }),
      ).rejects.toMatchObject({ code: DiscoveryErrors.NEARBY_RATE_LIMITED });
      expect(locationRepo.query).not.toHaveBeenCalled();
    });

    it('ghi vị trí đã quantize — KHÔNG BAO GIỜ gửi toạ độ thô vào DB', async () => {
      await service.setLocation(me, { lat: 10.7626789, lon: 106.6601234 });
      expect(locationRepo.query).toHaveBeenCalledTimes(1);
      const [, params] = locationRepo.query.mock.calls[0];
      const [, latQuantized, lonQuantized] = params as number[];
      expect(latQuantized).not.toBe(10.7626789);
      expect(lonQuantized).not.toBe(106.6601234);
    });
  });

  describe('setVisible', () => {
    it('tắt nearbyVisible → xoá user_locations CÙNG transaction', async () => {
      const manager = { query: jest.fn() };
      dataSource.transaction.mockImplementation(async (cb) => cb(manager));

      await service.setVisible(me, false);

      expect(manager.query).toHaveBeenCalledTimes(2);
      const deleteCall = manager.query.mock.calls.find((c: unknown[]) =>
        String(c[0]).includes('DELETE FROM user_locations'),
      );
      expect(deleteCall).toBeDefined();
    });

    it('bật nearbyVisible → KHÔNG xoá user_locations', async () => {
      const manager = { query: jest.fn() };
      dataSource.transaction.mockImplementation(async (cb) => cb(manager));

      await service.setVisible(me, true);

      expect(manager.query).toHaveBeenCalledTimes(1);
    });
  });

  describe('listNearby (reciprocity + freshness guard)', () => {
    it('chưa opt-in nearbyVisible → NEARBY_NOT_OPTED_IN, không query candidate', async () => {
      settingRepo.findOne.mockResolvedValue(null);
      await expect(service.listNearby(me, { limit: 20 })).rejects.toMatchObject(
        { code: DiscoveryErrors.NEARBY_NOT_OPTED_IN },
      );
      expect(locationRepo.query).not.toHaveBeenCalled();
    });

    it('đã opt-in nhưng nearbyVisible=false (đã tắt lại) → vẫn chặn', async () => {
      settingRepo.findOne.mockResolvedValue({
        userId: me.userId,
        nearbyVisible: false,
      });
      await expect(service.listNearby(me, { limit: 20 })).rejects.toMatchObject(
        { code: DiscoveryErrors.NEARBY_NOT_OPTED_IN },
      );
    });

    it('opt-in nhưng chưa có vị trí → NEARBY_LOCATION_MISSING', async () => {
      settingRepo.findOne.mockResolvedValue({
        userId: me.userId,
        nearbyVisible: true,
      });
      locationRepo.findOne.mockResolvedValue(null);
      await expect(service.listNearby(me, { limit: 20 })).rejects.toMatchObject(
        { code: DiscoveryErrors.NEARBY_LOCATION_MISSING },
      );
    });

    it('vị trí đã quá hạn freshness → NEARBY_LOCATION_MISSING', async () => {
      settingRepo.findOne.mockResolvedValue({
        userId: me.userId,
        nearbyVisible: true,
      });
      locationRepo.findOne.mockResolvedValue({
        userId: me.userId,
        latQuantized: 10.7,
        lonQuantized: 106.7,
        updatedAt: new Date(Date.now() - 25 * 60 * 60 * 1000), // 25h trước, freshness=24h
      });
      await expect(service.listNearby(me, { limit: 20 })).rejects.toMatchObject(
        { code: DiscoveryErrors.NEARBY_LOCATION_MISSING },
      );
    });

    it('vượt rate limit truy vấn → NEARBY_RATE_LIMITED, không check reciprocity', async () => {
      redis.eval.mockResolvedValue(-1);
      await expect(service.listNearby(me, { limit: 20 })).rejects.toMatchObject(
        { code: DiscoveryErrors.NEARBY_RATE_LIMITED },
      );
      expect(settingRepo.findOne).not.toHaveBeenCalled();
    });

    it('không có candidate nào trong bounding box → trả rỗng, không gọi UserService', async () => {
      settingRepo.findOne.mockResolvedValue({
        userId: me.userId,
        nearbyVisible: true,
      });
      locationRepo.findOne.mockResolvedValue({
        userId: me.userId,
        latQuantized: 10.7,
        lonQuantized: 106.7,
        updatedAt: new Date(),
      });
      locationRepo.query.mockResolvedValue([]);

      const page = await service.listNearby(me, { limit: 20 });
      expect(page.items).toEqual([]);
      expect(userService.findActiveByIds).not.toHaveBeenCalled();
    });
  });
});
