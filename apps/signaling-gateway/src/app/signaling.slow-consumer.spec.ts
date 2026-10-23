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
import type { Socket } from 'socket.io';
import type { SignalingEnv } from '../config/env.validation';
import type { ConnectionQuotaService } from './connection-quota.service';

describe('outbound slow consumers (real Socket.IO / Engine.IO)', () => {
  it.each([
    {
      limit: 'packets',
      packets: 4,
      bytes: 1_048_576,
      data: 'hello',
      inFlight: false,
    },
    {
      limit: 'bytes',
      packets: 128,
      bytes: 1024,
      data: '🙂'.repeat(80),
      inFlight: false,
    },
    {
      limit: 'in-flight packets',
      packets: 1,
      bytes: 1_048_576,
      data: 'hello',
      inFlight: true,
    },
    {
      limit: 'oversized event',
      packets: 128,
      bytes: 1024,
      data: '🙂'.repeat(300),
      inFlight: false,
    },
  ])(
    'bounds $limit while a healthy neighbor receives eligible events',
    async ({ packets, bytes, data, inFlight }) => {
      const http = createServer();
      const server = new Server(http);
      const namespace = server.of('/signaling');
      namespace.on('connection', (socket) => void socket.join('user:user-1'));
      const gateway = new SignalingGateway(
        {} as JwtService,
        {
          get: (key: string) =>
            (
              ({
                WS_OUTBOUND_MAX_PACKETS: packets,
                WS_OUTBOUND_MAX_BYTES: bytes,
              }) as Record<string, number>
            )[key],
        } as unknown as ConfigService<SignalingEnv, true>,
        {} as ConnectionQuotaService,
        new SignalingMetrics(metrics.getMeter('slow-consumer-test')),
      );
      Object.assign(gateway, { server: namespace });
      await new Promise<void>((resolve) =>
        http.listen(0, '127.0.0.1', resolve),
      );
      const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/signaling`;
      const clients = [0, 1].map(() =>
        io(url, {
          autoConnect: false,
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
        }),
      );
      try {
        await Promise.all(
          clients.map(
            (client) =>
              new Promise<void>((resolve, reject) => {
                client.once('connect', resolve);
                client.once('connect_error', reject);
                client.connect();
              }),
          ),
        );
        const slow = namespace.sockets.get(clients[0].id ?? '') as Socket;
        const queue = () =>
          (slow.conn as unknown as { writeBuffer: { data?: string }[] })
            .writeBuffer;
        // Deterministic blocked Engine.IO writer: no timer or OS send-buffer size assumptions.
        if (inFlight) {
          // Engine.IO flush empties writeBuffer before transport completion. Simulate a writer
          // that has accepted that batch but cannot finish it (and never signals drain/ready).
          slow.conn.transport.send = () => {
            slow.conn.transport.writable = false;
          };
        } else {
          slow.conn.transport.writable = false;
        }
        let peakPackets = 0;
        let peakBytes = 0;
        const disconnectReason = new Promise<string>((resolve) =>
          clients[0].once('disconnect', resolve),
        );
        if (Buffer.byteLength(data) > bytes) {
          const oversized = JSON.stringify({ event: 'test.event', data });
          gateway.relay('realtime:user:user-1', oversized);
          expect(queue()).toHaveLength(0);
          expect(slow.conn.readyState).toBe('closed');
          expect(await disconnectReason).toBe('transport close');
          return;
        }
        for (let i = 0; i < 20; i++) {
          const received = new Promise<unknown>((resolve) =>
            clients[1].once('test.event', resolve),
          );
          gateway.relay(
            'realtime:user:user-1',
            JSON.stringify({ event: 'test.event', data }),
          );
          peakPackets = Math.max(peakPackets, queue().length);
          peakBytes = Math.max(
            peakBytes,
            queue().reduce(
              (sum, packet) => sum + Buffer.byteLength(packet.data ?? '') + 15,
              0,
            ),
          );
          expect(await received).toBe(data);
        }
        expect(slow.conn.readyState).toBe('closed');
        expect(peakPackets).toBeLessThanOrEqual(packets);
        expect(peakBytes).toBeLessThanOrEqual(bytes);
        if (inFlight) expect(peakPackets).toBe(0);
        expect(await disconnectReason).toBe('transport close');
        expect(clients[1].connected).toBe(true);
        expect(namespace.adapter.rooms.get('user:user-1')?.size).toBe(1);
      } finally {
        for (const client of clients) client.disconnect();
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    },
  );
});
