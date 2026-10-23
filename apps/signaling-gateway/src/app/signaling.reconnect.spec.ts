import 'reflect-metadata';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { metrics } from '@opentelemetry/api';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

import { SignalingGateway } from './signaling.gateway';
import { SignalingMetrics } from './signaling.metrics';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Namespace } from 'socket.io';
import type { SignalingEnv } from '../config/env.validation';
import type { ConnectionQuotaService } from './connection-quota.service';

/** Real Socket.IO transport and namespace admission; Redis/lease scheduling are deterministic seams. */
function gatewayFor(server: Namespace) {
  const expire = new Map<string, () => void>();
  const quota = {
    acquire: jest.fn(async () => true),
    release: jest.fn(async () => undefined),
    releaseMany: jest.fn(async () => undefined),
  };
  const gateway = new SignalingGateway(
    { verifyAsync: async () => ({ sub: 'user-1' }) } as unknown as JwtService,
    { get: () => undefined } as unknown as ConfigService<SignalingEnv, true>,
    quota as unknown as ConnectionQuotaService,
    new SignalingMetrics(metrics.getMeter('reconnect-test')),
  );
  Object.assign(gateway, {
    server,
    fanout: {
      subscribeUser: async () => undefined,
      releaseUser: () => undefined,
      beginClose: () => undefined,
      close: async () => undefined,
    },
    refresher: {
      add: (id: string, _user: string, callback: () => void) =>
        expire.set(id, callback),
      remove: (id: string) => expire.delete(id),
      stop: () => undefined,
    },
  });
  return { gateway, expire, quota };
}

describe('recoverable gateway disconnect (real Socket.IO, no Redis)', () => {
  it.each(['lease expiry', 'rollout'] as const)(
    '%s reconnects and reacquires admission without a page remount',
    async (cause) => {
      const http = createServer();
      const server = new Server(http);
      const namespace = server.of('/signaling');
      const first = gatewayFor(namespace);
      let current = first;
      namespace.use((socket, next) => {
        void current.gateway.admit(socket).then(() => next(), next);
      });
      namespace.on('connection', (socket) => {
        const owner = current.gateway;
        owner.handleConnection(socket);
        socket.on('disconnect', () => owner.handleDisconnect(socket));
      });
      await new Promise<void>((resolve) =>
        http.listen(0, '127.0.0.1', resolve),
      );
      const client = io(
        `http://127.0.0.1:${(http.address() as AddressInfo).port}/signaling`,
        {
          autoConnect: false,
          transports: ['websocket'],
          auth: { token: 'verified-at-seam' },
          reconnectionDelay: 10,
          reconnectionDelayMax: 20,
          randomizationFactor: 0,
        },
      );
      try {
        const firstConnect = new Promise<void>((resolve) =>
          client.once('connect', resolve),
        );
        client.connect();
        await firstConnect;
        const oldId = client.id;
        const disconnected = new Promise<string>((resolve) =>
          client.once('disconnect', resolve),
        );
        const reconnected = new Promise<void>((resolve) =>
          client.once('connect', resolve),
        );
        if (cause === 'rollout') {
          // The same endpoint now routes admission to a healthy replacement gateway.
          current = gatewayFor(namespace);
          await first.gateway.onModuleDestroy();
        } else {
          const expire = [...first.expire.values()][0];
          expect(expire).toBeDefined();
          expire();
        }
        expect(await disconnected).toBe('transport close');
        await reconnected;
        expect(client.connected).toBe(true);
        expect(client.id).not.toBe(oldId);
        expect(namespace.adapter.rooms.get('user:user-1')?.size).toBe(1);
        if (cause === 'rollout') {
          expect(first.quota.releaseMany).toHaveBeenCalledTimes(1);
          expect(current.quota.acquire).toHaveBeenCalledTimes(1);
        } else {
          expect(first.quota.release).toHaveBeenCalledTimes(1);
          expect(first.quota.acquire).toHaveBeenCalledTimes(2);
        }
      } finally {
        client.disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
