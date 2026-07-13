import { DomainException } from '@litmatch/common-exceptions';

import { CallingService } from './calling.service';
import { CallingErrors } from './calling.errors';
import {
  CallEndReason,
  CallSession,
  CallSessionStatus,
  callRoomName,
} from './entities/call-session.entity';
import { MatchSession, MatchSessionStatus, MatchType } from '../matching';

import type { ConfigService } from '@nestjs/config';
import type { EntityManager, Repository } from 'typeorm';

import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { LivekitRoomPort } from './ports/livekit-room';

const CONFIG: Record<string, unknown> = {
  CALLING_TOKEN_TTL_SECONDS: 120,
  LIVEKIT_URL: 'ws://localhost:7880',
  // mặc định single-region (backward compat) — test multi-region tự override rồi trả lại
  LIVEKIT_REGION_URLS: '',
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
} as unknown as ConfigService<CoreApiEnv, true>;

const me: AuthenticatedUser = { userId: 'user-a', isGuest: false };
const PARTNER_ID = 'user-b';

function makeVoiceSession(overrides: Partial<MatchSession> = {}): MatchSession {
  return Object.assign(new MatchSession(), {
    id: 'session-1',
    matchType: MatchType.Voice,
    userAId: me.userId,
    userBId: PARTNER_ID,
    ticketAId: 't-a',
    ticketBId: 't-b',
    status: MatchSessionStatus.Confirmed,
    confirmedAAt: new Date(),
    confirmedBAt: new Date(),
    endedAt: null,
    ...overrides,
  });
}

function makeCall(overrides: Partial<CallSession> = {}): CallSession {
  return Object.assign(new CallSession(), {
    id: 'call-id-1',
    matchSessionId: 'session-1',
    roomName: callRoomName('call-id-1'),
    userAId: me.userId,
    userBId: PARTNER_ID,
    status: CallSessionStatus.Pending,
    joinedAAt: null,
    joinedBAt: null,
    startedAt: null,
    endedAt: null,
    endReason: null,
    durationSeconds: null,
    billedMinutes: 0,
    ...overrides,
  });
}

describe('CallingService (unit — mock repo/matching/livekit)', () => {
  let callRepo: {
    save: jest.Mock;
    create: jest.Mock;
    findOneBy: jest.Mock;
    findOneByOrFail: jest.Mock;
  };
  let matchingService: { findSessionById: jest.Mock };
  let livekit: {
    mintJoinToken: jest.Mock;
    deleteRoom: jest.Mock;
    receiveWebhook: jest.Mock;
  };
  let manager: { findOne: jest.Mock; save: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let redis: { publish: jest.Mock };
  let metrics: { recordEnded: jest.Mock };
  let userService: { getByIdOrThrow: jest.Mock };
  let service: CallingService;

  beforeEach(() => {
    callRepo = {
      save: jest.fn(async (c) => c),
      create: jest.fn((input) => Object.assign(new CallSession(), input)),
      findOneBy: jest.fn(async () => null),
      findOneByOrFail: jest.fn(),
    };
    matchingService = {
      findSessionById: jest.fn(async () => makeVoiceSession()),
    };
    livekit = {
      mintJoinToken: jest.fn(async (room, id) => `tok:${room}:${id}`),
      deleteRoom: jest.fn(async () => undefined),
      receiveWebhook: jest.fn(),
    };
    manager = { findOne: jest.fn(), save: jest.fn(async (c) => c) };
    dataSource = {
      transaction: jest.fn(async (cb: (m: EntityManager) => Promise<unknown>) =>
        cb(manager as unknown as EntityManager),
      ),
    };
    redis = { publish: jest.fn(async () => 1) };
    metrics = { recordEnded: jest.fn() };
    userService = {
      getByIdOrThrow: jest.fn(async (id: string) => ({
        id,
        region: null,
      })),
    };
    service = new CallingService(
      dataSource as never,
      callRepo as unknown as Repository<CallSession>,
      matchingService as never,
      livekit as unknown as LivekitRoomPort,
      configStub,
      userService as never,
      redis as never,
      metrics as never,
    );
  });

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  describe('joinCall', () => {
    it('tạo call mới + mint token đúng room/identity — client không tự chọn', async () => {
      const result = await service.joinCall(me, 'session-1');
      expect(result.call.roomName).toBe(callRoomName(result.call.id));
      expect(livekit.mintJoinToken).toHaveBeenCalledWith(
        result.call.roomName,
        me.userId,
        120,
      );
      expect(result.livekitUrl).toBe('ws://localhost:7880');
    });

    it('session không tồn tại / không phải member → CÙNG 404 (chống oracle)', async () => {
      matchingService.findSessionById.mockResolvedValue(null);
      expectDomainError(
        await service.joinCall(me, 'session-1').catch((e) => e),
        CallingErrors.SESSION_NOT_FOUND,
      );
      matchingService.findSessionById.mockResolvedValue(
        makeVoiceSession({ userAId: 'x', userBId: 'y' }),
      );
      expectDomainError(
        await service.joinCall(me, 'session-1').catch((e) => e),
        CallingErrors.SESSION_NOT_FOUND,
      );
    });

    it('session soul hoặc chưa confirmed → 409 SESSION_NOT_CALLABLE', async () => {
      matchingService.findSessionById.mockResolvedValue(
        makeVoiceSession({ matchType: MatchType.Soul }),
      );
      expectDomainError(
        await service.joinCall(me, 'session-1').catch((e) => e),
        CallingErrors.SESSION_NOT_CALLABLE,
      );
      matchingService.findSessionById.mockResolvedValue(
        makeVoiceSession({ status: MatchSessionStatus.PendingConfirm }),
      );
      expectDomainError(
        await service.joinCall(me, 'session-1').catch((e) => e),
        CallingErrors.SESSION_NOT_CALLABLE,
      );
    });

    it('re-join khi call đang tồn tại → lấy call cũ, token MỚI; call đã ended → 409', async () => {
      callRepo.findOneBy.mockResolvedValue(makeCall());
      const result = await service.joinCall(me, 'session-1');
      expect(result.call.id).toBe('call-id-1');
      expect(callRepo.save).not.toHaveBeenCalled();

      callRepo.findOneBy.mockResolvedValue(
        makeCall({ status: CallSessionStatus.Ended }),
      );
      expectDomainError(
        await service.joinCall(me, 'session-1').catch((e) => e),
        CallingErrors.CALL_ENDED,
      );
    });

    it('2 bên tạo call đồng thời — bên thua unique lấy call bên kia vừa tạo', async () => {
      callRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate'), { code: '23505' }),
      );
      const existing = makeCall();
      callRepo.findOneByOrFail.mockResolvedValue(existing);
      const result = await service.joinCall(me, 'session-1');
      expect(result.call).toBe(existing);
    });
  });

  describe('joinCall — chọn LiveKit URL theo region (GĐ7, ADR 0005)', () => {
    const REGION_URLS = JSON.stringify({
      SEA: 'wss://sea.livekit.example',
      EU: 'wss://eu.livekit.example',
    });

    function stubRegions(regionA: string | null, regionB: string | null): void {
      userService.getByIdOrThrow.mockImplementation(async (id: string) => ({
        id,
        region: id === me.userId ? regionA : regionB,
      }));
    }

    beforeEach(() => {
      CONFIG.LIVEKIT_REGION_URLS = REGION_URLS;
    });
    afterEach(() => {
      CONFIG.LIVEKIT_REGION_URLS = ''; // trả lại default single-region cho test khác
    });

    it('map rỗng (single-region hôm nay) → trả LIVEKIT_URL, KHÔNG query region — y hệt trước', async () => {
      CONFIG.LIVEKIT_REGION_URLS = '';
      const result = await service.joinCall(me, 'session-1');
      expect(result.livekitUrl).toBe('ws://localhost:7880');
      expect(userService.getByIdOrThrow).not.toHaveBeenCalled();
    });

    it('2 bên cùng region có trong map → URL của region đó (theo userA — tất định)', async () => {
      stubRegions('SEA', 'SEA');
      const result = await service.joinCall(me, 'session-1');
      expect(result.livekitUrl).toBe('wss://sea.livekit.example');
    });

    it('region không có trong map → fallback LIVEKIT_URL', async () => {
      stubRegions('NA', 'NA');
      const result = await service.joinCall(me, 'session-1');
      expect(result.livekitUrl).toBe('ws://localhost:7880');
    });

    it('2 bên lệch region → KHÔNG throw, dùng region userA (defensive — matching shard theo region nên đây là edge hiếm)', async () => {
      stubRegions('EU', 'SEA');
      const result = await service.joinCall(me, 'session-1');
      expect(result.livekitUrl).toBe('wss://eu.livekit.example');
      expect(result.token).toBeDefined(); // call vẫn join bình thường
    });

    it('lookup region lỗi → fallback LIVEKIT_URL, join KHÔNG bị chặn', async () => {
      userService.getByIdOrThrow.mockRejectedValue(new Error('db down'));
      const result = await service.joinCall(me, 'session-1');
      expect(result.livekitUrl).toBe('ws://localhost:7880');
      expect(result.token).toBeDefined();
    });
  });

  describe('handleWebhookEvent — idempotent với retry/out-of-order', () => {
    it('room không phải call-* hoặc không có call → bỏ qua', async () => {
      await service.handleWebhookEvent({
        event: 'participant_joined',
        roomName: 'party-1',
        participantIdentity: me.userId,
      });
      await service.handleWebhookEvent({
        event: 'participant_joined',
        roomName: 'call-unknown',
        participantIdentity: me.userId,
      });
      expect(dataSource.transaction).not.toHaveBeenCalled();
    });

    it('participant_joined đủ 2 bên → active + startedAt (set-if-null)', async () => {
      const call = makeCall({ joinedAAt: new Date() });
      callRepo.findOneBy.mockResolvedValue(call);
      manager.findOne.mockResolvedValue(call);
      await service.handleWebhookEvent({
        event: 'participant_joined',
        roomName: call.roomName,
        participantIdentity: PARTNER_ID,
      });
      expect(call.status).toBe(CallSessionStatus.Active);
      expect(call.startedAt).not.toBeNull();
      expect(call.joinedBAt).not.toBeNull();
    });

    it('identity lạ → không ghi gì', async () => {
      const call = makeCall();
      callRepo.findOneBy.mockResolvedValue(call);
      manager.findOne.mockResolvedValue(call);
      await service.handleWebhookEvent({
        event: 'participant_joined',
        roomName: call.roomName,
        participantIdentity: 'user-x',
      });
      expect(manager.save).not.toHaveBeenCalled();
    });

    it('participant_left / room_finished → end completed', async () => {
      const call = makeCall({
        status: CallSessionStatus.Active,
        startedAt: new Date(Date.now() - 10_000),
      });
      callRepo.findOneBy.mockResolvedValue(call);
      manager.findOne.mockResolvedValue(call);
      await service.handleWebhookEvent({
        event: 'participant_left',
        roomName: call.roomName,
        participantIdentity: PARTNER_ID,
      });
      expect(call.status).toBe(CallSessionStatus.Ended);
      expect(call.endReason).toBe(CallEndReason.Completed);
      expect(call.durationSeconds).toBeGreaterThanOrEqual(9);
    });
  });

  describe('endById — idempotent + dọn room + realtime đúng 1 lần', () => {
    it('end lần đầu: deleteRoom + publish call.ended cho CẢ 2; end lặp: không bắn lại', async () => {
      const call = makeCall({
        status: CallSessionStatus.Active,
        startedAt: new Date(Date.now() - 65_000),
      });
      manager.findOne.mockResolvedValue(call);
      const first = await service.endById(call.id, CallEndReason.Completed);
      expect(first.justEnded).toBe(true);
      expect(livekit.deleteRoom).toHaveBeenCalledWith(call.roomName);
      expect(redis.publish).toHaveBeenCalledTimes(2);
      expect(metrics.recordEnded).toHaveBeenCalledTimes(1);
      expect(metrics.recordEnded).toHaveBeenCalledWith(CallEndReason.Completed);
      for (const [channel, raw] of redis.publish.mock.calls as [
        string,
        string,
      ][]) {
        expect([
          `realtime:user:${me.userId}`,
          `realtime:user:${PARTNER_ID}`,
        ]).toContain(channel);
        const envelope = JSON.parse(raw) as {
          event: string;
          data: { durationSeconds: number };
        };
        expect(envelope.event).toBe('call.ended');
        expect(envelope.data.durationSeconds).toBeGreaterThanOrEqual(64);
      }

      livekit.deleteRoom.mockClear();
      redis.publish.mockClear();
      metrics.recordEnded.mockClear();
      const second = await service.endById(call.id, CallEndReason.Completed);
      expect(second.justEnded).toBe(false);
      expect(livekit.deleteRoom).not.toHaveBeenCalled();
      expect(redis.publish).not.toHaveBeenCalled();
      expect(metrics.recordEnded).not.toHaveBeenCalled(); // idempotent — không đếm lặp
    });

    it('deleteRoom lỗi (room đã tự đóng) → vẫn end + vẫn publish (best-effort)', async () => {
      const call = makeCall({ status: CallSessionStatus.Active });
      manager.findOne.mockResolvedValue(call);
      livekit.deleteRoom.mockRejectedValue(new Error('room not found'));
      const result = await service.endById(call.id, CallEndReason.FreeLimit);
      expect(result.justEnded).toBe(true);
      expect(redis.publish).toHaveBeenCalledTimes(2);
      expect(metrics.recordEnded).toHaveBeenCalledWith(CallEndReason.FreeLimit);
    });
  });
});
