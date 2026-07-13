import { HttpStatus, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, MoreThan, MoreThanOrEqual, Repository } from 'typeorm';

import { SafetyErrors } from './safety.errors';
import { Block, BlockAction } from './entities/block.entity';
import { Report, ReportReason, ReportStatus } from './entities/report.entity';
import { UserService } from '../user';

import type { EntityManager } from 'typeorm';
import type { CoreApiEnv } from '../../config/env.validation';

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ReportPageFilter {
  status?: ReportStatus;
}

export interface ReportPage {
  items: Report[];
  total: number;
}

/**
 * Facade Safety (docs/services/safety-service.md): Report/Block append-only + trust score
 * penalty. `canPair` cố tình đặt trùng tên với `MatchInteractionPolicy.canPair` (Matching
 * module) — thoả mãn interface đó bằng structural typing, bind thẳng qua `useExisting` ở
 * matching.module.ts, không cần class adapter riêng.
 */
@Injectable()
export class SafetyService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(Report) private readonly reportRepo: Repository<Report>,
    @InjectRepository(Block) private readonly blockRepo: Repository<Block>,
    private readonly userService: UserService,
    private readonly config: ConfigService<CoreApiEnv, true>,
  ) {}

  /**
   * Ghi report + áp trust-score penalty atomic trong cùng transaction (docs/services/
   * safety-service.md § 4). Report thêm của cùng cặp trong cooldown vẫn được ghi (giữ evidence)
   * nhưng `trustPenaltyApplied = 0` — chống lạm dụng report kiểu "vote-kick".
   */
  async report(
    reporterUserId: string,
    targetUserId: string,
    reason: ReportReason,
    description?: string,
  ): Promise<Report> {
    if (reporterUserId === targetUserId) {
      throw new DomainException(
        SafetyErrors.SELF_REPORT_FORBIDDEN,
        'Không thể tự report chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.userService.getByIdOrThrow(targetUserId);

    const pairCooldownDays = this.config.getOrThrow(
      'SAFETY_REPORT_COOLDOWN_DAYS',
      { infer: true },
    );
    const penaltyPerReport = this.config.getOrThrow(
      'SAFETY_TRUST_PENALTY_PER_REPORT',
      { infer: true },
    );
    const dailyCap = this.config.getOrThrow('SAFETY_TRUST_PENALTY_DAILY_CAP', {
      infer: true,
    });
    const floor = this.config.getOrThrow('SAFETY_TRUST_SCORE_FLOOR', {
      infer: true,
    });

    return this.dataSource.transaction(async (manager) => {
      const pairCutoff = new Date(Date.now() - pairCooldownDays * DAY_MS);
      const alreadyPenalizedThisPair =
        (await manager.count(Report, {
          where: {
            reporterUserId,
            targetUserId,
            createdAt: MoreThanOrEqual(pairCutoff),
            trustPenaltyApplied: MoreThan(0),
          },
        })) > 0;

      const dailyCutoff = new Date(Date.now() - DAY_MS);
      const raw = await manager
        .createQueryBuilder(Report, 'r')
        .select('COALESCE(SUM(r.trustPenaltyApplied), 0)', 'sum')
        .where('r.targetUserId = :targetUserId', { targetUserId })
        .andWhere('r.createdAt >= :dailyCutoff', { dailyCutoff })
        .getRawOne<{ sum: string }>();
      const appliedToday = Number(raw?.sum ?? 0);
      const remainingCap = Math.max(0, dailyCap - appliedToday);

      const penalty = alreadyPenalizedThisPair
        ? 0
        : Math.min(penaltyPerReport, remainingCap);

      const report = await manager.save(
        manager.create(Report, {
          reporterUserId,
          targetUserId,
          reason,
          description: description ?? null,
          trustPenaltyApplied: penalty,
        }),
      );

      if (penalty > 0) {
        await this.userService.adjustTrustScore(
          manager,
          targetUserId,
          -penalty,
          floor,
        );
      }
      return report;
    });
  }

  /** Idempotent — block khi đã đang block là no-op, không ghi dòng trùng thừa. */
  async block(blockerUserId: string, targetUserId: string): Promise<void> {
    if (blockerUserId === targetUserId) {
      throw new DomainException(
        SafetyErrors.SELF_BLOCK_FORBIDDEN,
        'Không thể tự block chính mình',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.userService.getByIdOrThrow(targetUserId);
    const latest = await this.latestAction(blockerUserId, targetUserId);
    if (latest === BlockAction.Blocked) return;
    await this.blockRepo.save(
      this.blockRepo.create({
        blockerUserId,
        blockedUserId: targetUserId,
        action: BlockAction.Blocked,
      }),
    );
  }

  /** Idempotent — unblock khi chưa block là no-op. */
  async unblock(blockerUserId: string, targetUserId: string): Promise<void> {
    const latest = await this.latestAction(blockerUserId, targetUserId);
    if (latest !== BlockAction.Blocked) return;
    await this.blockRepo.save(
      this.blockRepo.create({
        blockerUserId,
        blockedUserId: targetUserId,
        action: BlockAction.Unblocked,
      }),
    );
  }

  /** Trạng thái hiện tại 1 chiều — dùng bởi Friend Chat (§ 6) và Feed (§ 3). */
  async isBlocked(
    blockerUserId: string,
    targetUserId: string,
  ): Promise<boolean> {
    return (
      (await this.latestAction(blockerUserId, targetUserId)) ===
      BlockAction.Blocked
    );
  }

  /**
   * Tập userId đang có quan hệ block ACTIVE với `userId` (2 chiều, dòng mới nhất mỗi cặp) —
   * dùng để lọc feed 1 lần thay vì gọi `isBlocked` lặp cho từng ứng viên
   * (docs/services/feed-service.md § 3).
   */
  async getBlockedUserIds(userId: string): Promise<string[]> {
    const rows = await this.blockRepo.query(
      `
      SELECT other_id FROM (
        SELECT DISTINCT ON (blocked_user_id) blocked_user_id AS other_id, action
        FROM blocks WHERE blocker_user_id = $1
        ORDER BY blocked_user_id, created_at DESC
      ) latest WHERE action = $2
      UNION
      SELECT other_id FROM (
        SELECT DISTINCT ON (blocker_user_id) blocker_user_id AS other_id, action
        FROM blocks WHERE blocked_user_id = $1
        ORDER BY blocker_user_id, created_at DESC
      ) latest WHERE action = $2
      `,
      [userId, BlockAction.Blocked],
    );
    return (rows as Array<{ other_id: string }>).map((r) => r.other_id);
  }

  /**
   * Implementation thật của `MatchInteractionPolicy.canPair` (docs/services/safety-service.md
   * § 3.1) — verify lại ĐÚNG lúc matcher ghép, không chỉ lúc enqueue (docs/10 § 10.0.C).
   */
  async canPair(userAId: string, userBId: string): Promise<boolean> {
    const activeBlock =
      (await this.isBlocked(userAId, userBId)) ||
      (await this.isBlocked(userBId, userAId));
    if (activeBlock) return false;

    const cooldownDays = this.config.getOrThrow(
      'SAFETY_REMATCH_COOLDOWN_DAYS',
      { infer: true },
    );
    const cutoff = new Date(Date.now() - cooldownDays * DAY_MS);

    const recentReport = await this.reportRepo.exists({
      where: [
        {
          reporterUserId: userAId,
          targetUserId: userBId,
          createdAt: MoreThanOrEqual(cutoff),
        },
        {
          reporterUserId: userBId,
          targetUserId: userAId,
          createdAt: MoreThanOrEqual(cutoff),
        },
      ],
    });
    if (recentReport) return false;

    const recentBlock = await this.blockRepo.exists({
      where: [
        {
          blockerUserId: userAId,
          blockedUserId: userBId,
          createdAt: MoreThanOrEqual(cutoff),
        },
        {
          blockerUserId: userBId,
          blockedUserId: userAId,
          createdAt: MoreThanOrEqual(cutoff),
        },
      ],
    });
    return !recentBlock;
  }

  /** Moderation queue cho Admin (docs/12 § 12.7) — offset OK vì list nhỏ (docs/05 § 5.4). */
  async findReportsPage(
    filter: ReportPageFilter,
    limit: number,
    offset: number,
  ): Promise<ReportPage> {
    const qb = this.reportRepo.createQueryBuilder('r');
    if (filter.status)
      qb.andWhere('r.status = :status', { status: filter.status });
    qb.orderBy('r.createdAt', 'DESC').skip(offset).take(limit);
    const [items, total] = await qb.getManyAndCount();
    return { items, total };
  }

  /**
   * Nhận `manager` để AdminModule ghi CÙNG transaction với audit log (atomic — cùng pattern
   * `UserService.banUser`). Chỉ `status` được mutate — mọi field khác của report bất biến.
   */
  async setReportStatus(
    manager: EntityManager,
    reportId: string,
    status: ReportStatus,
  ): Promise<Report> {
    const repo = manager.getRepository(Report);
    const report = await repo.findOneBy({ id: reportId });
    if (!report) {
      throw new DomainException(
        SafetyErrors.REPORT_NOT_FOUND,
        'Không tìm thấy report',
        HttpStatus.NOT_FOUND,
      );
    }
    report.status = status;
    return repo.save(report);
  }

  private async latestAction(
    blockerUserId: string,
    blockedUserId: string,
  ): Promise<BlockAction | null> {
    const latest = await this.blockRepo.findOne({
      where: { blockerUserId, blockedUserId },
      order: { createdAt: 'DESC' },
    });
    return latest?.action ?? null;
  }
}
