import {
  Inject,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource, In } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import type { CoreApiEnv } from '../../../config/env.validation';
import {
  MatchTicket,
  MatchTicketStatus,
} from '../entities/match-ticket.entity';
import { MatcherWakeup } from '../matcher-wakeup';
import type { MatchingQueuePort } from '../ports/matching-queue.port';
import {
  MATCHING_QUEUE,
  shardKeyOfTicket,
  ticketScore,
} from '../redis/matching-redis.provider';

/** Separate namespace from matching state; this cursor is disposable recovery metadata. */
const REPAIR_JOB = 'matching-queue-repair';
const REPAIR_CONCURRENCY = 8;

interface RepairCursor {
  at: string;
  id: string;
}

/** Revisit live tickets in bounded cycles, including after failover and process replacement. */
@Injectable()
export class QueueRepairService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(QueueRepairService.name);
  private readonly job = new ManagedInterval();
  private stopping = false;

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
    @Inject(MATCHING_QUEUE) private readonly queue: MatchingQueuePort,
    private readonly wakeup: MatcherWakeup,
  ) {}

  onApplicationBootstrap(): void {
    this.stopping = false;
    this.job.start(this.scheduler, {
      jobName: REPAIR_JOB,
      intervalMs: this.config.getOrThrow('MATCHING_QUEUE_REPAIR_INTERVAL_MS', {
        infer: true,
      }),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Matching queue repair failed',
      // Recovery must run even when no HTTP request has activated this process.
      clusterSingleton: { dataSource: this.dataSource },
    });
  }

  onApplicationShutdown(): void {
    this.stopping = true;
    this.job.stop();
  }

  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      const [checkpoint] = (await this.dataSource.query(
        'SELECT state FROM runtime_job_checkpoints WHERE job_key = $1',
        [REPAIR_JOB],
      )) as Array<{ state: RepairCursor | null }>;
      const cursor = checkpoint?.state;
      const batchSize = this.config.getOrThrow(
        'MATCHING_QUEUE_REPAIR_BATCH_SIZE',
        { infer: true },
      );
      const rows = (await this.dataSource.query(
        `SELECT id, enqueued_at::text AS at FROM match_tickets
          WHERE status = 'queued'
            AND enqueued_at >= clock_timestamp() - ($1::double precision * interval '1 second')
            ${cursor ? 'AND (enqueued_at, id) > ($3::timestamptz, $4::uuid)' : ''}
          ORDER BY enqueued_at, id LIMIT $2`,
        [
          this.config.getOrThrow('MATCHING_QUEUE_MAX_WAIT_SECONDS', {
            infer: true,
          }),
          batchSize,
          ...(cursor ? [cursor.at, cursor.id] : []),
        ],
      )) as RepairCursor[];
      let next = 0;
      let repaired = 0;
      let failures = 0;
      const tickets =
        rows.length === 0
          ? []
          : await this.dataSource.manager.find(MatchTicket, {
              where: {
                id: In(rows.map((row) => row.id)),
                status: MatchTicketStatus.Queued,
              },
            });
      const enqueued: MatchTicket[] = [];
      await Promise.all(
        Array.from(
          { length: Math.min(REPAIR_CONCURRENCY, tickets.length) },
          async () => {
            while (!this.stopping && next < tickets.length) {
              const ticket = tickets[next++];
              try {
                const shard = shardKeyOfTicket(ticket);
                await this.queue.enqueue(
                  shard,
                  String(ticketScore(ticket)),
                  ticket.id,
                  'NX',
                );
                enqueued.push(ticket);
              } catch {
                failures++;
              }
            }
          },
        ),
      );
      // Two batched DB reads per page, not two reads for every ticket.
      const refreshed =
        enqueued.length === 0
          ? []
          : await this.dataSource.manager.find(MatchTicket, {
              where: {
                id: In(enqueued.map((ticket) => ticket.id)),
                status: MatchTicketStatus.Queued,
              },
            });
      const freshById = new Map(refreshed.map((ticket) => [ticket.id, ticket]));
      next = 0;
      await Promise.all(
        Array.from(
          { length: Math.min(REPAIR_CONCURRENCY, enqueued.length) },
          async () => {
            while (!this.stopping && next < enqueued.length) {
              const ticket = enqueued[next++];
              const shard = shardKeyOfTicket(ticket);
              try {
                // Monotone refresh cannot overwrite a newer paid boost with an older score.
                const fresh = freshById.get(ticket.id);
                if (fresh) {
                  await this.queue.enqueue(
                    shard,
                    String(ticketScore(fresh)),
                    ticket.id,
                    'XX_LT',
                  );
                  await this.queue.markActive(shard);
                  repaired++;
                } else await this.queue.remove(shard, ticket.id);
              } catch {
                failures++;
              }
            }
          },
        ),
      );
      if (!this.stopping) {
        // Failed rows are revisited next cycle. Advancing through a failed Redis shard lets healthy
        // shards continue recovering; cursor persistence prevents leader turnover restarting at row 1.
        const state = rows.length === batchSize ? rows[rows.length - 1] : null;
        await this.dataSource.query(
          `INSERT INTO runtime_job_checkpoints (job_key, state) VALUES ($1, $2::jsonb)
           ON CONFLICT (job_key) DO UPDATE SET state = EXCLUDED.state, updated_at = now()`,
          [REPAIR_JOB, JSON.stringify(state)],
        );
      }
      if (repaired > 0) this.wakeup.notify();
      if (failures > 0)
        this.logger.warn(
          { failures },
          'Matching queue repair will retry failed tickets next cycle',
        );
      return repaired;
    }, 0);
  }
}
