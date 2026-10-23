import { Inject, Injectable } from '@nestjs/common';

import { METRICS_METER } from './metrics.constants';

import type { Counter, Meter, UpDownCounter } from '@opentelemetry/api';

export type RelayResult = 'delivered' | 'no_local_room' | 'invalid';

/**
 * Metric vận hành của gateway — đủ để autoscale theo số kết nối thật (thay vì CPU/RAM) và để thấy
 * sớm khi fanout/lease có vấn đề. Mọi hàm đều không throw: metric hỏng không được phá luồng realtime.
 */
@Injectable()
export class SignalingMetrics {
  private readonly connections: UpDownCounter;
  private readonly relayEvents: Counter;
  private readonly slowConsumers: Counter;
  private readonly outboundPressureEvents: Counter;
  private readonly outboundPackets: ReturnType<Meter['createObservableGauge']>;
  private readonly outboundBytes: ReturnType<Meter['createObservableGauge']>;
  private outboundSource = { packets: 0, bytes: 0 };
  private readonly leaseRefreshes: Counter;
  private readonly fanoutUsers: ReturnType<Meter['createObservableGauge']>;
  private readonly trackedLeases: ReturnType<Meter['createObservableGauge']>;
  private readonly shardsReady: ReturnType<Meter['createObservableGauge']>;
  private readonly shardsTotal: ReturnType<Meter['createObservableGauge']>;
  private readonly gaugeSources = {
    fanoutUsers: () => 0,
    trackedLeases: () => 0,
    shardsReady: () => 0,
    shardsTotal: () => 0,
    reservedConnections: () => 0,
    pendingHandshakes: () => 0,
  };

  constructor(@Inject(METRICS_METER) meter: Meter) {
    meter
      .createObservableGauge('signaling_connections_reserved', {
        description:
          'Authenticated plus pending namespace admissions on this process',
      })
      .addCallback((result) =>
        result.observe(this.gaugeSources.reservedConnections()),
      );
    meter
      .createObservableGauge('signaling_handshakes_inflight', {
        description:
          'Admission chains awaiting JWT, quota or fanout completion',
      })
      .addCallback((result) =>
        result.observe(this.gaugeSources.pendingHandshakes()),
      );
    this.connections = meter.createUpDownCounter(
      'signaling_connections_active',
      {
        description: 'Socket.IO connection đang mở trên pod này',
      },
    );
    this.relayEvents = meter.createCounter('signaling_relay_events_total', {
      description:
        'Redis relay result: delivered = local emit, not client acknowledgement; no_local_room | invalid',
    });
    this.slowConsumers = meter.createCounter('signaling_slow_consumers_total', {
      description:
        'Local transports closed before an outbound packet/byte budget would be exceeded',
    });
    this.outboundPressureEvents = meter.createCounter(
      'signaling_outbound_pressure_total',
      {
        description: 'Aggregate outbound pressure outcomes: evicted | dropped',
      },
    );
    this.outboundPackets = meter.createObservableGauge(
      'signaling_outbound_packets',
      { description: 'Queued and in-flight packets tracked on this pod' },
    );
    this.outboundPackets.addCallback((result) =>
      result.observe(this.outboundSource.packets),
    );
    this.outboundBytes = meter.createObservableGauge(
      'signaling_outbound_bytes',
      {
        description: 'Conservative encoded bytes tracked on this pod, not RSS',
      },
    );
    this.outboundBytes.addCallback((result) =>
      result.observe(this.outboundSource.bytes),
    );
    this.leaseRefreshes = meter.createCounter('signaling_lease_refresh_total', {
      description:
        'Lần gia hạn lease quota/presence, theo kết quả: ok | reacquired | lost | error',
    });
    this.fanoutUsers = meter.createObservableGauge(
      'signaling_fanout_subscribed_users',
      { description: 'Số user pod này đang SUBSCRIBE riêng trên Redis' },
    );
    this.fanoutUsers.addCallback((result) =>
      result.observe(this.gaugeSources.fanoutUsers()),
    );
    this.trackedLeases = meter.createObservableGauge(
      'signaling_tracked_leases',
      { description: 'Số lease pod này đang tự gia hạn' },
    );
    this.trackedLeases.addCallback((result) =>
      result.observe(this.gaugeSources.trackedLeases()),
    );
    this.shardsReady = meter.createObservableGauge(
      'signaling_redis_shards_ready',
      {
        description:
          'Số Redis shard realtime đang phục vụ được (cả lease lẫn subscribe) — thấp hơn total = một phần user fail closed lúc handshake',
      },
    );
    this.shardsReady.addCallback((result) =>
      result.observe(this.gaugeSources.shardsReady()),
    );
    this.shardsTotal = meter.createObservableGauge(
      'signaling_redis_shards_total',
      { description: 'Tổng số Redis shard realtime được cấu hình' },
    );
    this.shardsTotal.addCallback((result) =>
      result.observe(this.gaugeSources.shardsTotal()),
    );
  }

  /** Gateway đăng ký nguồn số liệu cho gauge sau khi dựng xong fanout/refresher. */
  bindGauges(sources: {
    fanoutUsers(): number;
    trackedLeases(): number;
    shardsReady(): number;
    shardsTotal(): number;
    reservedConnections(): number;
    pendingHandshakes(): number;
  }): void {
    this.gaugeSources.fanoutUsers = sources.fanoutUsers;
    this.gaugeSources.trackedLeases = sources.trackedLeases;
    this.gaugeSources.shardsReady = sources.shardsReady;
    this.gaugeSources.shardsTotal = sources.shardsTotal;
    this.gaugeSources.reservedConnections = sources.reservedConnections;
    this.gaugeSources.pendingHandshakes = sources.pendingHandshakes;
  }

  connectionOpened(): void {
    this.safe(() => this.connections.add(1));
  }

  bindOutboundGauges(source: { packets: number; bytes: number }): void {
    this.outboundSource = source;
  }

  outboundPressure(result: 'evicted' | 'dropped'): void {
    this.safe(() => this.outboundPressureEvents.add(1, { result }));
  }

  connectionClosed(): void {
    this.safe(() => this.connections.add(-1));
  }

  relay(result: RelayResult): void {
    this.safe(() => this.relayEvents.add(1, { result }));
  }

  slowConsumer(): void {
    this.safe(() => this.slowConsumers.add(1));
  }

  leaseRefresh(
    result: 'ok' | 'lost' | 'error' | 'reacquired',
    count: number,
  ): void {
    this.safe(() => this.leaseRefreshes.add(count, { result }));
  }

  private safe(record: () => void): void {
    try {
      record();
    } catch {
      // metric là best-effort
    }
  }
}
