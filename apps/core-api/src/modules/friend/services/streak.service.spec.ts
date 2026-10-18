import {
  addDaysUtc,
  daysBetweenUtc,
  todayUtc,
} from '../../../common/date/utc-date';
import { StreakService } from './streak.service';
import { ConversationStreak } from '../entities/conversation-streak.entity';

import type { ConfigService } from '@nestjs/config';
import type { DataSource, Repository } from 'typeorm';
import type { CoreApiEnv } from '../../../config/env.validation';
import type { Conversation } from '../entities/conversation.entity';

const CONFIG: Record<string, unknown> = {
  STREAK_MILESTONE_DAYS: '3,7,14',
  STREAK_WARNING_HOURS: 20,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makeConversation(overrides: Partial<Conversation> = {}): Conversation {
  return {
    id: 'conv-1',
    userLowId: 'user-low',
    userHighId: 'user-high',
    lastMessageAt: null,
    createdAt: new Date(),
    ...overrides,
  } as Conversation;
}

function makeStreakRow(
  overrides: Partial<ConversationStreak> = {},
): ConversationStreak {
  return {
    conversationId: 'conv-1',
    currentStreak: 0,
    longestStreak: 0,
    userLowLastActiveDate: null,
    userHighLastActiveDate: null,
    lastConfirmedDate: null,
    graceUsedForDate: null,
    lastWarningSentAt: null,
    ...overrides,
  };
}

describe('date helpers (pure)', () => {
  it('todayUtc trả đúng định dạng YYYY-MM-DD', () => {
    expect(todayUtc()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it('daysBetweenUtc tính đúng số ngày lịch', () => {
    expect(daysBetweenUtc('2026-07-10', '2026-07-10')).toBe(0);
    expect(daysBetweenUtc('2026-07-10', '2026-07-11')).toBe(1);
    expect(daysBetweenUtc('2026-07-10', '2026-07-13')).toBe(3);
  });

  it('addDaysUtc cộng đúng ngày, kể cả qua tháng', () => {
    expect(addDaysUtc('2026-07-31', 1)).toBe('2026-08-01');
    expect(addDaysUtc('2026-07-10', -1)).toBe('2026-07-09');
  });
});

describe('StreakService.recordActivity (unit — mock transaction/repo)', () => {
  let manager: {
    query: jest.Mock;
    createQueryBuilder: jest.Mock;
    save: jest.Mock;
  };
  let dataSource: { transaction: jest.Mock };
  let streakRepo: { findOneBy: jest.Mock };
  let service: StreakService;
  let row: ConversationStreak;

  function setRow(overrides: Partial<ConversationStreak> = {}) {
    row = makeStreakRow(overrides);
    manager.createQueryBuilder.mockReturnValue({
      where: jest.fn().mockReturnThis(),
      setLock: jest.fn().mockReturnThis(),
      getOneOrFail: jest.fn(async () => row),
    });
  }

  beforeEach(() => {
    manager = {
      query: jest.fn(async () => undefined),
      createQueryBuilder: jest.fn(),
      save: jest.fn(async (r) => r),
    };
    dataSource = {
      transaction: jest.fn(async (cb) => cb(manager)),
    };
    streakRepo = { findOneBy: jest.fn(async () => null) };
    setRow();
    service = new StreakService(
      dataSource as unknown as DataSource,
      streakRepo as unknown as Repository<ConversationStreak>,
      configStub,
    );
  });

  describe('đường nhanh — bỏ qua transaction khi tin nhắn không đổi gì', () => {
    it('người gửi đã được ghi nhận hôm nay, bên kia chưa → không mở transaction', async () => {
      const existing = makeStreakRow({ userLowLastActiveDate: todayUtc() });
      streakRepo.findOneBy.mockResolvedValueOnce(existing);

      const result = await service.recordActivity(
        makeConversation(),
        'user-low',
      );

      expect(dataSource.transaction).not.toHaveBeenCalled();
      expect(result).toEqual({ streak: existing, milestoneHit: null });
    });

    it('cả hai đã active và đã xác nhận hôm nay → không mở transaction (cả hai chiều gửi)', async () => {
      const existing = makeStreakRow({
        currentStreak: 4,
        userLowLastActiveDate: todayUtc(),
        userHighLastActiveDate: todayUtc(),
        lastConfirmedDate: todayUtc(),
      });
      streakRepo.findOneBy.mockResolvedValue(existing);

      await service.recordActivity(makeConversation(), 'user-low');
      await service.recordActivity(makeConversation(), 'user-high');

      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('người gửi CHƯA active hôm nay → vẫn đi qua transaction dù bên kia đã active', async () => {
      streakRepo.findOneBy.mockResolvedValueOnce(
        makeStreakRow({ userHighLastActiveDate: todayUtc() }),
      );

      await service.recordActivity(makeConversation(), 'user-low');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('dữ liệu bất thường (cả hai active hôm nay nhưng chưa xác nhận) → transaction sửa lại, không bị bỏ qua', async () => {
      streakRepo.findOneBy.mockResolvedValueOnce(
        makeStreakRow({
          userLowLastActiveDate: todayUtc(),
          userHighLastActiveDate: todayUtc(),
          lastConfirmedDate: addDaysUtc(todayUtc(), -1),
        }),
      );
      setRow({
        userLowLastActiveDate: todayUtc(),
        userHighLastActiveDate: todayUtc(),
        lastConfirmedDate: addDaysUtc(todayUtc(), -1),
        currentStreak: 2,
      });

      const result = await service.recordActivity(
        makeConversation(),
        'user-low',
      );

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
      expect(result.streak.currentStreak).toBe(3);
    });

    it('chưa có row streak → transaction tạo lazily như trước', async () => {
      streakRepo.findOneBy.mockResolvedValueOnce(null);

      await service.recordActivity(makeConversation(), 'user-low');

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });
  });

  it('lần đầu cả 2 chiều cùng ngày → currentStreak=1, longestStreak=1', async () => {
    setRow({ userHighLastActiveDate: todayUtc() });
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.streak.currentStreak).toBe(1);
    expect(result.streak.longestStreak).toBe(1);
    expect(result.streak.lastConfirmedDate).toBe(todayUtc());
  });

  it('chỉ 1 chiều nhắn hôm nay → chưa tăng streak', async () => {
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.streak.currentStreak).toBe(0);
    expect(result.streak.userLowLastActiveDate).toBe(todayUtc());
  });

  it('gapDays=1 (hôm qua đã confirm) → tăng liên tục', async () => {
    const yesterday = addDaysUtc(todayUtc(), -1);
    setRow({
      currentStreak: 5,
      longestStreak: 5,
      userHighLastActiveDate: todayUtc(),
      lastConfirmedDate: yesterday,
    });
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.streak.currentStreak).toBe(6);
    expect(result.streak.longestStreak).toBe(6);
  });

  it('gapDays=2 (lỡ đúng 1 ngày) → grace cứu, streak vẫn tăng, ghi graceUsedForDate', async () => {
    const twoDaysAgo = addDaysUtc(todayUtc(), -2);
    setRow({
      currentStreak: 5,
      longestStreak: 5,
      userHighLastActiveDate: todayUtc(),
      lastConfirmedDate: twoDaysAgo,
    });
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.streak.currentStreak).toBe(6);
    expect(result.streak.graceUsedForDate).toBe(addDaysUtc(twoDaysAgo, 1));
  });

  it('gapDays>=3 → reset về 1, KHÔNG dùng grace', async () => {
    const fourDaysAgo = addDaysUtc(todayUtc(), -4);
    setRow({
      currentStreak: 10,
      longestStreak: 10,
      userHighLastActiveDate: todayUtc(),
      lastConfirmedDate: fourDaysAgo,
    });
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.streak.currentStreak).toBe(1);
    expect(result.streak.longestStreak).toBe(10); // longest giữ nguyên, không giảm
    expect(result.streak.graceUsedForDate).toBeNull();
  });

  it('đã confirm hôm nay rồi (gọi lại — replay message) → không tăng thêm lần 2', async () => {
    setRow({
      currentStreak: 3,
      longestStreak: 3,
      userHighLastActiveDate: todayUtc(),
      lastConfirmedDate: todayUtc(),
    });
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.streak.currentStreak).toBe(3); // không tăng
  });

  it('trúng mốc milestone → trả milestoneHit; không trúng → null', async () => {
    const yesterday = addDaysUtc(todayUtc(), -1);
    setRow({
      currentStreak: 2,
      longestStreak: 2,
      userHighLastActiveDate: todayUtc(),
      lastConfirmedDate: yesterday,
    });
    const result = await service.recordActivity(makeConversation(), 'user-low'); // → currentStreak = 3, có trong STREAK_MILESTONE_DAYS
    expect(result.milestoneHit).toBe(3);
  });

  it('không trúng milestone → milestoneHit null', async () => {
    setRow({ userHighLastActiveDate: todayUtc() }); // → currentStreak = 1, không trong '3,7,14'
    const result = await service.recordActivity(makeConversation(), 'user-low');
    expect(result.milestoneHit).toBeNull();
  });

  it('tự tạo row nếu chưa có (ON CONFLICT DO NOTHING) trước khi lock', async () => {
    await service.recordActivity(makeConversation(), 'user-low');
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining('ON CONFLICT'),
      ['conv-1'],
    );
  });
});

describe('StreakService.getDisplayStreak (unit — mock repo)', () => {
  let streakRepo: { findOneBy: jest.Mock };
  let service: StreakService;

  beforeEach(() => {
    streakRepo = { findOneBy: jest.fn() };
    service = new StreakService(
      {} as unknown as DataSource,
      streakRepo as unknown as Repository<ConversationStreak>,
      configStub,
    );
  });

  it('chưa có row nào → null', async () => {
    streakRepo.findOneBy.mockResolvedValue(null);
    expect(await service.getDisplayStreak('conv-1')).toBeNull();
  });

  it('gapDays<=2 → isActive=true, hiện đúng currentStreak', async () => {
    streakRepo.findOneBy.mockResolvedValue(
      makeStreakRow({
        currentStreak: 7,
        longestStreak: 10,
        lastConfirmedDate: addDaysUtc(todayUtc(), -2),
      }),
    );
    const result = await service.getDisplayStreak('conv-1');
    expect(result).toEqual({ current: 7, longest: 10, isActive: true });
  });

  it('gapDays>=3 → isActive=false, current=0 dù DB chưa reset', async () => {
    streakRepo.findOneBy.mockResolvedValue(
      makeStreakRow({
        currentStreak: 7,
        longestStreak: 10,
        lastConfirmedDate: addDaysUtc(todayUtc(), -5),
      }),
    );
    const result = await service.getDisplayStreak('conv-1');
    expect(result).toEqual({ current: 0, longest: 10, isActive: false });
  });
});

describe('StreakService.findConversationsNeedingWarning (unit — mock repo/config)', () => {
  it('trước mốc STREAK_WARNING_HOURS trong ngày → không query DB, trả rỗng', async () => {
    const streakRepo = { createQueryBuilder: jest.fn() };
    const config = {
      getOrThrow: () => 24, // không thể đạt — luôn "trước mốc" trừ giờ 24 không tồn tại thật
    } as unknown as ConfigService<CoreApiEnv, true>;
    const service = new StreakService(
      {} as unknown as DataSource,
      streakRepo as unknown as Repository<ConversationStreak>,
      config,
    );
    const result = await service.findConversationsNeedingWarning();
    expect(result).toEqual([]);
    expect(streakRepo.createQueryBuilder).not.toHaveBeenCalled();
  });
});
