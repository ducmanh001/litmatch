import { DomainException } from '@litmatch/common-exceptions';

import { DiscoveryService } from './discovery.service';
import { DiscoveryErrors } from './discovery.errors';
import { Gender, UserStatus } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { SafetyService } from '../safety';
import type { User, UserService } from '../user';

const me: AuthenticatedUser = {
  userId: 'user-me',
  isGuest: false,
  role: 'user',
};

const CONFIG: Record<string, unknown> = {
  DISCOVERY_GUEST_VISIBLE: false,
  DISCOVERY_AGE_BUCKETS: '18,25,31,41',
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    nickname: 'A',
    gender: Gender.Female,
    birthDate: null,
    region: 'HCM',
    avatarId: 'default-01',
    trustScore: 100,
    status: UserStatus.Active,
    isGuest: false,
    role: 'user',
    createdAt: new Date('2026-07-01T00:00:00Z'),
    updatedAt: new Date('2026-07-01T00:00:00Z'),
    ...overrides,
  } as User;
}

describe('DiscoveryService (unit — mock UserService/SafetyService)', () => {
  let userService: { browsePage: jest.Mock };
  let safetyService: { getHiddenUserIds: jest.Mock };
  let service: DiscoveryService;

  beforeEach(() => {
    userService = {
      browsePage: jest.fn(async () => ({
        items: [],
        meta: { nextCursor: null },
      })),
    };
    safetyService = { getHiddenUserIds: jest.fn(async () => []) };
    service = new DiscoveryService(
      userService as unknown as UserService,
      safetyService as unknown as SafetyService,
      configStub,
    );
  });

  it('gộp self + hidden set từ Safety vào excludeUserIds trước khi query User', async () => {
    safetyService.getHiddenUserIds.mockResolvedValue([
      'blocked-1',
      'reported-1',
    ]);
    await service.browse(me, { limit: 20 });

    expect(safetyService.getHiddenUserIds).toHaveBeenCalledWith(me.userId);
    const [filter] = userService.browsePage.mock.calls[0];
    expect(filter.excludeUserIds).toEqual([
      me.userId,
      'blocked-1',
      'reported-1',
    ]);
  });

  it('excludeGuests = true khi DISCOVERY_GUEST_VISIBLE=false (mặc định)', async () => {
    await service.browse(me, { limit: 20 });
    const [filter] = userService.browsePage.mock.calls[0];
    expect(filter.excludeGuests).toBe(true);
  });

  it('chặn ageMin > ageMax — không query xuống User', async () => {
    await expect(
      service.browse(me, { limit: 20, ageMin: 40, ageMax: 20 }),
    ).rejects.toMatchObject({
      code: DiscoveryErrors.FILTER_INVALID,
    } as Partial<DomainException>);
    expect(userService.browsePage).not.toHaveBeenCalled();
  });

  it('cursor không hợp lệ → DISCOVERY_CURSOR_INVALID, không lộ chi tiết', async () => {
    await expect(
      service.browse(me, { limit: 20, cursor: 'not-a-valid-cursor!!' }),
    ).rejects.toMatchObject({ code: DiscoveryErrors.CURSOR_INVALID });
  });

  it('tính ageBucket từ birthDate theo mốc config, không lộ tuổi chính xác', async () => {
    const now = new Date();
    const birthDate28 = new Date(
      now.getFullYear() - 28,
      now.getMonth(),
      now.getDate(),
    )
      .toISOString()
      .slice(0, 10);
    userService.browsePage.mockResolvedValue({
      items: [makeUser({ birthDate: birthDate28 })],
      meta: { nextCursor: null },
    });

    const page = await service.browse(me, { limit: 20 });
    expect(page.items[0].ageBucket).toBe('25-30');
  });

  it('birthDate null → ageBucket null (không đoán tuổi)', async () => {
    userService.browsePage.mockResolvedValue({
      items: [makeUser({ birthDate: null })],
      meta: { nextCursor: null },
    });
    const page = await service.browse(me, { limit: 20 });
    expect(page.items[0].ageBucket).toBeNull();
  });
});
