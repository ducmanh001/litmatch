import 'reflect-metadata';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { metrics } from '@opentelemetry/api';
import { Server } from 'socket.io';
import { io } from 'socket.io-client';

import { OutboundBudget } from './outbound-budget';
import { SignalingGateway } from './signaling.gateway';
import { SignalingMetrics } from './signaling.metrics';

import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Socket } from 'socket.io';
import type { SignalingEnv } from '../config/env.validation';
import type { ConnectionQuotaService } from './connection-quota.service';

async function fixture(users: string[], packets: number, bytes: number) {
  const http = createServer();
  const server = new Server(http);
  const namespace = server.of('/signaling');
  namespace.on('connection', (socket) => {
    void socket.join(`user:${socket.handshake.auth['user']}`);
  });
  const signalingMetrics = new SignalingMetrics(
    metrics.getMeter('aggregate-outbound-test'),
  );
  const gauges = jest.spyOn(signalingMetrics, 'bindOutboundGauges');
  const pressure = jest.spyOn(signalingMetrics, 'outboundPressure');
  const gateway = new SignalingGateway(
    {} as JwtService,
    {
      get: (key: string) =>
        (
          ({
            WS_OUTBOUND_TOTAL_MAX_PACKETS: packets,
            WS_OUTBOUND_TOTAL_MAX_BYTES: bytes,
          }) as Record<string, number>
        )[key],
    } as unknown as ConfigService<SignalingEnv, true>,
    {} as ConnectionQuotaService,
    signalingMetrics,
  );
  const total = gauges.mock.calls[0][0];
  Object.assign(gateway, { server: namespace });
  await new Promise<void>((resolve) => http.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${(http.address() as AddressInfo).port}/signaling`;
  const clients = users.map((user) =>
    io(url, {
      autoConnect: false,
      transports: ['websocket'],
      reconnection: false,
      forceNew: true,
      auth: { user },
    }),
  );
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
  const sockets = clients.map(
    (client) => namespace.sockets.get(client.id ?? '') as Socket,
  );
  return {
    clients,
    sockets,
    total,
    pressure,
    relay: (user: string, data: string) =>
      gateway.relay(
        `realtime:user:${user}`,
        JSON.stringify({ event: 'test.event', data }),
      ),
    close: async () => {
      for (const client of clients) client.disconnect();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe('aggregate outbound admission (real Socket.IO / Engine.IO)', () => {
  it.each(['packets', 'bytes'] as const)(
    'bounds global %s across distinct users, evicts backlog, and serves the healthy recipient',
    async (limit) => {
      const data = `0:${'x'.repeat(16 * 1024)}`;
      const eventBytes = OutboundBudget.eventBytes(
        '/signaling',
        'test.event',
        data,
      );
      const maxPackets = limit === 'packets' ? 3 : 128;
      const maxBytes = limit === 'bytes' ? 3 * eventBytes : 1_048_576;
      const test = await fixture(
        ['slow-0', 'slow-1', 'slow-2', 'healthy'],
        maxPackets,
        maxBytes,
      );
      try {
        for (let i = 0; i < 3; i++) {
          test.sockets[i].conn.transport.writable = false;
          test.relay(`slow-${i}`, `${i}:${'x'.repeat(16 * 1024)}`);
          expect(test.total.packets).toBe(i + 1);
          expect(test.total.bytes).toBe((i + 1) * eventBytes);
        }
        const received = new Promise<string>((resolve) =>
          test.clients[3].once('test.event', resolve),
        );
        test.relay('healthy', data);
        expect(test.sockets[0].conn.readyState).toBe('closed');
        expect(test.pressure).toHaveBeenCalledWith('evicted');
        expect(test.total.packets).toBeLessThanOrEqual(maxPackets);
        expect(test.total.bytes).toBeLessThanOrEqual(maxBytes);
        expect(await received).toBe(data);
        expect(test.clients[3].connected).toBe(true);
        // Independent disconnect releases the queued, never-flushed bytes immediately.
        const disconnected = new Promise<void>((resolve) =>
          test.sockets[1].conn.once('close', () => resolve()),
        );
        test.clients[1].disconnect();
        await disconnected;
        expect(test.total.packets).toBe(1);
        expect(test.total.bytes).toBe(eventBytes);
      } finally {
        await test.close();
      }
      expect(test.total.packets).toBe(0);
      expect(test.total.bytes).toBe(0);
      for (const socket of test.sockets) {
        expect(socket.conn.listenerCount('packetCreate')).toBe(0);
        expect(socket.conn.listenerCount('flush')).toBe(0);
      }
    },
  );

  it('reserves for each recipient in the same room instead of admitting the whole room against one snapshot', async () => {
    const test = await fixture(['same-user', 'same-user'], 1, 1_048_576);
    try {
      test.sockets[0].conn.transport.writable = false;
      const received = new Promise<string>((resolve) =>
        test.clients[1].once('test.event', resolve),
      );
      test.relay('same-user', 'first event');
      expect(test.sockets[0].conn.readyState).toBe('closed');
      expect(test.total.packets).toBeLessThanOrEqual(1);
      expect(await received).toBe('first event');
      expect(test.clients[1].connected).toBe(true);
    } finally {
      await test.close();
    }
    expect(test.total.packets).toBe(0);
    expect(test.total.bytes).toBe(0);
  });

  it('drops an event larger than the aggregate budget without disconnecting backlog owners', async () => {
    const test = await fixture(['slow-0', 'slow-1', 'healthy'], 128, 1024);
    try {
      for (let i = 0; i < 2; i++) {
        test.sockets[i].conn.transport.writable = false;
        test.relay(`slow-${i}`, `pending-${i}`);
      }
      const before = { packets: test.total.packets, bytes: test.total.bytes };
      const received = jest.fn();
      test.clients[2].on('test.event', received);
      test.relay('healthy', 'x'.repeat(2048));
      expect(test.pressure).toHaveBeenCalledWith('dropped');
      expect(test.pressure).not.toHaveBeenCalledWith('evicted');
      expect(test.total.packets).toBe(before.packets);
      expect(test.total.bytes).toBe(before.bytes);
      expect(
        test.sockets.every((socket) => socket.conn.readyState === 'open'),
      ).toBe(true);
      // This following event is an ordering barrier proving the oversized event was not emitted.
      const barrier = new Promise<string>((resolve) =>
        test.clients[2].once('test.event', resolve),
      );
      test.relay('healthy', 'barrier');
      expect(await barrier).toBe('barrier');
      expect(received).toHaveBeenCalledTimes(1);
    } finally {
      await test.close();
    }
  });
});
