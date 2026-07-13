import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { AdminAuditLog1753700000000 } from '../../database/migrations/1753700000000-admin-audit-log';
import { AuditLogService } from '../../common/audit/audit-log.service';
import { AdminAuditLog } from '../../common/audit/audit-log.entity';
import { Gender, User, UserService, UserStatus } from '../user';

import { AdminService } from './admin.service';
import { AdminErrors } from './admin.errors';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';

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
  AUTH_MIN_AGE: 18,
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
      entities: [User, AdminAuditLog],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        AdminAuditLog1753700000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const userService = new UserService(ds.getRepository(User), configStub);
    const auditLogService = new AuditLogService(
      ds.getRepository(AdminAuditLog),
    );
    admin = new AdminService(ds, userService, auditLogService);
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
});
