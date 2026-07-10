import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, EntityManager, In, MoreThanOrEqual, Repository } from 'typeorm';

import { SafetyErrors } from './safety.errors';
import { SafetyAuditAction, SafetyAuditEvent, SafetyResourceType } from './entities/safety-audit-event.entity';
import { EvidenceVerificationStatus, ReportEvidenceMetadata } from './entities/report-evidence-metadata.entity';
import { ReportCategory, ReportPriority, ReportStatus, SafetyReport } from './entities/report.entity';
import { SafetyOperation, SafetyOperationKind } from './entities/safety-operation.entity';
import { UserBlock, UserBlockStatus } from './entities/user-block.entity';

import { UserService } from '../user';

import type { CreateReportDto, SafetyReportDto } from './dto/safety.dtos';
import type { InteractionPair, InteractionSafetyPolicy } from './interaction-safety-policy';

const MAX_BATCH_PAIRS = 500;
const DEFAULT_REPORT_MAX_PER_HOUR = 5;

@Injectable()
export class SafetyService implements InteractionSafetyPolicy {
  constructor(
    @InjectRepository(UserBlock) private readonly blockRepo: Repository<UserBlock>,
    @InjectRepository(SafetyReport) private readonly reportRepo: Repository<SafetyReport>,
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly userService: UserService,
    private readonly config: ConfigService,
  ) {}

  async createBlock(
    actorUserId: string,
    blockedUserId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<UserBlock> {
    this.assertNotSelf(actorUserId, blockedUserId);
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.hash({ blockedUserId });
    await this.userService.getByIdOrThrow(blockedUserId);

    return this.dataSource.transaction(async (manager) => {
      await this.lockOperation(manager, actorUserId, SafetyOperationKind.Block, idempotencyKey);
      const replay = await manager.getRepository(SafetyOperation).findOneBy({
        actorUserId,
        kind: SafetyOperationKind.Block,
        idempotencyKey,
      });
      if (replay) {
        this.assertReplay(replay, requestHash);
        return manager.getRepository(UserBlock).findOneByOrFail({ id: replay.resourceId });
      }

      await this.lockDirectedPair(manager, actorUserId, blockedUserId);
      const repo = manager.getRepository(UserBlock);
      let block = await repo
        .createQueryBuilder('block')
        .setLock('pessimistic_write')
        .where('block.blockerUserId = :actorUserId AND block.blockedUserId = :blockedUserId', {
          actorUserId,
          blockedUserId,
        })
        .getOne();
      const transitioned = !block || block.status !== UserBlockStatus.Active;
      if (!block) {
        block = repo.create({
          blockerUserId: actorUserId,
          blockedUserId,
          status: UserBlockStatus.Active,
          blockedAt: new Date(),
          unblockedAt: null,
        });
      } else if (block.status === UserBlockStatus.Unblocked) {
        block.status = UserBlockStatus.Active;
        block.blockedAt = new Date();
        block.unblockedAt = null;
      }
      block = await repo.save(block);
      await this.recordOperation(manager, actorUserId, SafetyOperationKind.Block, idempotencyKey, requestHash, block.id);
      if (transitioned) {
        await this.recordAudit(
          manager,
          actorUserId,
          blockedUserId,
          SafetyAuditAction.BlockActivated,
          SafetyResourceType.Block,
          block.id,
          {},
        );
      }
      return block;
    });
  }

  async unblock(
    actorUserId: string,
    blockedUserId: string,
    rawIdempotencyKey: string | undefined,
  ): Promise<UserBlock> {
    this.assertNotSelf(actorUserId, blockedUserId);
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const requestHash = this.hash({ blockedUserId });

    return this.dataSource.transaction(async (manager) => {
      await this.lockOperation(manager, actorUserId, SafetyOperationKind.Unblock, idempotencyKey);
      const replay = await manager.getRepository(SafetyOperation).findOneBy({
        actorUserId,
        kind: SafetyOperationKind.Unblock,
        idempotencyKey,
      });
      if (replay) {
        this.assertReplay(replay, requestHash);
        return manager.getRepository(UserBlock).findOneByOrFail({ id: replay.resourceId });
      }

      await this.lockDirectedPair(manager, actorUserId, blockedUserId);
      const repo = manager.getRepository(UserBlock);
      const block = await repo
        .createQueryBuilder('block')
        .setLock('pessimistic_write')
        .where('block.blockerUserId = :actorUserId AND block.blockedUserId = :blockedUserId', {
          actorUserId,
          blockedUserId,
        })
        .getOne();
      if (!block) {
        // Direction is part of ownership: B cannot remove A -> B by sending B -> A.
        throw new DomainException(SafetyErrors.BLOCK_NOT_FOUND, 'Không tìm thấy quan hệ chặn của bạn', 404);
      }

      const transitioned = block.status === UserBlockStatus.Active;
      if (transitioned) {
        block.status = UserBlockStatus.Unblocked;
        block.unblockedAt = new Date();
        await repo.save(block);
      }
      await this.recordOperation(
        manager,
        actorUserId,
        SafetyOperationKind.Unblock,
        idempotencyKey,
        requestHash,
        block.id,
      );
      if (transitioned) {
        await this.recordAudit(
          manager,
          actorUserId,
          blockedUserId,
          SafetyAuditAction.BlockRemoved,
          SafetyResourceType.Block,
          block.id,
          {},
        );
      }
      return block;
    });
  }

  async createReport(
    reporterUserId: string,
    dto: CreateReportDto,
    rawIdempotencyKey: string | undefined,
  ): Promise<SafetyReportDto> {
    this.assertNotSelf(reporterUserId, dto.reportedUserId);
    this.assertEvidenceUnique(dto);
    const idempotencyKey = this.validateIdempotencyKey(rawIdempotencyKey);
    const normalizedSummary = dto.summary?.trim() || null;
    const canonicalEvidence = (dto.evidence ?? []).map((evidence) => ({
      kind: evidence.kind,
      referenceId: evidence.referenceId,
      sha256: evidence.sha256 ?? null,
      contentType: evidence.contentType ?? null,
      byteSize: evidence.byteSize ?? null,
    }));
    const requestHash = this.hash({
      reportedUserId: dto.reportedUserId,
      category: dto.category,
      summary: normalizedSummary,
      evidence: canonicalEvidence,
    });
    await this.userService.getByIdOrThrow(dto.reportedUserId);

    return this.dataSource.transaction(async (manager) => {
      await this.lockOperation(manager, reporterUserId, SafetyOperationKind.Report, idempotencyKey);
      const operationRepo = manager.getRepository(SafetyOperation);
      const replay = await operationRepo.findOneBy({
        actorUserId: reporterUserId,
        kind: SafetyOperationKind.Report,
        idempotencyKey,
      });
      if (replay) {
        this.assertReplay(replay, requestHash);
        return this.toReportDto(await this.findReportWithEvidence(manager, replay.resourceId));
      }

      // Persistent per-account limit is serialized across app instances; controller throttling is only an outer shield.
      await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
        `safety:report-rate:${reporterUserId}`,
      ]);
      await this.assertReportRateLimit(manager, reporterUserId);

      const priority = this.derivePriority(dto.category);
      const reportRepo = manager.getRepository(SafetyReport);
      const report = await reportRepo.save(
        reportRepo.create({
          reporterUserId,
          reportedUserId: dto.reportedUserId,
          category: dto.category,
          priority,
          status: ReportStatus.Submitted,
          summary: normalizedSummary,
        }),
      );
      if (canonicalEvidence.length > 0) {
        const evidenceRepo = manager.getRepository(ReportEvidenceMetadata);
        await evidenceRepo.save(
          canonicalEvidence.map((evidence) =>
            evidenceRepo.create({
              reportId: report.id,
              ...evidence,
              // Never treat an arbitrary client reference as verified moderator evidence.
              verificationStatus: EvidenceVerificationStatus.Unverified,
            }),
          ),
        );
      }
      await this.recordOperation(
        manager,
        reporterUserId,
        SafetyOperationKind.Report,
        idempotencyKey,
        requestHash,
        report.id,
      );
      await this.recordAudit(
        manager,
        reporterUserId,
        dto.reportedUserId,
        SafetyAuditAction.ReportSubmitted,
        SafetyResourceType.Report,
        report.id,
        { category: dto.category, priority, evidenceCount: canonicalEvidence.length },
      );
      return this.toReportDto(await this.findReportWithEvidence(manager, report.id));
    });
  }

  async listOwnReports(reporterUserId: string): Promise<SafetyReportDto[]> {
    const reports = await this.reportRepo.find({
      where: { reporterUserId },
      relations: { evidence: true },
      order: { createdAt: 'DESC', evidence: { createdAt: 'ASC' } },
      take: 50,
    });
    return reports.map((report) => this.toReportDto(report));
  }

  async assertInteractionAllowed(userAId: string, userBId: string, manager?: EntityManager): Promise<void> {
    const blocked = await this.findBlockedPairs([{ userAId, userBId }], manager);
    if (blocked.length > 0) {
      // Deliberately do not disclose which direction is blocked.
      throw new DomainException(SafetyErrors.INTERACTION_BLOCKED, 'Tương tác giữa hai tài khoản không được phép', 403);
    }
  }

  async findBlockedPairs(pairs: readonly InteractionPair[], manager?: EntityManager): Promise<InteractionPair[]> {
    if (pairs.length === 0) return [];
    if (pairs.length > MAX_BATCH_PAIRS) {
      throw new DomainException(
        SafetyErrors.BATCH_TOO_LARGE,
        `Mỗi lần chỉ kiểm tra tối đa ${MAX_BATCH_PAIRS} cặp`,
        400,
      );
    }

    const users = [...new Set(pairs.flatMap((pair) => [pair.userAId, pair.userBId]))];
    const repo = manager ? manager.getRepository(UserBlock) : this.blockRepo;
    const activeBlocks = await repo.findBy({
      blockerUserId: In(users),
      blockedUserId: In(users),
      status: UserBlockStatus.Active,
    });
    const activeDirections = new Set(
      activeBlocks.map((block) => this.directedPairKey(block.blockerUserId, block.blockedUserId)),
    );

    return pairs.filter(
      ({ userAId, userBId }) =>
        activeDirections.has(this.directedPairKey(userAId, userBId)) ||
        activeDirections.has(this.directedPairKey(userBId, userAId)),
    );
  }

  private async assertReportRateLimit(manager: EntityManager, reporterUserId: string): Promise<void> {
    const configured = this.config.get<number>('SAFETY_REPORT_MAX_PER_HOUR');
    const maxPerHour = configured && configured > 0 ? configured : DEFAULT_REPORT_MAX_PER_HOUR;
    const recent = await manager.getRepository(SafetyReport).countBy({
      reporterUserId,
      createdAt: MoreThanOrEqual(new Date(Date.now() - 3_600_000)),
    });
    if (recent >= maxPerHour) {
      throw new DomainException(
        SafetyErrors.REPORT_RATE_LIMITED,
        `Chỉ được gửi tối đa ${maxPerHour} báo cáo mỗi giờ`,
        429,
      );
    }
  }

  private async findReportWithEvidence(manager: EntityManager, reportId: string): Promise<SafetyReport> {
    return manager.getRepository(SafetyReport).findOneOrFail({
      where: { id: reportId },
      relations: { evidence: true },
      order: { evidence: { createdAt: 'ASC' } },
    });
  }

  private async lockOperation(
    manager: EntityManager,
    actorUserId: string,
    kind: SafetyOperationKind,
    idempotencyKey: string,
  ): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `safety:operation:${actorUserId}:${kind}:${idempotencyKey}`,
    ]);
  }

  private async lockDirectedPair(manager: EntityManager, blockerUserId: string, blockedUserId: string): Promise<void> {
    await manager.query(`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`, [
      `safety:block:${this.directedPairKey(blockerUserId, blockedUserId)}`,
    ]);
  }

  private async recordOperation(
    manager: EntityManager,
    actorUserId: string,
    kind: SafetyOperationKind,
    idempotencyKey: string,
    requestHash: string,
    resourceId: string,
  ): Promise<void> {
    const repo = manager.getRepository(SafetyOperation);
    await repo.save(repo.create({ actorUserId, kind, idempotencyKey, requestHash, resourceId }));
  }

  private async recordAudit(
    manager: EntityManager,
    actorUserId: string,
    subjectUserId: string,
    action: SafetyAuditAction,
    resourceType: SafetyResourceType,
    resourceId: string,
    metadata: Record<string, string | number | boolean | null>,
  ): Promise<void> {
    const repo = manager.getRepository(SafetyAuditEvent);
    await repo.save(repo.create({ actorUserId, subjectUserId, action, resourceType, resourceId, metadata }));
  }

  private assertReplay(operation: SafetyOperation, requestHash: string): void {
    if (operation.requestHash !== requestHash) {
      throw new DomainException(
        SafetyErrors.IDEMPOTENCY_CONFLICT,
        'Idempotency-Key đã được dùng cho yêu cầu khác nội dung',
        409,
      );
    }
  }

  private assertEvidenceUnique(dto: CreateReportDto): void {
    const keys = (dto.evidence ?? []).map((evidence) => `${evidence.kind}:${evidence.referenceId}`);
    if (new Set(keys).size !== keys.length) {
      throw new DomainException(SafetyErrors.EVIDENCE_INVALID, 'Evidence metadata bị trùng', 422);
    }
  }

  private assertNotSelf(actorUserId: string, subjectUserId: string): void {
    if (actorUserId === subjectUserId) {
      throw new DomainException(SafetyErrors.SELF_ACTION_FORBIDDEN, 'Không thể block/report chính mình', 422);
    }
  }

  private validateIdempotencyKey(value: string | undefined): string {
    const key = value?.trim();
    if (!key) {
      throw new DomainException(SafetyErrors.IDEMPOTENCY_KEY_MISSING, 'Thiếu header Idempotency-Key', 400);
    }
    if (key.length > 255) {
      throw new DomainException(SafetyErrors.IDEMPOTENCY_KEY_INVALID, 'Idempotency-Key dài tối đa 255 ký tự', 400);
    }
    return key;
  }

  private derivePriority(category: ReportCategory): ReportPriority {
    return category === ReportCategory.SuspectedMinor || category === ReportCategory.ThreatOrViolence
      ? ReportPriority.Urgent
      : ReportPriority.Standard;
  }

  private hash(value: unknown): string {
    return createHash('sha256').update(JSON.stringify(value)).digest('hex');
  }

  private directedPairKey(userAId: string, userBId: string): string {
    return `${userAId}:${userBId}`;
  }

  private toReportDto(report: SafetyReport): SafetyReportDto {
    return {
      id: report.id,
      reportedUserId: report.reportedUserId,
      category: report.category,
      priority: report.priority,
      status: report.status,
      summary: report.summary,
      evidence: (report.evidence ?? []).map((evidence) => ({
        kind: evidence.kind,
        referenceId: evidence.referenceId,
        sha256: evidence.sha256,
        contentType: evidence.contentType,
        byteSize: evidence.byteSize,
        verificationStatus: evidence.verificationStatus,
      })),
      createdAt: report.createdAt,
    };
  }
}
