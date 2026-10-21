import { EventEmitter } from 'node:events';
import type { Socket } from 'socket.io';

import { OutboundBudget, OutboundTotalBudget } from './outbound-budget';

function fixture(polling = false, total?: OutboundTotalBudget) {
  const response = new EventEmitter();
  const transport = Object.assign(new EventEmitter(), {
    name: polling ? 'polling' : 'websocket',
    res: polling ? response : undefined,
  });
  const connection = Object.assign(new EventEmitter(), {
    transport,
    close: jest.fn(),
  });
  const budget = new OutboundBudget(
    connection as unknown as Socket['conn'],
    total,
  );
  const packet = { data: '2/signaling,["event","🙂"]' };
  const bytes = Buffer.byteLength(packet.data) + 15;
  return { connection, transport, response, budget, packet, bytes };
}

describe('OutboundBudget', () => {
  it('counts UTF-8 and includes the next packet, even when there is no queue yet', () => {
    const { budget, connection, packet, bytes } = fixture();
    expect(OutboundBudget.eventBytes('/signaling', 'event', '🙂')).toBe(bytes);
    expect(budget.allows(bytes, 1, bytes - 1)).toBe(false);
    expect(budget.allows(bytes, 1, bytes)).toBe(true);
    connection.emit('packetCreate', packet);
    expect(budget.allows(bytes, 2, 2 * bytes - 1)).toBe(false);
    expect(budget.allows(bytes, 1, 2 * bytes)).toBe(false);
    expect(budget.allows(bytes, 2, 2 * bytes)).toBe(true);
  });

  it('retains in-flight bytes through Engine.IO drain until the WebSocket writer drains', () => {
    const { budget, connection, transport, packet, bytes } = fixture();
    connection.emit('packetCreate', packet);
    connection.emit('flush', [packet]);
    connection.emit('drain');
    expect(budget.allows(bytes, 1, bytes)).toBe(false);
    transport.emit('drain');
    expect(budget.allows(bytes, 1, bytes)).toBe(true);
    expect(transport.listenerCount('close')).toBe(0);
  });

  it('retains polling writes after transport drain until HTTP finish, and cleans listeners', () => {
    const { budget, connection, transport, response, packet, bytes } =
      fixture(true);
    connection.emit('packetCreate', packet);
    connection.emit('flush', [packet]);
    transport.emit('drain');
    expect(budget.allows(bytes, 1, bytes)).toBe(false);
    response.emit('finish');
    response.emit('close'); // must not decrement twice
    expect(budget.allows(bytes, 1, bytes)).toBe(true);
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('cleans all in-flight and queued state on close, including across a transport upgrade', () => {
    const total = new OutboundTotalBudget(10, 1024, jest.fn());
    const { connection, transport, response, packet } = fixture(true, total);
    connection.emit('packetCreate', packet);
    connection.emit('flush', [packet]);
    const upgraded = Object.assign(new EventEmitter(), {
      name: 'websocket',
      res: undefined,
    });
    connection.transport = upgraded;
    const next = { data: 'later' };
    connection.emit('packetCreate', next);
    connection.emit('flush', [next]);
    connection.emit('packetCreate', { data: 'unflushed' });
    expect(total.packets).toBe(3);
    connection.emit('close');
    response.emit('finish');
    upgraded.emit('drain');
    expect(total.packets).toBe(0);
    expect(total.bytes).toBe(0);
    expect(connection.listenerCount('close')).toBe(0);
    expect(connection.listenerCount('flush')).toBe(0);
    expect(connection.listenerCount('packetCreate')).toBe(0);
    expect(transport.listenerCount('drain')).toBe(0);
    expect(upgraded.listenerCount('drain')).toBe(0);
    expect(upgraded.listenerCount('close')).toBe(0);
    expect(response.listenerCount('finish')).toBe(0);
    expect(response.listenerCount('close')).toBe(0);
  });

  it('reserves each future recipient before enqueue and converts its reservation exactly once', () => {
    const total = new OutboundTotalBudget(2, 1024, jest.fn());
    const a = fixture(false, total);
    const b = fixture(false, total);
    const cancelA = a.budget.reserve(a.bytes);
    const cancelB = b.budget.reserve(b.bytes);
    expect(total.packets).toBe(2);
    expect(total.bytes).toBe(a.bytes + b.bytes);
    a.connection.emit('packetCreate', a.packet);
    cancelA?.(); // consumed; must not release the actual queued packet
    expect(total.packets).toBe(2);
    cancelB?.(); // emit did not enqueue
    cancelB?.();
    expect(total.packets).toBe(1);
    expect(total.bytes).toBe(a.bytes);
    a.connection.emit('close');
    expect(total.packets).toBe(0);
    expect(total.bytes).toBe(0);
  });

  it('evicts only backlog owners, frees unflushed packets, and never retains drained sockets', () => {
    const pressure = jest.fn();
    const total = new OutboundTotalBudget(1, 1024, pressure);
    const idle = fixture(false, total);
    idle.connection.emit('packetCreate', idle.packet);
    idle.connection.emit('flush', [idle.packet]);
    idle.transport.emit('drain');
    const slow = fixture(false, total);
    slow.connection.emit('packetCreate', slow.packet);
    const next = fixture(false, total);
    const cancel = next.budget.reserve(next.bytes);
    expect(cancel).toBeDefined();
    expect(idle.connection.close).not.toHaveBeenCalled();
    expect(slow.connection.close).toHaveBeenCalledWith(true);
    expect(slow.connection.listenerCount('packetCreate')).toBe(0);
    expect(total.packets).toBe(1);
    expect(pressure).toHaveBeenCalledWith('evicted');
    cancel?.();
    expect(total.packets).toBe(0);
    expect(total.bytes).toBe(0);
    idle.connection.emit('close');
    next.connection.emit('close');
  });

  it('drops an impossible event without eviction and bounds eviction work for a large event', () => {
    const pressure = jest.fn();
    const total = new OutboundTotalBudget(100, 4096, pressure);
    const holders = Array.from({ length: 40 }, () => fixture(false, total));
    for (const holder of holders)
      holder.connection.emit('packetCreate', holder.packet);
    expect(total.makeRoom(4097)).toBe(false);
    expect(
      holders.every(
        (holder) => holder.connection.close.mock.calls.length === 0,
      ),
    ).toBe(true);
    expect(total.makeRoom(4096)).toBe(false);
    expect(
      holders.filter((holder) => holder.connection.close.mock.calls.length > 0),
    ).toHaveLength(32);
    expect(pressure).toHaveBeenCalledWith('dropped');
    for (const holder of holders) holder.connection.emit('close');
    expect(total.packets).toBe(0);
    expect(total.bytes).toBe(0);
  });
});
