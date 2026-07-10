import { Injectable, Logger, OnApplicationBootstrap, OnApplicationShutdown } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SchedulerRegistry } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';

import { MatchingService } from './matching.service';
import { MatchingOperation, MatchingOperationStatus } from './entities/matching-operation.entity';

const RECOVERY_JOB = 'matching-operation-recovery';

/** Resumes durable Matching→Economy sagas even when the original client never retries. */
@Injectable()
export class MatchingOperationRecoveryService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(MatchingOperationRecoveryService.name);
  private running = false;

  constructor(
    @InjectRepository(MatchingOperation) private readonly operationRepo: Repository<MatchingOperation>,
    private readonly matchingService: MatchingService,
    private readonly config: ConfigService,
    private readonly scheduler: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    void this.recoverOnce().catch((err) => this.logger.error({ err: `${err}` }, 'Matching recovery bootstrap lỗi'));
    const interval = setInterval(
      () =>
        void this.recoverOnce().catch((err) =>
          this.logger.error({ err: `${err}` }, 'Matching recovery interval lỗi'),
        ),
      this.config.getOrThrow<number>('MATCHING_SWEEPER_INTERVAL_MS'),
    );
    this.scheduler.addInterval(RECOVERY_JOB, interval);
  }

  onApplicationShutdown(): void {
    if (this.scheduler.doesExist('interval', RECOVERY_JOB)) this.scheduler.deleteInterval(RECOVERY_JOB);
  }

  async recoverOnce(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    try {
      const operations = await this.operationRepo.find({
        where: {
          status: In([
            MatchingOperationStatus.Pending,
            MatchingOperationStatus.Charged,
            MatchingOperationStatus.Compensating,
          ]),
        },
        order: { createdAt: 'ASC' },
        take: 100,
      });
      for (const operation of operations) {
        try {
          await this.matchingService.resumeSpeedupOperation(operation.id);
        } catch (err) {
          // A compensated operation intentionally ends with a domain error for the request; recovery
          // only needs the durable state to converge, so record and continue with the remaining rows.
          const fresh = await this.operationRepo.findOneBy({ id: operation.id });
          if (fresh?.status !== MatchingOperationStatus.Compensated) {
            this.logger.error({ err: `${err}`, operationId: operation.id }, 'Không resume được Matching operation');
          }
        }
      }
      return operations.length;
    } finally {
      this.running = false;
    }
  }
}
