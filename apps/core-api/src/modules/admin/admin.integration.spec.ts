import { metrics } from '@opentelemetry/api';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { AdminAuditLog1753700000000 } from '../../database/migrations/1753700000000-admin-audit-log';
import { AdminCatalogAuditTarget1755000000000 } from '../../database/migrations/1755000000000-admin-catalog-audit-target';
import { Notification1753000000000 } from '../../database/migrations/1753000000000-notification';
import { AdminRolePermissions1755100000000 } from '../../database/migrations/1755100000000-admin-role-permissions';
import { SupportTicket1755300000000 } from '../../database/migrations/1755300000000-support-ticket';
import { AdminSupportPermission1755400000000 } from '../../database/migrations/1755400000000-admin-support-permission';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { OutboxReliability1757000000000 } from '../../database/migrations/1757000000000-outbox-reliability';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { ReportTargetVideo1754900000000 } from '../../database/migrations/1754900000000-report-target-video';
import { PartyRoomGift1752700000000 } from '../../database/migrations/1752700000000-party-room-gift';
import { ReportStatus1753800000000 } from '../../database/migrations/1753800000000-report-status';
import { NotificationBroadcasts1758300000000 } from '../../database/migrations/1758300000000-notification-broadcasts';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { AdminAuditLog } from '../../common/audit/audit-log.entity';
import { Gender, User, UserService, UserStatus } from '../user';
import {
  Block,
  Report,
  ReportReason,
  ReportStatus,
  SafetyService,
} from '../safety';
import { Gift, GiftErrors, GiftService } from '../gift';
import { EconomyService } from '../economy/economy.service';
import { EconomyMetrics } from '../economy/economy.metrics';
import { LedgerService } from '../economy/services/ledger.service';
import { LedgerAccount } from '../economy/entities/ledger-account.entity';
import { LedgerEntry } from '../economy/entities/ledger-entry.entity';
import { OutboxEvent } from '../economy/entities/outbox-event.entity';
import { LedgerTransaction } from '../economy/entities/transaction.entity';
import { VipTier, Wallet } from '../economy/entities/wallet.entity';
import {
  IapProduct,
  IapProvider,
  IapReceipt,
} from '../economy/entities/iap.entities';
import { VipPlan } from '../economy/entities/vip-plan.entity';
import { Notification, NotificationService } from '../notification';
import {
  SupportService,
  SupportTicketCategory,
  SupportTicketStatus,
} from '../support';
import { SupportTicket } from '../support/entities/support-ticket.entity';

import { AdminService } from './admin.service';
import { AdminErrors } from './admin.errors';
import { BroadcastAudience } from './dto/admin-config.dto';
import { AdminPermission } from './admin.constants';
import { AdminRolePermission } from './entities/admin-role-permission.entity';
import {
  BroadcastStatus,
  NotificationBroadcast,
} from './entities/notification-broadcast.entity';
import { BroadcastDispatchJob } from './jobs/broadcast-dispatch.job';
import { Roles } from '@litmatch/common-dtos';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { IapVerifier } from '../economy/ports/iap-verifier';

/**
 * Integration test Admin (Task 0, docs/12 § 12.7) trên Postgres thật:
 * ban/unban + audit log atomic trong 1 transaction, append-only trigger chặn UPDATE/DELETE
 * trực tiếp, chặn tự-ban. DB riêng `<tên gốc>_admin`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[admin.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  USER_DEFAULT_AVATAR_ID: 'default-01',
  ADMIN_BROADCAST_BATCH_SIZE: 500,
  ADMIN_BROADCAST_MAX_BATCHES_PER_TICK: 20,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
  get: (key: string) => CONFIG[key],
} as unknown as ConfigService<CoreApiEnv, true>;

d('Admin integration (Postgres thật)', () => {
  let ds: DataSource;
  let admin: AdminService;
  let notificationService: NotificationService;
  let broadcastJob: BroadcastDispatchJob;
  let makeBroadcastJob: () => BroadcastDispatchJob;
  const pushSend = jest.fn().mockResolvedValue(undefined);
  let economyService: EconomyService;
  let seedCounter = 0;

  async function createUser(nickname: string): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname: `${nickname}-${++seedCounter}`,
        avatarId: 'default-01',
        isGuest: false,
        region: 'VN',
        birthDate: '2000-01-01',
        gender: Gender.Unknown,
      }),
    );
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_admin`;
    url.pathname = `/${dbName}`;

    const adminDbUrl = new URL(INTEGRATION_DB_URL as string);
    adminDbUrl.pathname = '/postgres';
    const adminConn = new DataSource({
      type: 'postgres',
      url: adminDbUrl.toString(),
    });
    await adminConn.initialize();
    const exists = await adminConn.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.length === 0)
      await adminConn.query(`CREATE DATABASE "${dbName}"`);
    await adminConn.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [
        User,
        AdminAuditLog,
        Report,
        Block,
        Gift,
        LedgerAccount,
        LedgerTransaction,
        LedgerEntry,
        Wallet,
        IapProduct,
        IapReceipt,
        VipPlan,
        OutboxEvent,
        Notification,
        AdminRolePermission,
        SupportTicket,
        NotificationBroadcast,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        EconomyLedger1752000000000,
        OutboxReliability1757000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        Safety1752800000000,
        ReportTargetVideo1754900000000,
        PartyRoomGift1752700000000,
        AdminAuditLog1753700000000,
        AdminCatalogAuditTarget1755000000000,
        Notification1753000000000,
        AdminRolePermissions1755100000000,
        SupportTicket1755300000000,
        AdminSupportPermission1755400000000,
        ReportStatus1753800000000,
        NotificationBroadcasts1758300000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const safetyService = new SafetyService(
      ds,
      ds.getRepository(Report),
      ds.getRepository(Block),
      userService,
      configStub,
    );
    // GiftService phụ thuộc Economy/PartyRoom/Notification chỉ để sendGift() — không dùng ở
    // đây (chỉ test createGift/updateGift/listAllForAdmin), nên stub các phần đó.
    const giftService = new GiftService(
      ds.getRepository(Gift),
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      userService,
      {} as never,
      configStub,
      {} as never,
    );
    const ledger = new LedgerService(
      ds,
      new EconomyMetrics(metrics.getMeter('admin-integration')),
    );
    const stubVerifier = {
      verify: async (_p: IapProvider, payload: Record<string, unknown>) => ({
        providerTransactionId: String(payload['devTransactionId']),
      }),
    } as IapVerifier;
    economyService = new EconomyService(
      ds.getRepository(Wallet),
      ds.getRepository(IapProduct),
      ds.getRepository(VipPlan),
      ds.getRepository(LedgerTransaction),
      ledger,
      stubVerifier,
    );
    const auditLogService = new AuditLogService(
      ds.getRepository(AdminAuditLog),
    );
    // Video moderation không phải trọng tâm suite này (test riêng ở short-video.integration.spec.ts) — stub.
    const shortVideoServiceStub = {} as never;
    notificationService = new NotificationService(
      ds.getRepository(Notification),
      { send: pushSend } as never,
    );
    const supportService = new SupportService(ds.getRepository(SupportTicket));
    admin = new AdminService(
      ds,
      ds.getRepository(AdminRolePermission),
      userService,
      safetyService,
      giftService,
      economyService,
      shortVideoServiceStub,
      { countActiveRooms: jest.fn().mockResolvedValue(0) } as never,
      supportService,
      auditLogService,
    );
    makeBroadcastJob = () =>
      new BroadcastDispatchJob(
        ds,
        configStub,
        {} as never,
        userService,
        economyService,
        notificationService,
        auditLogService,
      );
    broadcastJob = makeBroadcastJob();
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  it('ban: đổi status Banned + ghi ĐÚNG 1 dòng audit log trong CÙNG transaction', async () => {
    const actor = await createUser('actor');
    const target = await createUser('target');

    const banned = await admin.banUser(actor.id, target.id);
    expect(banned.status).toBe(UserStatus.Banned);

    const logs = await ds
      .getRepository(AdminAuditLog)
      .findBy({ targetId: target.id, action: 'user.banned' });
    expect(logs).toHaveLength(1);
    expect(logs[0].actorUserId).toBe(actor.id);
    expect(logs[0].targetType).toBe('user');
  });

  it('tự ban chính mình → ADMIN_CANNOT_BAN_SELF, không đổi status, không ghi audit', async () => {
    const self = await createUser('self');

    await expect(admin.banUser(self.id, self.id)).rejects.toMatchObject({
      code: AdminErrors.CANNOT_BAN_SELF,
    });

    const reloaded = await ds
      .getRepository(User)
      .findOneByOrFail({ id: self.id });
    expect(reloaded.status).toBe(UserStatus.Active);
    const logs = await ds
      .getRepository(AdminAuditLog)
      .findBy({ targetId: self.id });
    expect(logs).toHaveLength(0);
  });

  it('ban rồi unban → status quay lại Active, mỗi bước ghi đúng 1 dòng audit riêng', async () => {
    const actor = await createUser('actor2');
    const target = await createUser('target2');

    await admin.banUser(actor.id, target.id);
    const unbanned = await admin.unbanUser(actor.id, target.id);

    expect(unbanned.status).toBe(UserStatus.Active);
    const bannedLogs = await ds
      .getRepository(AdminAuditLog)
      .findBy({ targetId: target.id, action: 'user.banned' });
    const unbannedLogs = await ds
      .getRepository(AdminAuditLog)
      .findBy({ targetId: target.id, action: 'user.unbanned' });
    expect(bannedLogs).toHaveLength(1);
    expect(unbannedLogs).toHaveLength(1);
  });

  it('append-only: UPDATE/DELETE trực tiếp trên admin_audit_logs bị DB trigger chặn', async () => {
    const actor = await createUser('actor3');
    const target = await createUser('target3');
    await admin.banUser(actor.id, target.id);

    const [row] = await ds
      .getRepository(AdminAuditLog)
      .findBy({ targetId: target.id, action: 'user.banned' });

    await expect(
      ds.query(`UPDATE admin_audit_logs SET action = 'hacked' WHERE id = $1`, [
        row.id,
      ]),
    ).rejects.toThrow(/append-only/);

    await expect(
      ds.query(`DELETE FROM admin_audit_logs WHERE id = $1`, [row.id]),
    ).rejects.toThrow(/append-only/);
  });

  describe('listUsers — Admin Users List', () => {
    it('filter theo status + nickname, total phản ánh đúng số khớp filter', async () => {
      const a = await createUser('list-match-alpha');
      await admin.banUser((await createUser('list-actor')).id, a.id);
      await createUser('list-other');

      const page = await admin.listUsers(
        { status: UserStatus.Banned, nickname: 'list-match' },
        20,
        0,
      );

      expect(page.total).toBe(1);
      expect(page.items.map((u) => u.id)).toEqual([a.id]);
    });

    it('offset/limit cắt đúng trang', async () => {
      const nickname = `page-${++seedCounter}`;
      await Promise.all([
        createUser(nickname),
        createUser(nickname),
        createUser(nickname),
      ]);

      const page = await admin.listUsers({ nickname }, 2, 0);
      expect(page.items).toHaveLength(2);
      expect(page.total).toBe(3);

      const page2 = await admin.listUsers({ nickname }, 2, 2);
      expect(page2.items).toHaveLength(1);
    });
  });

  describe('Moderation queue — reports', () => {
    async function createReport(
      reporterId: string,
      targetId: string,
    ): Promise<Report> {
      const repo = ds.getRepository(Report);
      return repo.save(
        repo.create({
          reporterUserId: reporterId,
          targetUserId: targetId,
          reason: ReportReason.Spam,
          description: null,
          trustPenaltyApplied: 0,
        }),
      );
    }

    it('report mới luôn ở status pending', async () => {
      const [reporter, target] = await Promise.all([
        createUser('rep-reporter'),
        createUser('rep-target'),
      ]);
      const report = await createReport(reporter.id, target.id);
      expect(report.status).toBe(ReportStatus.Pending);
    });

    it('listReports lọc theo status pending mặc định thấy report mới', async () => {
      const [reporter, target] = await Promise.all([
        createUser('list-rep-reporter'),
        createUser('list-rep-target'),
      ]);
      const report = await createReport(reporter.id, target.id);

      const page = await admin.listReports(
        { status: ReportStatus.Pending },
        20,
        0,
      );
      expect(page.items.some((r) => r.id === report.id)).toBe(true);
    });

    it('resolveReport: đổi status + ghi đúng 1 dòng audit, không đụng report khác', async () => {
      const [actor, reporter, target] = await Promise.all([
        createUser('resolve-actor'),
        createUser('resolve-reporter'),
        createUser('resolve-target'),
      ]);
      const report = await createReport(reporter.id, target.id);

      const resolved = await admin.resolveReport(actor.id, report.id);
      expect(resolved.status).toBe(ReportStatus.Resolved);

      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: report.id, action: 'report.resolved' });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(actor.id);
    });

    it('dismissReport: đổi status dismissed + audit riêng biệt với resolve', async () => {
      const [actor, reporter, target] = await Promise.all([
        createUser('dismiss-actor'),
        createUser('dismiss-reporter'),
        createUser('dismiss-target'),
      ]);
      const report = await createReport(reporter.id, target.id);

      const dismissed = await admin.dismissReport(actor.id, report.id);
      expect(dismissed.status).toBe(ReportStatus.Dismissed);

      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: report.id, action: 'report.dismissed' });
      expect(logs).toHaveLength(1);
    });

    it('resolve report không tồn tại → 404, không ghi audit', async () => {
      const actor = await createUser('missing-report-actor');
      await expect(
        admin.resolveReport(actor.id, '00000000-0000-4000-8000-000000000000'),
      ).rejects.toMatchObject({ code: 'SAFETY_REPORT_NOT_FOUND' });

      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: '00000000-0000-4000-8000-000000000000' });
      expect(logs).toHaveLength(0);
    });
  });

  describe('Gift catalog CRUD', () => {
    it('createGift: tạo mới + ghi ĐÚNG 1 dòng audit', async () => {
      const actor = await createUser('gift-create-actor');
      const code = `test-gift-${++seedCounter}`;

      const gift = await admin.createGift(actor.id, {
        code,
        name: 'Quà test',
        priceDiamond: 10,
      });

      expect(gift.active).toBe(true);
      expect(gift.sortOrder).toBe(0);
      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: gift.id, action: 'gift.created' });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(actor.id);
    });

    it('createGift: trùng code → GIFT_CODE_ALREADY_EXISTS, không ghi audit', async () => {
      const actor = await createUser('gift-dup-actor');
      const code = `dup-gift-${++seedCounter}`;
      await admin.createGift(actor.id, {
        code,
        name: 'Quà gốc',
        priceDiamond: 5,
      });

      await expect(
        admin.createGift(actor.id, {
          code,
          name: 'Quà trùng',
          priceDiamond: 5,
        }),
      ).rejects.toMatchObject({ code: GiftErrors.CODE_ALREADY_EXISTS });
    });

    it('updateGift: sửa giá + tắt active, không hard-delete', async () => {
      const actor = await createUser('gift-update-actor');
      const created = await admin.createGift(actor.id, {
        code: `upd-gift-${++seedCounter}`,
        name: 'Quà sửa',
        priceDiamond: 20,
      });

      const updated = await admin.updateGift(actor.id, created.id, {
        priceDiamond: 30,
        active: false,
      });

      expect(updated.priceDiamond).toBe(30);
      expect(updated.active).toBe(false);
      const stillExists = await ds
        .getRepository(Gift)
        .findOneBy({ id: created.id });
      expect(stillExists).not.toBeNull();

      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: created.id, action: 'gift.updated' });
      expect(logs).toHaveLength(1);
    });

    it('updateGift: quà không tồn tại → 404, không ghi audit', async () => {
      const actor = await createUser('gift-missing-actor');
      await expect(
        admin.updateGift(actor.id, '00000000-0000-4000-8000-000000000001', {
          active: false,
        }),
      ).rejects.toMatchObject({ code: GiftErrors.GIFT_NOT_FOUND });

      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: '00000000-0000-4000-8000-000000000001' });
      expect(logs).toHaveLength(0);
    });

    it('listGifts: thấy CẢ quà đã tắt (khác listCatalog công khai)', async () => {
      const actor = await createUser('gift-list-actor');
      const created = await admin.createGift(actor.id, {
        code: `list-gift-${++seedCounter}`,
        name: 'Quà list',
        priceDiamond: 15,
      });
      await admin.updateGift(actor.id, created.id, { active: false });

      const gifts = await admin.listGifts();
      const found = gifts.find((g) => g.id === created.id);
      expect(found).toBeDefined();
      expect(found?.active).toBe(false);
    });
  });

  describe('Economy ops', () => {
    async function fund(userId: string): Promise<void> {
      await economyService.creditFromIap(
        userId,
        IapProvider.Google,
        { devTransactionId: `admin-econ-${userId}-${++seedCounter}` },
        'com.litmatch.diamond.1200',
      );
    }

    async function fundAndGetTransactionId(userId: string): Promise<string> {
      const result = await economyService.creditFromIap(
        userId,
        IapProvider.Google,
        { devTransactionId: `admin-econ-tx-${userId}-${++seedCounter}` },
        'com.litmatch.diamond.1200',
      );
      return result.transactionId;
    }

    async function walletBalance(userId: string): Promise<number> {
      const wallet = await ds.getRepository(Wallet).findOneBy({ userId });
      return Number(wallet?.balance ?? 0);
    }

    it('getWallet: trả đúng balance sau khi fund', async () => {
      const user = await createUser('econ-wallet');
      await fund(user.id);

      const wallet = await admin.getWallet(user.id);
      expect(wallet.balance).toBe('1200');
    });

    it('listTransactions: thấy giao dịch actor tự thực hiện (IAP credit)', async () => {
      const user = await createUser('econ-list-tx');
      await fund(user.id);

      const page = await admin.listTransactions(user.id, 20);
      expect(page.items.length).toBeGreaterThanOrEqual(1);
      expect(page.items[0].diamondDelta).toBe('1200');
    });

    it('refundTransaction: hoàn tiền + ghi ĐÚNG 1 dòng audit atomic, balance quay lại', async () => {
      const actor = await createUser('econ-refund-actor');
      const user = await createUser('econ-refund-user');
      const transactionId = await fundAndGetTransactionId(user.id);
      expect(await walletBalance(user.id)).toBe(1200);

      const result = await admin.refundTransaction(
        actor.id,
        transactionId,
        'admin test refund',
      );
      expect(result.transactionId).toBe(transactionId);
      expect(result.reversalTransactionId).not.toBe(transactionId);

      expect(await walletBalance(user.id)).toBe(0);

      const logs = await ds.getRepository(AdminAuditLog).findBy({
        targetId: transactionId,
        action: 'economy.transaction.refunded',
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].actorUserId).toBe(actor.id);
      expect(logs[0].metadata).toMatchObject({ reason: 'admin test refund' });
    });

    it('refundTransaction: refund lại CÙNG giao dịch lần 2 → TRANSACTION_ALREADY_REVERSED, không ghi audit thêm', async () => {
      const actor = await createUser('econ-double-refund-actor');
      const user = await createUser('econ-double-refund-user');
      const transactionId = await fundAndGetTransactionId(user.id);

      await admin.refundTransaction(actor.id, transactionId, 'lần 1');
      await expect(
        admin.refundTransaction(actor.id, transactionId, 'lần 2'),
      ).rejects.toMatchObject({ code: 'ECONOMY_TRANSACTION_ALREADY_REVERSED' });

      const logs = await ds.getRepository(AdminAuditLog).findBy({
        targetId: transactionId,
        action: 'economy.transaction.refunded',
      });
      expect(logs).toHaveLength(1); // chỉ lần 1 thành công
    });

    it('refundTransaction: giao dịch không tồn tại → 404, không ghi audit', async () => {
      const actor = await createUser('econ-missing-tx-actor');
      const fakeId = '00000000-0000-4000-8000-000000000099';
      await expect(
        admin.refundTransaction(actor.id, fakeId, 'reason'),
      ).rejects.toMatchObject({ code: 'ECONOMY_TRANSACTION_NOT_FOUND' });

      const logs = await ds
        .getRepository(AdminAuditLog)
        .findBy({ targetId: fakeId });
      expect(logs).toHaveLength(0);
    });
  });

  describe('Config + broadcast thật', () => {
    it('bật/tắt VIP plan atomic cùng audit với target id không phải UUID', async () => {
      const actor = await createUser('config-actor');

      const updated = await admin.setVipPlanActive(actor.id, 'vip-30d', false);
      expect(updated.active).toBe(false);
      expect(
        await ds.getRepository(VipPlan).findOneByOrFail({ id: 'vip-30d' }),
      ).toMatchObject({ active: false });

      const logs = await ds.getRepository(AdminAuditLog).findBy({
        targetId: 'vip-30d',
        action: 'economy.vip_plan.updated',
      });
      expect(logs).toHaveLength(1);
      expect(logs[0].metadata).toMatchObject({ active: false });

      // Không để thay đổi catalog của test này làm hỏng test/suite chạy sau.
      await admin.setVipPlanActive(actor.id, 'vip-30d', true);
    });

    describe('broadcast nền (ADR 0013)', () => {
      const sleep = (ms: number) =>
        new Promise((resolve) => setTimeout(resolve, ms));

      async function drain(
        job: BroadcastDispatchJob = broadcastJob,
      ): Promise<void> {
        for (let i = 0; i < 500; i += 1) {
          if ((await job.runOnce()) === 0) return;
        }
        throw new Error('broadcast không chạy xong sau 500 tick');
      }
      const titled = (title: string) =>
        ds.query<Array<{ user_id: string }>>(
          `SELECT user_id FROM notifications
            WHERE type = 'admin_broadcast' AND payload->>'title' = $1`,
          [title],
        );
      const reload = (id: string) =>
        ds.getRepository(NotificationBroadcast).findOneByOrFail({ id });

      // Xả broadcast còn dở của test trước để mỗi test bắt đầu từ hàng đợi rỗng.
      beforeEach(async () => {
        await drain();
      });

      it('xếp hàng không gửi trong request: ghi hàng queued + audit queued, chưa có thông báo nào', async () => {
        const actor = await createUser('bc-queue-actor');
        const title = `Tin xếp hàng ${actor.id}`;

        const result = await admin.broadcastNotification(actor.id, {
          title,
          body: 'Nội dung',
          audience: BroadcastAudience.All,
        });

        expect(result.status).toBe(BroadcastStatus.Queued);
        expect(await titled(title)).toHaveLength(0);
        expect(await admin.getBroadcast(result.broadcastId)).toMatchObject({
          status: BroadcastStatus.Queued,
          recipientCount: 0,
          cursorUserId: null,
          audience: BroadcastAudience.All,
        });
        expect(
          await ds.getRepository(AdminAuditLog).findBy({
            targetId: result.broadcastId,
            action: 'notification.broadcast.queued',
          }),
        ).toHaveLength(1);
        await expect(
          admin.getBroadcast('00000000-0000-4000-8000-000000000000'),
        ).rejects.toMatchObject({ code: AdminErrors.BROADCAST_NOT_FOUND });
      });

      it('audience VIP/Free lọc theo ví còn hạn VIP; hoàn tất ghi audit completed với số người nhận thật', async () => {
        const actor = await createUser('broadcast-actor');
        const vipUser = await createUser('broadcast-vip');
        const freeUser = await createUser('broadcast-free');
        await ds.getRepository(Wallet).save(
          ds.getRepository(Wallet).create({
            userId: vipUser.id,
            balance: '0',
            earnings: '0',
            vipTier: VipTier.Vip,
            vipExpiresAt: new Date(Date.now() + 86_400_000),
          }),
        );
        const vipTitle = `Tin VIP ${actor.id}`;
        const freeTitle = `Tin Free ${actor.id}`;

        const vip = await admin.broadcastNotification(actor.id, {
          title: vipTitle,
          body: 'Chỉ dành cho VIP',
          audience: BroadcastAudience.Vip,
        });
        await admin.broadcastNotification(actor.id, {
          title: freeTitle,
          body: 'Chỉ dành cho người dùng thường',
          audience: BroadcastAudience.Free,
        });
        await drain();

        const vipRecipients = (await titled(vipTitle)).map((r) => r.user_id);
        expect(vipRecipients).toContain(vipUser.id);
        expect(vipRecipients).not.toContain(freeUser.id);
        const freeRecipients = (await titled(freeTitle)).map((r) => r.user_id);
        expect(freeRecipients).toContain(freeUser.id);
        expect(freeRecipients).not.toContain(vipUser.id);

        const vipRow = await reload(vip.broadcastId);
        expect(vipRow.status).toBe(BroadcastStatus.Completed);
        expect(vipRow.completedAt).not.toBeNull();
        expect(vipRow.recipientCount).toBe(vipRecipients.length);
        const [completed] = await ds.getRepository(AdminAuditLog).findBy({
          targetId: vip.broadcastId,
          action: 'notification.broadcast.completed',
        });
        expect(completed.metadata).toMatchObject({
          audience: BroadcastAudience.Vip,
          recipientCount: vipRecipients.length,
        });
      });

      it('chạy nhiều lô: cursor tiến dần, pod khác chạy tiếp đúng chỗ, không trùng không sót', async () => {
        const actor = await createUser('bc-resume-actor');
        const users = [actor];
        for (let i = 0; i < 4; i += 1)
          users.push(await createUser('bc-resume'));
        await sleep(10);
        const title = `Tin nhiều lô ${actor.id}`;
        const { broadcastId } = await admin.broadcastNotification(actor.id, {
          title,
          body: 'x',
          audience: BroadcastAudience.All,
        });
        pushSend.mockClear();

        CONFIG['ADMIN_BROADCAST_BATCH_SIZE'] = 2;
        CONFIG['ADMIN_BROADCAST_MAX_BATCHES_PER_TICK'] = 1;
        try {
          expect(await broadcastJob.runOnce()).toBe(1);
          const midway = await reload(broadcastId);
          expect(midway).toMatchObject({
            status: BroadcastStatus.Running,
            recipientCount: 2,
          });
          expect(midway.cursorUserId).not.toBeNull();
          expect(midway.startedAt).not.toBeNull();
          expect(midway.completedAt).toBeNull();
          // Instance mới (không chia sẻ trạng thái bộ nhớ) = pod khác tiếp quản từ cursor đã commit.
          await drain(makeBroadcastJob());
        } finally {
          CONFIG['ADMIN_BROADCAST_BATCH_SIZE'] = 500;
          CONFIG['ADMIN_BROADCAST_MAX_BATCHES_PER_TICK'] = 20;
        }

        const recipients = (await titled(title)).map((r) => r.user_id);
        expect(new Set(recipients).size).toBe(recipients.length);
        for (const user of users) expect(recipients).toContain(user.id);
        expect(await reload(broadcastId)).toMatchObject({
          status: BroadcastStatus.Completed,
          recipientCount: recipients.length,
        });
        const mine = new Set(users.map((user) => user.id));
        const pushed = (
          pushSend.mock.calls as Array<[{ recipientId: string }]>
        ).filter(([message]) => mine.has(message.recipientId));
        expect(pushed).toHaveLength(users.length);
      });

      it('tài khoản đăng ký sau lúc tạo broadcast và user bị ban không nhận thông báo', async () => {
        const actor = await createUser('bc-scope-actor');
        const regular = await createUser('bc-scope-regular');
        const banned = await createUser('bc-scope-banned');
        await admin.banUser(actor.id, banned.id);
        await sleep(10);
        const title = `Tin phạm vi ${actor.id}`;
        await admin.broadcastNotification(actor.id, {
          title,
          body: 'x',
          audience: BroadcastAudience.All,
        });
        await sleep(10);
        const late = await createUser('bc-scope-late');

        await drain();

        const recipients = (await titled(title)).map((r) => r.user_id);
        expect(recipients).toContain(regular.id);
        expect(recipients).not.toContain(banned.id);
        expect(recipients).not.toContain(late.id);
      });

      it('lô lỗi giữa chừng rollback sạch; lỗi liên tiếp quá ngưỡng thì failed + audit và không chặn broadcast sau', async () => {
        const actor = await createUser('bc-fail-actor');
        const title = `Tin lỗi ${actor.id}`;
        const original =
          notificationService.createBroadcastWithManager.bind(
            notificationService,
          );
        const spy = jest
          .spyOn(notificationService, 'createBroadcastWithManager')
          .mockImplementation(async (manager, ids, input) => {
            await original(manager, ids, input);
            throw new Error('lỗi sau khi ghi');
          });
        let failedId: string;
        try {
          failedId = (
            await admin.broadcastNotification(actor.id, {
              title,
              body: 'x',
              audience: BroadcastAudience.All,
            })
          ).broadcastId;

          expect(await broadcastJob.runOnce()).toBe(0);
          const first = await reload(failedId);
          expect(first).toMatchObject({
            status: BroadcastStatus.Queued,
            failureCount: 1,
            recipientCount: 0,
            cursorUserId: null,
          });
          expect(first.lastError).toContain('lỗi sau khi ghi');
          // Lô đã INSERT trước khi lỗi phải bị rollback cùng transaction.
          expect(await titled(title)).toHaveLength(0);

          for (let i = 0; i < 4; i += 1) await broadcastJob.runOnce();
          expect((await reload(failedId)).status).toBe(BroadcastStatus.Failed);
          expect(
            await ds.getRepository(AdminAuditLog).findBy({
              targetId: failedId,
              action: 'notification.broadcast.failed',
            }),
          ).toHaveLength(1);
        } finally {
          spy.mockRestore();
        }

        const next = await admin.broadcastNotification(actor.id, {
          title: `${title} sau`,
          body: 'x',
          audience: BroadcastAudience.All,
        });
        await drain();
        expect(await reload(next.broadcastId)).toMatchObject({
          status: BroadcastStatus.Completed,
        });
        expect(await titled(title)).toHaveLength(0);
      });
    });
  });

  describe('Support ticket', () => {
    it('tạo idempotent, user theo dõi và admin xử lý cùng audit log', async () => {
      const actor = await createUser('support-admin');
      actor.role = Roles.Admin;
      await ds.getRepository(User).save(actor);
      const reporter = await createUser('support-reporter');
      const support = new SupportService(ds.getRepository(SupportTicket));

      const first = await support.createTicket(
        reporter.id,
        {
          category: SupportTicketCategory.Bug,
          message: 'Ứng dụng bị lỗi khi mở phòng',
        },
        'ticket-key-1',
      );
      const replay = await support.createTicket(
        reporter.id,
        {
          category: SupportTicketCategory.Bug,
          message: 'Ứng dụng bị lỗi khi mở phòng',
        },
        'ticket-key-1',
      );
      expect(replay.id).toBe(first.id);
      expect((await support.listMine(reporter.id, 20)).items).toHaveLength(1);

      const updated = await admin.updateSupportTicket(actor.id, first.id, {
        status: SupportTicketStatus.Resolved,
        staffResponse: 'Đã khắc phục, vui lòng thử lại.',
      });
      expect(updated).toMatchObject({
        status: SupportTicketStatus.Resolved,
        staffResponse: 'Đã khắc phục, vui lòng thử lại.',
      });
      expect(
        await ds.getRepository(AdminAuditLog).findBy({
          targetId: first.id,
          action: 'support.ticket.updated',
        }),
      ).toHaveLength(1);
    });
  });

  describe('Permission + staff enforcement', () => {
    it('đọc policy seed và cập nhật moderator atomic cùng audit', async () => {
      const actor = await createUser('permission-actor');
      actor.role = Roles.Admin;
      await ds.getRepository(User).save(actor);

      expect(
        await admin.hasPermission(actor.id, AdminPermission.ManagePermissions),
      ).toBe(true);
      expect(
        (await admin.getPermissionMatrix()).find(
          (item) => item.permission === AdminPermission.ManageGifts,
        ),
      ).toMatchObject({ moderator: false, admin: true });

      await admin.setRolePermission(
        actor.id,
        Roles.Moderator,
        AdminPermission.ManageGifts,
        true,
      );
      expect(
        await ds.getRepository(AdminRolePermission).findOneByOrFail({
          role: Roles.Moderator,
          permission: AdminPermission.ManageGifts,
        }),
      ).toMatchObject({ enabled: true });
      expect(
        await ds.getRepository(AdminAuditLog).findBy({
          targetId: 'moderator:manage_gifts',
          action: 'admin.role_permission.updated',
        }),
      ).toHaveLength(1);
    });

    it('không cho tắt manage_permissions của admin', async () => {
      const actor = await createUser('permission-lockout');
      actor.role = Roles.Admin;
      await ds.getRepository(User).save(actor);

      await expect(
        admin.setRolePermission(
          actor.id,
          Roles.Admin,
          AdminPermission.ManagePermissions,
          false,
        ),
      ).rejects.toMatchObject({
        code: AdminErrors.CANNOT_DISABLE_PERMISSION_CONTROL,
      });
    });

    it('đổi role staff persist + audit; không cho actor tự hạ chính mình', async () => {
      const actor = await createUser('staff-actor');
      actor.role = Roles.Admin;
      await ds.getRepository(User).save(actor);
      const target = await createUser('staff-target');

      const promoted = await admin.setStaffRole(
        actor.id,
        target.id,
        Roles.Moderator,
      );
      expect(promoted.role).toBe(Roles.Moderator);
      expect((await admin.listStaff()).map((staff) => staff.id)).toContain(
        target.id,
      );
      expect(
        await ds.getRepository(AdminAuditLog).findBy({
          targetId: target.id,
          action: 'admin.staff_role.updated',
        }),
      ).toHaveLength(1);

      await expect(
        admin.setStaffRole(actor.id, actor.id, Roles.User),
      ).rejects.toMatchObject({ code: AdminErrors.CANNOT_CHANGE_OWN_ROLE });
    });
  });

  it('dashboard tổng hợp user, diamond system_revenue và audit thật', async () => {
    const user = await createUser('dashboard-user');
    await economyService.creditFromIap(
      user.id,
      IapProvider.Google,
      { devTransactionId: `dashboard-${++seedCounter}` },
      'com.litmatch.diamond.1200',
    );
    await economyService.purchaseVip(
      user.id,
      'vip-30d',
      `dashboard-vip-${seedCounter}`,
    );

    const dashboard = await admin.getDashboard();
    expect(dashboard.activeUsers).toBeGreaterThan(0);
    expect(BigInt(dashboard.totalDiamondSpentSevenDays)).toBeGreaterThanOrEqual(
      500n,
    );
    expect(dashboard.dailyDiamondSpent).toHaveLength(7);
    expect(dashboard.userTiers.vip).toBeGreaterThanOrEqual(1);
    expect(dashboard.recentActivities.length).toBeGreaterThan(0);
  });
});
