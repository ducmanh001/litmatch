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
  };

  constructor(@Inject(METRICS_METER) meter: Meter) {
    this.connections = meter.createUpDownCounter(
      'signaling_connections_active',
      {
        description: 'Socket.IO connection đang mở trên pod này',
      },
    );
    this.relayEvents = meter.createCounter('signaling_relay_events_total', {
      description:
        'Event Redis pod nhận, theo kết quả: delivered | no_local_room | invalid',
    });
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
  }): void {
    this.gaugeSources.fanoutUsers = sources.fanoutUsers;
    this.gaugeSources.trackedLeases = sources.trackedLeases;
    this.gaugeSources.shardsReady = sources.shardsReady;
    this.gaugeSources.shardsTotal = sources.shardsTotal;
  }

  connectionOpened(): void {
    this.safe(() => this.connections.add(1));
  }

  connectionClosed(): void {
    this.safe(() => this.connections.add(-1));
  }

  relay(result: RelayResult): void {
    this.safe(() => this.relayEvents.add(1, { result }));
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
