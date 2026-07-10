import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { SafetyFoundation1752400000000 } from '../../database/migrations/1752400000000-safety-foundation';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';

import { SafetyErrors } from './safety.errors';
import { SafetyService } from './safety.service';
import {
  EvidenceKind,
  EvidenceVerificationStatus,
  ReportEvidenceMetadata,
} from './entities/report-evidence-metadata.entity';
import { ReportCategory, ReportPriority, SafetyReport } from './entities/report.entity';
import { SafetyAuditEvent } from './entities/safety-audit-event.entity';
import { SafetyOperation } from './entities/safety-operation.entity';
import { UserBlock, UserBlockStatus } from './entities/user-block.entity';

import type { ConfigService } from '@nestjs/config';

const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn('[safety.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy race test trên Postgres thật');
}

jest.setTimeout(60_000);

d('Safety integration (Postgres thật)', () => {
  let ds: DataSource;
  let service: SafetyService;

  const config = {
    get: (key: string) => (key === 'SAFETY_REPORT_MAX_PER_HOUR' ? 2 : undefined),
  } as unknown as ConfigService;

  const createUser = async (): Promise<User> =>
    ds.getRepository(User).save(
      ds.getRepository(User).create({
        nickname: `safety-${Math.random().toString(36).slice(2, 8)}`,
        avatarId: 'default-01',
        isGuest: false,
      }),
    );

  beforeAll(async () => {
    const testUrl = new URL(INTEGRATION_DB_URL as string);
    testUrl.pathname = `${testUrl.pathname}_safety`;
    const dbName = testUrl.pathname.slice(1);
    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({ type: 'postgres', url: adminUrl.toString() });
    await admin.initialize();
    const exists = await admin.query(`SELECT 1 FROM pg_database WHERE datname = $1`, [dbName]);
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: testUrl.toString(),
      entities: [
        User,
        UserBlock,
        SafetyReport,
        ReportEvidenceMetadata,
        SafetyOperation,
        SafetyAuditEvent,
      ],
      migrations: [InitAuthUser1751900000000, SafetyFoundation1752400000000],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), config);
    service = new SafetyService(
      ds.getRepository(UserBlock),
      ds.getRepository(SafetyReport),
      ds,
      userService,
      config,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('2 create block đồng thời cùng key tạo đúng 1 block, 1 operation và 1 audit transition', async () => {
    const [userA, userB] = await Promise.all([createUser(), createUser()]);
    const results = await Promise.all([
      service.createBlock(userA.id, userB.id, 'concurrent-block'),
      service.createBlock(userA.id, userB.id, 'concurrent-block'),
    ]);

    expect(results[0].id).toBe(results[1].id);
    expect(await ds.getRepository(UserBlock).countBy({ blockerUserId: userA.id, blockedUserId: userB.id })).toBe(1);
    expect(await ds.getRepository(SafetyOperation).countBy({ actorUserId: userA.id })).toBe(1);
    expect(await ds.getRepository(SafetyAuditEvent).countBy({ actorUserId: userA.id })).toBe(1);
  });

  it('unblock là directional/owned: đối phương không thể xoá block; reciprocal block cần gỡ cả hai chiều', async () => {
    const [userA, userB] = await Promise.all([createUser(), createUser()]);
    await service.createBlock(userA.id, userB.id, 'a-blocks-b');

    // IDOR attempt: B cannot remove A -> B through B's endpoint.
    await expect(service.unblock(userB.id, userA.id, 'b-tries-unblock-a')).rejects.toMatchObject({
      code: SafetyErrors.BLOCK_NOT_FOUND,
    });
    await expect(service.assertInteractionAllowed(userA.id, userB.id)).rejects.toMatchObject({
      code: SafetyErrors.INTERACTION_BLOCKED,
    });

    await service.createBlock(userB.id, userA.id, 'b-blocks-a');
    await service.unblock(userA.id, userB.id, 'a-unblocks-b');
    await expect(service.assertInteractionAllowed(userA.id, userB.id)).rejects.toMatchObject({
      code: SafetyErrors.INTERACTION_BLOCKED,
    });

    await service.unblock(userB.id, userA.id, 'b-unblocks-a');
    await expect(service.assertInteractionAllowed(userA.id, userB.id)).resolves.toBeUndefined();
    expect(await ds.getRepository(UserBlock).countBy({ status: UserBlockStatus.Unblocked })).toBeGreaterThanOrEqual(2);
  });

  it('2 report đồng thời cùng key tạo đúng 1 report/evidence; priority do server derive', async () => {
    const [reporter, reported] = await Promise.all([createUser(), createUser()]);
    const referenceId = '00000000-0000-4000-8000-000000000099';
    const dto = {
      reportedUserId: reported.id,
      category: ReportCategory.SuspectedMinor,
      summary: 'Cần review khẩn cấp',
      evidence: [{ kind: EvidenceKind.Message, referenceId }],
    };
    const reports = await Promise.all([
      service.createReport(reporter.id, dto, 'concurrent-report'),
      service.createReport(reporter.id, dto, 'concurrent-report'),
    ]);

    expect(reports[0].id).toBe(reports[1].id);
    expect(reports[0].priority).toBe(ReportPriority.Urgent);
    expect(reports[0].evidence[0].verificationStatus).toBe(EvidenceVerificationStatus.Unverified);
    expect(await ds.getRepository(SafetyReport).countBy({ reporterUserId: reporter.id })).toBe(1);
    expect(await ds.getRepository(ReportEvidenceMetadata).countBy({ reportId: reports[0].id })).toBe(1);
  });

  it('list own reports không lộ report của user khác (IDOR)', async () => {
    const [reporterA, reporterB, reported] = await Promise.all([createUser(), createUser(), createUser()]);
    const own = await service.createReport(
      reporterA.id,
      { reportedUserId: reported.id, category: ReportCategory.Harassment },
      'own-report',
    );
    await service.createReport(
      reporterB.id,
      { reportedUserId: reported.id, category: ReportCategory.SpamOrScam },
      'other-report',
    );

    const visible = await service.listOwnReports(reporterA.id);
    expect(visible.map((report) => report.id)).toContain(own.id);
    expect(visible.every((report) => report.id !== own.id || report.reportedUserId === reported.id)).toBe(true);
    expect(visible).toHaveLength(1);
  });

  it('persistent report abuse limit is enforced under the reporter lock', async () => {
    const [reporter, targetA, targetB, targetC] = await Promise.all([
      createUser(),
      createUser(),
      createUser(),
      createUser(),
    ]);
    await service.createReport(
      reporter.id,
      { reportedUserId: targetA.id, category: ReportCategory.Other },
      'rate-1',
    );
    await service.createReport(
      reporter.id,
      { reportedUserId: targetB.id, category: ReportCategory.Other },
      'rate-2',
    );
    await expect(
      service.createReport(
        reporter.id,
        { reportedUserId: targetC.id, category: ReportCategory.Other },
        'rate-3',
      ),
    ).rejects.toMatchObject({ code: SafetyErrors.REPORT_RATE_LIMITED });
  });

  it('audit và idempotency operation là append-only ở tầng DB', async () => {
    const [userA, userB] = await Promise.all([createUser(), createUser()]);
    await service.createBlock(userA.id, userB.id, 'immutable-audit');
    const audit = await ds.getRepository(SafetyAuditEvent).findOneByOrFail({ actorUserId: userA.id });
    const operation = await ds.getRepository(SafetyOperation).findOneByOrFail({ actorUserId: userA.id });

    await expect(ds.query(`DELETE FROM safety_audit_events WHERE id = $1`, [audit.id])).rejects.toMatchObject({
      code: '55000',
    });
    await expect(ds.query(`UPDATE safety_operations SET request_hash = repeat('0', 64) WHERE id = $1`, [operation.id]))
      .rejects.toMatchObject({ code: '55000' });
  });
});
