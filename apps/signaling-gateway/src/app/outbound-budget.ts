import type { ServerResponse } from 'node:http';
import type { Socket } from 'socket.io';

interface OutboundPacket {
  data?: string | Buffer;
}

// Engine.IO packet type + largest WebSocket frame header. Conservative for polling too.
const FRAME_OVERHEAD = 15;

/** Process-local accounting, shared by all lazy connection trackers in this gateway. */
export class OutboundTotalBudget {
  packets = 0;
  bytes = 0;
  // Insertion order gives O(1) oldest-backlog selection, retaining no idle sockets.
  private readonly backlogs = new Set<OutboundBudget>();

  constructor(
    private readonly maxPackets: number,
    private readonly maxBytes: number,
    private readonly pressure: (result: 'evicted' | 'dropped') => void,
  ) {}

  fitsAlone(bytes: number): boolean {
    return this.maxPackets >= 1 && bytes <= this.maxBytes;
  }

  /** Bound eviction work per recipient; best-effort delivery can drop instead of scanning a pod. */
  makeRoom(bytes: number): boolean {
    if (!this.fitsAlone(bytes)) {
      this.pressure('dropped');
      return false;
    }
    for (let evicted = 0; evicted < 32; evicted++) {
      if (
        this.packets + 1 <= this.maxPackets &&
        this.bytes + bytes <= this.maxBytes
      )
        return true;
      const oldest = this.backlogs.values().next().value;
      if (!oldest) break;
      oldest.evict();
      this.pressure('evicted');
    }
    if (
      this.packets + 1 <= this.maxPackets &&
      this.bytes + bytes <= this.maxBytes
    )
      return true;
    this.pressure('dropped');
    return false;
  }

  update(
    owner: OutboundBudget,
    packets: number,
    bytes: number,
    active: boolean,
  ): void {
    this.packets += packets;
    this.bytes += bytes;
    if (active) this.backlogs.add(owner);
    else this.backlogs.delete(owner);
  }
}

/** Public Engine.IO events track queued AND in-flight writes without scanning its private buffer. */
export class OutboundBudget {
  private packets = 0;
  private bytes = 0;
  private readonly sizes = new WeakMap<OutboundPacket, number>();
  private readonly pendingWrites = new Set<() => void>();
  private reservation?: { bytes: number };
  private disposed = false;

  constructor(
    private readonly connection: Socket['conn'],
    private readonly total?: OutboundTotalBudget,
  ) {
    connection.on('packetCreate', this.onPacket);
    connection.on('flush', this.onFlush);
    connection.once('close', this.dispose);
  }

  static eventBytes(namespace: string, event: string, data: unknown): number {
    // Redis envelopes are JSON, so Socket.IO emits one non-binary EVENT packet, without an ACK id.
    return (
      Buffer.byteLength(`2${namespace},${JSON.stringify([event, data])}`) +
      FRAME_OVERHEAD
    );
  }

  allows(nextBytes: number, maxPackets: number, maxBytes: number): boolean {
    return this.packets + 1 <= maxPackets && this.bytes + nextBytes <= maxBytes;
  }

  /** Reserve BEFORE emit; packetCreate converts the reservation into the actual packet. */
  reserve(bytes: number): (() => void) | undefined {
    if (this.disposed || (this.total && !this.total.makeRoom(bytes))) return;
    // makeRoom may evict this connection if it already holds the oldest backlog.
    if (this.disposed) return;
    const reservation = { bytes };
    this.reservation = reservation;
    this.update(1, bytes);
    return () => {
      if (this.reservation !== reservation) return;
      this.reservation = undefined;
      this.update(-1, -bytes);
    };
  }

  evict(): void {
    // Release queued and in-flight accounting synchronously, even if close completes later.
    this.dispose();
    this.connection.close(true);
  }

  private update(packets: number, bytes: number): void {
    this.packets += packets;
    this.bytes += bytes;
    this.total?.update(this, packets, bytes, this.packets > 0);
  }

  private readonly onPacket = (packet: OutboundPacket): void => {
    const bytes =
      (typeof packet.data === 'string'
        ? Buffer.byteLength(packet.data)
        : (packet.data?.byteLength ?? 0)) + FRAME_OVERHEAD;
    this.sizes.set(packet, bytes);
    const reserved = this.reservation;
    this.reservation = undefined;
    this.update(reserved ? 0 : 1, bytes - (reserved?.bytes ?? 0));
  };

  private readonly onFlush = (batch: OutboundPacket[]): void => {
    let packets = 0;
    let bytes = 0;
    for (const packet of batch) {
      const size = this.sizes.get(packet);
      if (size === undefined) continue; // e.g. handshake queued before this tracker was attached
      packets++;
      bytes += size;
      this.sizes.delete(packet);
    }
    if (packets === 0) return;

    const transport = this.connection.transport;
    // Engine.IO's own 'drain' fires immediately after flush, NOT after writing to the network.
    // Polling transport's 'drain' also fires at res.end(); wait for the HTTP response's finish.
    const response =
      transport.name === 'polling'
        ? (transport as typeof transport & { res?: ServerResponse }).res
        : undefined;
    const writer = response ?? transport;
    const completed = response ? 'finish' : 'drain';
    const release = (): void => {
      if (!this.pendingWrites.delete(release)) return;
      writer.off(completed, release);
      writer.off('close', release);
      this.update(-packets, -bytes);
    };
    this.pendingWrites.add(release);
    writer.once(completed, release);
    writer.once('close', release);
  };

  private readonly dispose = (): void => {
    if (this.disposed) return;
    this.disposed = true;
    this.connection.off('packetCreate', this.onPacket);
    this.connection.off('flush', this.onFlush);
    this.connection.off('close', this.dispose);
    for (const release of this.pendingWrites) release();
    this.reservation = undefined;
    this.update(-this.packets, -this.bytes);
  };
}
