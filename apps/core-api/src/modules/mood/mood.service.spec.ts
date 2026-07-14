import { DomainException } from '@litmatch/common-exceptions';

import { MoodService } from './mood.service';
import { MoodErrors } from './mood.errors';
import { MoodEventKind } from './entities/mood-status-event.entity';

import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import type { CoreApiEnv } from '../../config/env.validation';
import type { SafetyService } from '../safety';
import type { MoodPreset } from './entities/mood-preset.entity';
import type { MoodStatusEvent } from './entities/mood-status-event.entity';

const CONFIG: Record<string, unknown> = { MOOD_STATUS_TTL_HOURS: 24 };
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

function makePreset(overrides: Partial<MoodPreset> = {}): MoodPreset {
  return {
    id: 'preset-1',
    code: 'happy',
    label: 'Đang vui',
    emoji: '😄',
    active: true,
    sortOrder: 1,
    ...overrides,
  };
}

describe('MoodService (unit — mock repo/SafetyService)', () => {
  let presetRepo: {
    find: jest.Mock;
    findOneBy: jest.Mock;
  };
  let eventRepo: {
    save: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    findOneByOrFail: jest.Mock;
  };
  let safetyService: { getBlockedUserIds: jest.Mock };
  let service: MoodService;

  beforeEach(() => {
    presetRepo = {
      find: jest.fn(async () => [makePreset()]),
      findOneBy: jest.fn(async () => makePreset()),
    };
    eventRepo = {
      save: jest.fn(async (e) => e),
      create: jest.fn((e) => e),
      findOne: jest.fn(async () => null),
      findOneByOrFail: jest.fn(),
    };
    safetyService = { getBlockedUserIds: jest.fn(async () => []) };
    service = new MoodService(
      presetRepo as unknown as Repository<MoodPreset>,
      eventRepo as unknown as Repository<MoodStatusEvent>,
      safetyService as unknown as SafetyService,
      configStub,
    );
  });

  it('listPresets chỉ trả preset active, sắp theo sortOrder (uỷ quyền cho repo query)', async () => {
    await service.listPresets();
    expect(presetRepo.find).toHaveBeenCalledWith({
      where: { active: true },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  });

  it('setMood: preset không tồn tại/tắt → MOOD_PRESET_NOT_FOUND, không insert event', async () => {
    presetRepo.findOneBy.mockResolvedValue(null);
    await expect(
      service.setMood('u1', 'unknown', 'key-1'),
    ).rejects.toMatchObject({
      code: MoodErrors.PRESET_NOT_FOUND,
    } as Partial<DomainException>);
    expect(eventRepo.save).not.toHaveBeenCalled();
  });

  it('setMood: tạo event kind=set, expiresAt = setAt + TTL giờ, idempotencyKey prefix theo user+kind', async () => {
    const before = Date.now();
    const result = await service.setMood('u1', 'happy', 'key-1');
    const after = Date.now();

    expect(eventRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        presetId: 'preset-1',
        kind: MoodEventKind.Set,
        idempotencyKey: 'mood:set:u1:key-1',
      }),
    );
    const savedArg = eventRepo.create.mock.calls[0][0];
    const ttlMs = savedArg.expiresAt.getTime() - before;
    expect(ttlMs).toBeGreaterThanOrEqual(24 * 3600 * 1000 - (after - before));
    expect(ttlMs).toBeLessThanOrEqual(24 * 3600 * 1000 + (after - before));
    expect(result.preset.code).toBe('happy');
  });

  it('setMood: idempotency-key trùng (unique violation) → đọc lại event cũ thay vì lỗi', async () => {
    eventRepo.save.mockRejectedValue({ code: '23505' });
    const existing = {
      id: 'evt-1',
      userId: 'u1',
      presetId: 'preset-1',
      kind: MoodEventKind.Set,
      expiresAt: new Date(Date.now() + 3600_000),
      idempotencyKey: 'mood:set:u1:key-1',
      createdAt: new Date(),
    };
    eventRepo.findOneByOrFail.mockResolvedValue(existing);

    const result = await service.setMood('u1', 'happy', 'key-1');
    expect(eventRepo.findOneByOrFail).toHaveBeenCalledWith({
      idempotencyKey: 'mood:set:u1:key-1',
    });
    expect(result.setAt).toBe(existing.createdAt);
  });

  it('clearMood: tạo event kind=clear, preset/expiresAt null', async () => {
    await service.clearMood('u1', 'key-2');
    expect(eventRepo.create).toHaveBeenCalledWith({
      userId: 'u1',
      presetId: null,
      kind: MoodEventKind.Clear,
      expiresAt: null,
      idempotencyKey: 'mood:clear:u1:key-2',
    });
  });

  it('getMyMood: không có event nào → null', async () => {
    eventRepo.findOne.mockResolvedValue(null);
    expect(await service.getMyMood('u1')).toBeNull();
  });

  it('getMyMood: dòng mới nhất là clear → null dù có set trước đó', async () => {
    eventRepo.findOne.mockResolvedValue({
      id: 'evt-2',
      userId: 'u1',
      presetId: null,
      kind: MoodEventKind.Clear,
      expiresAt: null,
      createdAt: new Date(),
    });
    expect(await service.getMyMood('u1')).toBeNull();
  });

  it('getMyMood: dòng set đã quá expiresAt → null (derive khi đọc, không cần cron)', async () => {
    eventRepo.findOne.mockResolvedValue({
      id: 'evt-3',
      userId: 'u1',
      presetId: 'preset-1',
      kind: MoodEventKind.Set,
      expiresAt: new Date(Date.now() - 1000),
      createdAt: new Date(Date.now() - 25 * 3600_000),
    });
    expect(await service.getMyMood('u1')).toBeNull();
  });

  it('getMyMood: dòng set còn hạn → trả preset', async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    const createdAt = new Date();
    eventRepo.findOne.mockResolvedValue({
      id: 'evt-4',
      userId: 'u1',
      presetId: 'preset-1',
      kind: MoodEventKind.Set,
      expiresAt,
      createdAt,
    });
    const mood = await service.getMyMood('u1');
    expect(mood).toEqual({ preset: makePreset(), setAt: createdAt, expiresAt });
  });

  it('getMyMood: preset đã bị xoá/tắt sau khi set → null, không throw', async () => {
    eventRepo.findOne.mockResolvedValue({
      id: 'evt-5',
      userId: 'u1',
      presetId: 'preset-gone',
      kind: MoodEventKind.Set,
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(),
    });
    presetRepo.findOneBy.mockResolvedValue(null);
    expect(await service.getMyMood('u1')).toBeNull();
  });

  it('getPublicMood: viewer đã block/bị block target → null, không query mood', async () => {
    safetyService.getBlockedUserIds.mockResolvedValue(['target-1']);
    const result = await service.getPublicMood('viewer-1', 'target-1');
    expect(result).toBeNull();
    expect(eventRepo.findOne).not.toHaveBeenCalled();
  });

  it('getPublicMood: không block → trả mood của target', async () => {
    const expiresAt = new Date(Date.now() + 3600_000);
    const createdAt = new Date();
    eventRepo.findOne.mockResolvedValue({
      id: 'evt-6',
      userId: 'target-1',
      presetId: 'preset-1',
      kind: MoodEventKind.Set,
      expiresAt,
      createdAt,
    });
    const result = await service.getPublicMood('viewer-1', 'target-1');
    expect(result?.preset.code).toBe('happy');
  });

  it('getPublicMood: xem mood chính mình → không gọi getBlockedUserIds', async () => {
    await service.getPublicMood('u1', 'u1');
    expect(safetyService.getBlockedUserIds).not.toHaveBeenCalled();
  });
});
