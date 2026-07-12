import { SignalingGateway } from './signaling.gateway';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';

import type { SignalingEnv } from '../config/env.validation';

function makeGateway(verifyImpl?: jest.Mock): {
  gateway: SignalingGateway;
  emit: jest.Mock;
  to: jest.Mock;
} {
  const jwtService = {
    verifyAsync:
      verifyImpl ?? jest.fn(async () => ({ sub: 'user-1', isGuest: false })),
  } as unknown as JwtService;
  const config = {
    getOrThrow: (key: string) => {
      if (key === 'REDIS_URL') return 'redis://localhost:6379';
      throw new Error(`missing config ${key}`);
    },
  } as unknown as ConfigService<SignalingEnv, true>;
  const gateway = new SignalingGateway(jwtService, config);
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  // gán server mock (bình thường do @WebSocketServer inject sau afterInit)
  Object.assign(gateway, { server: { to } });
  return { gateway, emit, to };
}

function makeSocket(token?: unknown): Socket {
  return {
    handshake: { auth: token === undefined ? {} : { token } },
    data: {},
  } as unknown as Socket;
}

describe('SignalingGateway (unit — fanout thuần, không business logic)', () => {
  describe('authenticate — JWT lúc handshake', () => {
    it('token hợp lệ → gán userId từ payload.sub vào socket.data', async () => {
      const { gateway } = makeGateway();
      const socket = makeSocket('valid-token');
      await gateway.authenticate(socket);
      expect((socket.data as { userId?: string }).userId).toBe('user-1');
    });

    it.each([
      ['thiếu token', undefined],
      ['token rỗng', ''],
      ['token không phải string', 123],
    ])('%s → từ chối UNAUTHORIZED', async (_label, token) => {
      const { gateway } = makeGateway();
      await expect(gateway.authenticate(makeSocket(token))).rejects.toThrow(
        'UNAUTHORIZED',
      );
    });

    it('token giả/hết hạn (verify throw) → UNAUTHORIZED, không gán userId', async () => {
      const { gateway } = makeGateway(
        jest.fn(async () => {
          throw new Error('jwt expired');
        }),
      );
      const socket = makeSocket('expired');
      await expect(gateway.authenticate(socket)).rejects.toThrow(
        'UNAUTHORIZED',
      );
      expect((socket.data as { userId?: string }).userId).toBeUndefined();
    });
  });

  describe('relay — Redis pmessage → đúng room user, payload nguyên văn', () => {
    it('channel realtime:user:{id} → emit(event, data) vào room user:{id}', () => {
      const { gateway, emit, to } = makeGateway();
      gateway.relay(
        'realtime:user:user-9',
        JSON.stringify({ event: 'soul.message', data: { sessionId: 's1' } }),
      );
      expect(to).toHaveBeenCalledWith('user:user-9');
      expect(emit).toHaveBeenCalledWith('soul.message', { sessionId: 's1' });
    });

    it('channel lạ → bỏ qua, không emit', () => {
      const { gateway, emit } = makeGateway();
      gateway.relay('khac:user:user-9', JSON.stringify({ event: 'x' }));
      expect(emit).not.toHaveBeenCalled();
    });

    it('payload không phải JSON hoặc thiếu event → bỏ qua, không crash', () => {
      const { gateway, emit } = makeGateway();
      gateway.relay('realtime:user:user-9', 'not-json{');
      gateway.relay('realtime:user:user-9', JSON.stringify({ data: 1 }));
      expect(emit).not.toHaveBeenCalled();
    });
  });

  it('ping trả pong (giữ smoke test skeleton)', () => {
    const { gateway } = makeGateway();
    expect(gateway.ping()).toEqual({ event: 'pong', data: 'pong' });
  });
});
