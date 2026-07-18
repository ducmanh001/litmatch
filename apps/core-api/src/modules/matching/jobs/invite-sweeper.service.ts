import {
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';

import { ManagedInterval } from '../../../common/scheduling/managed-interval';
import { MatchInviteStatus } from '../entities/match-invite.entity';

import type { CoreApiEnv } from '../../../config/env.validation';

const INVITE_SWEEPER_JOB = 'matching-invite-sweeper';

/**
 * Dọn invite Pending quá hạn → Expired (docs/services/matching-service.md § Invite) — housekeeping
 * cho `listReceivedInvites` (chỉ hiện Pending) và giải phóng `uq_match_invites_pending_pair` cho
 * cặp mời lại. KHÔNG phải chốt correctness: `accept`/`decline`/`cancel` đều tự lazy-expire tại
 * thời điểm hành động (`InviteService.assertNotExpired`), sweeper chỉ dọn rác không ai đụng tới.
 */
@Injectable()
export class InviteSweeperService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly logger = new Logger(InviteSweeperService.name);
  private readonly job = new ManagedInterval();

  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly config: ConfigService<CoreApiEnv, true>,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    this.job.start(this.scheduler, {
      jobName: INVITE_SWEEPER_JOB,
      intervalMs: this.config.getOrThrow(
        'MATCHING_INVITE_SWEEPER_INTERVAL_MS',
        {
          infer: true,
        },
      ),
      task: () => this.runOnce(),
      logger: this.logger,
      errorMessage: 'Invite sweeper lỗi',
    });
  }

  onApplicationShutdown(): void {
    this.job.stop();
  }

  /** 1 tick — public để test/chạy tay. */
  async runOnce(): Promise<number> {
    return this.job.runExclusive(async () => {
      const [, count] = (await this.dataSource.query(
        `UPDATE match_invites
            SET status = $1, updated_at = now()
          WHERE status = $2 AND expires_at < now()`,
        [MatchInviteStatus.Expired, MatchInviteStatus.Pending],
      )) as [unknown, number];
      return count;
    }, 0);
  }
}
