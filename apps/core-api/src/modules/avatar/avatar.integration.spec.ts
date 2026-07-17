import { Registry } from 'prom-client';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserProfilePreferences1755800000000 } from '../../database/migrations/1755800000000-user-profile-preferences';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { Avatar1753100000000 } from '../../database/migrations/1753100000000-avatar';

import { AvatarService } from './avatar.service';
import { AvatarErrors } from './avatar.errors';
import { AvatarAsset, AvatarSlot } from './entities/avatar-asset.entity';
import { UserAvatarConfig } from './entities/user-avatar-config.entity';
import { UserAvatarItem } from './entities/user-avatar-item.entity';
import { EconomyMetrics } from '../economy/economy.metrics';
import { EconomyService } from '../economy/economy.service';
import { LedgerService } from '../economy/services/ledger.service';
import { LedgerAccount } from '../economy/entities/ledger-account.entity';
import { LedgerEntry } from '../economy/entities/ledger-entry.entity';
import { OutboxEvent } from '../economy/entities/outbox-event.entity';
import { LedgerTransaction } from '../economy/entities/transaction.entity';
import { Wallet } from '../economy/entities/wallet.entity';
import {
  IapProduct,
  IapProvider,
  IapReceipt,
} from '../economy/entities/iap.entities';
import { VipPlan } from '../economy/entities/vip-plan.entity';
import { Gender, User } from '../user';

import type { IapVerifier } from '../economy/ports/iap-verifier';

/**
 * Integration test Avatar trên Postgres thật (docs/10 § Economy + § Avatar): mua item trả phí
 * qua spendDiamond generic (Nợ=Có, idempotent replay), IDOR trang bị item chưa sở hữu, race
 * lazy-init default config. DB riêng `<tên gốc>_avatar`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[avatar.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy luồng tiền avatar trên Postgres thật',
  );
}

jest.setTimeout(60_000);

d('Avatar integration (Postgres thật)', () => {
  let ds: DataSource;
  let economy: EconomyService;
  let avatar: AvatarService;
  let seedCounter = 0;

  async function createUser(nickname: string): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest: false,
        region: 'VN',
        birthDate: '2000-01-01',
        gender: Gender.Unknown,
      }),
    );
  }

  async function fund(userId: string): Promise<void> {
    await economy.creditFromIap(
      userId,
      IapProvider.Google,
      { devTransactionId: `fund-${userId}-${++seedCounter}` },
      'com.litmatch.diamond.1200',
    );
  }

  async function walletOf(userId: string): Promise<number> {
    const wallet = await ds.getRepository(Wallet).findOneBy({ userId });
    return Number(wallet?.balance ?? 0);
  }

  async function assetByCode(code: string): Promise<AvatarAsset> {
    return ds.getRepository(AvatarAsset).findOneByOrFail({ code });
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_avatar`;
    url.pathname = `/${dbName}`;

    const adminUrl = new URL(INTEGRATION_DB_URL as string);
    adminUrl.pathname = '/postgres';
    const admin = new DataSource({
      type: 'postgres',
      url: adminUrl.toString(),
    });
    await admin.initialize();
    const exists = await admin.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName],
    );
    if (exists.length === 0) await admin.query(`CREATE DATABASE "${dbName}"`);
    await admin.destroy();

    ds = new DataSource({
      type: 'postgres',
      url: url.toString(),
      entities: [
        User,
        LedgerAccount,
        LedgerTransaction,
        LedgerEntry,
        Wallet,
        IapProduct,
        IapReceipt,
        VipPlan,
        OutboxEvent,
        AvatarAsset,
        UserAvatarItem,
        UserAvatarConfig,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserProfilePreferences1755800000000,
        UserRole1753600000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        Avatar1753100000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    const ledger = new LedgerService(ds, new EconomyMetrics(new Registry()));
    const stubVerifier = {
      verify: async (_p: IapProvider, payload: Record<string, unknown>) => ({
        providerTransactionId: String(payload['devTransactionId']),
      }),
    } as IapVerifier;
    economy = new EconomyService(
      ds.getRepository(Wallet),
      ds.getRepository(IapProduct),
      ds.getRepository(VipPlan),
      ds.getRepository(LedgerTransaction),
      ledger,
      stubVerifier,
    );
    avatar = new AvatarService(
      ds,
      ds.getRepository(AvatarAsset),
      ds.getRepository(UserAvatarItem),
      ds.getRepository(UserAvatarConfig),
      economy,
    );
  });

  afterAll(async () => {
    await ds.destroy();
  });

  it('mua item trả phí: trừ đúng giá catalog, Nợ=Có, ghi sở hữu; retry cùng key không trừ 2 lần', async () => {
    const user = await createUser('buy-user');
    await fund(user.id);
    const suit = await assetByCode('outfit-suit'); // 150 DIA

    const first = await avatar.buy(user.id, suit.id, 'buy-key-1');
    expect(first.replayed).toBe(false);
    expect(await walletOf(user.id)).toBe(1200 - 150);

    const owned = await ds
      .getRepository(UserAvatarItem)
      .findOneBy({ userId: user.id, avatarAssetId: suit.id });
    expect(owned).not.toBeNull();

    // bất biến double-entry: Nợ = Có cho transaction vừa tạo
    const sums: Array<{ debit: string; credit: string }> = await ds.query(
      `SELECT SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) AS debit,
              SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) AS credit
         FROM ledger_entries le JOIN transactions t ON t.id = le.transaction_id
        WHERE t.idempotency_key = $1`,
      [`avatar:buy:${user.id}:buy-key-1`],
    );
    expect(sums[0].debit).toBe(sums[0].credit);

    // retry cùng idempotency key → KHÔNG trừ tiền lần 2
    const replay = await avatar.buy(user.id, suit.id, 'buy-key-1');
    expect(replay.replayed).toBe(true);
    expect(await walletOf(user.id)).toBe(1200 - 150);
    const ownedCount = await ds
      .getRepository(UserAvatarItem)
      .countBy({ userId: user.id, avatarAssetId: suit.id });
    expect(ownedCount).toBe(1); // không double-grant
  });

  it('không đủ diamond → lỗi, KHÔNG trừ tiền, KHÔNG ghi sở hữu', async () => {
    const user = await createUser('poor-user');
    const crown = await assetByCode('accessory-crown'); // 300 DIA, ví = 0

    await expect(avatar.buy(user.id, crown.id, 'poor-key')).rejects.toThrow();
    expect(await walletOf(user.id)).toBe(0);
    const owned = await ds
      .getRepository(UserAvatarItem)
      .findOneBy({ userId: user.id, avatarAssetId: crown.id });
    expect(owned).toBeNull();
  });

  it('claim item free đúng loại; gọi buy() cho item free hoặc claim() cho item trả phí đều bị chặn', async () => {
    const user = await createUser('claim-user');
    const hairFree = await assetByCode('hair-default');
    const hairPaid = await assetByCode('hair-wavy-gold');

    await avatar.claim(user.id, hairFree.id);
    await avatar.claim(user.id, hairFree.id); // idempotent, không lỗi

    await expect(avatar.claim(user.id, hairPaid.id)).rejects.toMatchObject({
      code: AvatarErrors.ASSET_REQUIRES_PURCHASE,
    });
    await expect(avatar.buy(user.id, hairFree.id, 'x')).rejects.toMatchObject({
      code: AvatarErrors.ASSET_IS_FREE,
    });
  });

  it('IDOR: trang bị item chưa sở hữu bị chặn; sai slot bị chặn; đúng sở hữu + đúng slot thì thành công', async () => {
    const owner = await createUser('equip-owner');
    const outsider = await createUser('equip-outsider');
    await fund(owner.id);
    const suit = await assetByCode('outfit-suit');
    await avatar.buy(owner.id, suit.id, 'equip-key-1');

    // outsider chưa sở hữu → 403
    await expect(
      avatar.equip(outsider.id, AvatarSlot.Outfit, suit.id),
    ).rejects.toMatchObject({ code: AvatarErrors.ITEM_NOT_OWNED });

    // sai slot (suit là outfit, gửi slot=hair) → 422
    await expect(
      avatar.equip(owner.id, AvatarSlot.Hair, suit.id),
    ).rejects.toMatchObject({ code: AvatarErrors.ASSET_SLOT_MISMATCH });

    // đúng sở hữu + đúng slot → thành công, layer xuất hiện trong /me
    const result = await avatar.equip(owner.id, AvatarSlot.Outfit, suit.id);
    expect(result.config.outfitAssetId).toBe(suit.id);
    expect(result.layers.some((l) => l.id === suit.id)).toBe(true);
  });

  it('getMyAvatar lazy-init default: mỗi slot lấy item free rẻ nhất (sortOrder thấp nhất)', async () => {
    const user = await createUser('default-user');
    const { config, layers } = await avatar.getMyAvatar(user.id);
    expect(config.baseAssetId).not.toBeNull();
    expect(config.hairAssetId).not.toBeNull();
    // layer sắp theo zIndex tăng dần
    const zIndexes = layers.map((l) => l.zIndex);
    expect(zIndexes).toEqual([...zIndexes].sort((a, b) => a - b));

    // gọi lại lần 2 vẫn cùng config (không tạo mới/không lỗi)
    const second = await avatar.getMyAvatar(user.id);
    expect(second.config.baseAssetId).toBe(config.baseAssetId);
  });

  it('RACE: 2 lời gọi getMyAvatar song song cho user MỚI vẫn ra đúng 1 config (không lỗi 500)', async () => {
    const user = await createUser('race-default-user');
    const [a, b] = await Promise.all([
      avatar.getMyAvatar(user.id),
      avatar.getMyAvatar(user.id),
    ]);
    expect(a.config.baseAssetId).toBe(b.config.baseAssetId);
    const rows = await ds
      .getRepository(UserAvatarConfig)
      .countBy({ userId: user.id });
    expect(rows).toBe(1);
  });

  it('xem avatar người khác (public) không cần bạn bè; user chưa từng gọi getMyAvatar vẫn trả rỗng, không lỗi', async () => {
    const user = await createUser('public-view-user');
    const result = await avatar.getAvatarOf(user.id);
    expect(result.layers).toEqual([]);
    expect(result.config.userId).toBe(user.id);
  });

  it('catalog: chỉ trả item active, lọc theo slot đúng', async () => {
    const hairs = await avatar.listCatalog(AvatarSlot.Hair);
    expect(hairs.every((a) => a.slot === AvatarSlot.Hair)).toBe(true);
    expect(hairs.length).toBeGreaterThanOrEqual(2); // hair-default + hair-wavy-gold
  });
});
