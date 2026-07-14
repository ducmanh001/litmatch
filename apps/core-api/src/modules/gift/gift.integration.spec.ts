import { Registry } from 'prom-client';
import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { UserRole1753600000000 } from '../../database/migrations/1753600000000-user-role';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { Calling1752500000000 } from '../../database/migrations/1752500000000-calling';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { PartyRoomGift1752700000000 } from '../../database/migrations/1752700000000-party-room-gift';
import { Safety1752800000000 } from '../../database/migrations/1752800000000-safety';
import { Notification1753000000000 } from '../../database/migrations/1753000000000-notification';
import { PartyRoomLivekitUrl1753500000000 } from '../../database/migrations/1753500000000-party-room-livekit-url';
import { PartyRoomHostDisconnectGrace1753900000000 } from '../../database/migrations/1753900000000-party-room-host-disconnect-grace';

import { GiftService } from './gift.service';
import { Gift } from './entities/gift.entity';
import { GiftEvent } from './entities/gift-event.entity';
import { PartyRoomService } from '../party-room/party-room.service';
import { PartyRoom } from '../party-room/entities/party-room.entity';
import { PartyRoomMember } from '../party-room/entities/party-room-member.entity';
import { EconomyService } from '../economy/economy.service';
import { EconomyMetrics } from '../economy/economy.metrics';
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
import { NotificationService } from '../notification';
import {
  Notification,
  NotificationType,
} from '../notification/entities/notification.entity';
import { Gender, User, UserService } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type { IapVerifier } from '../economy/ports/iap-verifier';
import type { PartyLivekitRoomPort } from '../party-room/ports/livekit-party-room';

/**
 * Integration test Gift trên Postgres thật (docs/10 § Gift + § Economy):
 * 1 transaction 2 chân độc lập theo currency, idempotent replay (kể cả race song song),
 * atomicity trừ-DIA/cộng-PTS/GiftEvent, guest không nhận PTS, re-check giá server.
 * DB riêng `<tên gốc>_gift`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  console.warn(
    '[gift.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy luồng tiền gift trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  LIVEKIT_URL: 'ws://localhost:7880',
  LIVEKIT_REGION_URLS: '', // single-region — resolver GĐ7 không đụng tới ở suite này
  PARTY_MAX_SPEAKERS: 8,
  PARTY_MAX_MEMBERS: 100,
  PARTY_TOKEN_TTL_SECONDS: 120,
  PARTY_EMPTY_ROOM_TIMEOUT_SECONDS: 300,
  PARTY_STALE_ROOM_SECONDS: 60,
  PARTY_TITLE_MAX_LENGTH: 100,
  GIFT_POINTS_RATE_PERCENT: 40,
  USER_DEFAULT_AVATAR_ID: 'default-01',
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
  get: (key: string) => CONFIG[key],
} as unknown as ConfigService<CoreApiEnv, true>;

d('Gift integration (Postgres thật)', () => {
  let ds: DataSource;
  let economy: EconomyService;
  let party: PartyRoomService;
  let gift: GiftService;
  let notification: NotificationService;
  /** Mọi publish realtime (cả party.* lẫn gift.sent) — filter theo event khi assert. */
  const published: Array<{ channel: string; event: string }> = [];
  const giftSentCount = (): number =>
    published.filter((p) => p.event === 'gift.sent').length;

  const livekitStub = {
    createRoom: async () => undefined,
    mintJoinToken: async () => 'tok',
    updateParticipantPublish: async () => 'updated' as const,
    removeParticipant: async () => undefined,
    deleteRoom: async () => undefined,
    roomExists: async () => true,
    receiveWebhook: async () => {
      throw new Error('không dùng trong suite này');
    },
  } as PartyLivekitRoomPort;

  const auth = (userId: string): AuthenticatedUser => ({
    userId,
    isGuest: false,
    role: 'user',
  });

  let seedCounter = 0;

  async function createUser(nickname: string, isGuest = false): Promise<User> {
    const repo = ds.getRepository(User);
    return repo.save(
      repo.create({
        nickname,
        avatarId: 'default-01',
        isGuest,
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

  async function walletOf(
    userId: string,
  ): Promise<{ balance: number; earnings: number }> {
    const wallet = await ds.getRepository(Wallet).findOneBy({ userId });
    return {
      balance: Number(wallet?.balance ?? 0),
      earnings: Number(wallet?.earnings ?? 0),
    };
  }

  /** Host + sender + receiver trong 1 phòng active. */
  async function roomWith(
    sender: User,
    receiver: User,
  ): Promise<{ roomId: string }> {
    const host = await createUser(`host-${++seedCounter}`);
    const { room } = await party.createRoom(auth(host.id), 'Phòng gift');
    await party.joinRoom(auth(sender.id), room.id);
    await party.joinRoom(auth(receiver.id), room.id);
    return { roomId: room.id };
  }

  async function giftByCode(code: string): Promise<Gift> {
    return ds.getRepository(Gift).findOneByOrFail({ code });
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_gift`;
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
        PartyRoom,
        PartyRoomMember,
        Gift,
        GiftEvent,
        LedgerAccount,
        LedgerTransaction,
        LedgerEntry,
        Wallet,
        IapProduct,
        IapReceipt,
        VipPlan,
        OutboxEvent,
        Notification,
      ],
      migrations: [
        InitAuthUser1751900000000,
        UserRole1753600000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        Calling1752500000000,
        FriendChat1752600000000,
        PartyRoomGift1752700000000,
        Safety1752800000000,
        Notification1753000000000,
        PartyRoomLivekitUrl1753500000000,
        PartyRoomHostDisconnectGrace1753900000000,
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
    const userService = new UserService(ds.getRepository(User), configStub);
    const redisStub = {
      publish: async (channel: string, payload: string) => {
        published.push({
          channel,
          event: (JSON.parse(payload) as { event: string }).event,
        });
        return 1;
      },
    } as never;
    party = new PartyRoomService(
      ds,
      ds.getRepository(PartyRoom),
      ds.getRepository(PartyRoomMember),
      livekitStub,
      configStub,
      userService,
      redisStub,
    );
    // Push chỉ là stub no-op ở suite này — in-app Notification (nguồn sự thật) test thật bên dưới
    notification = new NotificationService(ds.getRepository(Notification), {
      send: async () => undefined,
    } as never);
    gift = new GiftService(
      ds.getRepository(Gift),
      ds.getRepository(GiftEvent),
      economy,
      party,
      userService,
      notification,
      configStub,
      redisStub,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(() => {
    published.length = 0;
  });

  it('happy path: trừ DIA người tặng + cộng PTS người nhận trong 1 transaction, 2 chân TỰ CÂN theo currency', async () => {
    const [sender, receiver] = await Promise.all([
      createUser('hp-sender'),
      createUser('hp-receiver'),
    ]);
    await fund(sender.id);
    const { roomId } = await roomWith(sender, receiver);
    const teddy = await giftByCode('teddy'); // 99 DIA

    const { giftEvent, replayed } = await gift.sendGift(
      auth(sender.id),
      roomId,
      teddy.id,
      receiver.id,
      'hp-key-1',
    );

    expect(replayed).toBe(false);
    expect(giftEvent.priceDiamond).toBe(99);
    expect(giftEvent.pointsAwarded).toBe(Math.floor((99 * 40) / 100)); // 39
    expect(giftEvent.pointsRatePercent).toBe(40);

    expect(await walletOf(sender.id)).toEqual({
      balance: 1200 - 99,
      earnings: 0,
    });
    // người nhận KHÔNG nhận diamond (docs/06 § Gift) — chỉ nhận PTS
    expect(await walletOf(receiver.id)).toEqual({ balance: 0, earnings: 39 });

    // bất biến double-entry: Nợ = Có theo TỪNG currency của đúng transaction này
    const sums: Array<{ currency: string; debit: string; credit: string }> =
      await ds.query(
        `SELECT currency,
                SUM(CASE WHEN direction = 'debit' THEN amount ELSE 0 END) AS debit,
                SUM(CASE WHEN direction = 'credit' THEN amount ELSE 0 END) AS credit
           FROM ledger_entries WHERE transaction_id = $1 GROUP BY currency`,
        [giftEvent.transactionId],
      );
    expect(sums).toHaveLength(2); // DIA + PTS
    for (const row of sums) expect(row.debit).toBe(row.credit);

    // chênh lệch giá − điểm ở lại system_gift_pool (chống rửa diamond 1:1)
    const pool: Array<{ balance: string }> = await ds.query(
      `SELECT COALESCE(SUM(CASE WHEN le.direction = 'credit' THEN le.amount ELSE -le.amount END), 0) AS balance
         FROM ledger_entries le JOIN ledger_accounts la ON la.id = le.account_id
        WHERE la.kind = 'system_gift_pool'`,
    );
    expect(Number(pool[0].balance)).toBeGreaterThanOrEqual(99);

    // outbox: event nghiệp vụ gift.sent ghi CÙNG transaction
    const outbox = await ds
      .getRepository(OutboxEvent)
      .findBy({ eventType: 'economy.gift.sent' });
    expect(
      outbox.some(
        (e) =>
          (e.payload as { transactionId?: string }).transactionId ===
          giftEvent.transactionId,
      ),
    ).toBe(true);

    // realtime fanout cho 3 member (host + sender + receiver)
    expect(giftSentCount()).toBe(3);

    // in-app notification gift_received cho người nhận — ghi ATOMIC cùng transaction tiền
    // (docs/services/notification-service.md § 3), sender lộ danh tính là ĐÚNG (Party Room không ẩn danh)
    const notifications = await ds
      .getRepository(Notification)
      .findBy({ userId: receiver.id, type: NotificationType.GiftReceived });
    expect(notifications).toHaveLength(1);
    expect(notifications[0].payload).toMatchObject({
      roomId,
      senderUserId: sender.id,
      giftCode: 'teddy',
      priceDiamond: 99,
    });
  });

  it('idempotency: retry tuần tự + 2 request SONG SONG cùng key → trừ tiền đúng 1 lần, 1 GiftEvent', async () => {
    const [sender, receiver] = await Promise.all([
      createUser('idem-sender'),
      createUser('idem-receiver'),
    ]);
    await fund(sender.id);
    const { roomId } = await roomWith(sender, receiver);
    const rose = await giftByCode('rose'); // 1 DIA

    const [r1, r2] = await Promise.all([
      gift.sendGift(auth(sender.id), roomId, rose.id, receiver.id, 'race-key'),
      gift.sendGift(auth(sender.id), roomId, rose.id, receiver.id, 'race-key'),
    ]);
    expect(r1.giftEvent.id).toBe(r2.giftEvent.id);
    expect([r1.replayed, r2.replayed].filter(Boolean)).toHaveLength(1);

    const r3 = await gift.sendGift(
      auth(sender.id),
      roomId,
      rose.id,
      receiver.id,
      'race-key',
    );
    expect(r3.replayed).toBe(true);
    expect(r3.giftEvent.id).toBe(r1.giftEvent.id);

    expect((await walletOf(sender.id)).balance).toBe(1200 - 1);
    expect(
      await ds.getRepository(GiftEvent).countBy({ senderUserId: sender.id }),
    ).toBe(1);
    // realtime chỉ bắn cho lần ghi sổ thật (3 member × 1 lần), replay không bắn lại
    expect(giftSentCount()).toBe(3);
  });

  it('atomicity: side effect trong withinTransaction fail → KHÔNG trừ DIA, KHÔNG cộng PTS, không GiftEvent', async () => {
    const [sender, receiver] = await Promise.all([
      createUser('atom-sender'),
      createUser('atom-receiver'),
    ]);
    await fund(sender.id);

    await expect(
      economy.sendGift({
        senderUserId: sender.id,
        receiverUserId: receiver.id,
        priceDiamond: 99,
        pointsAwarded: 39,
        idempotencyKey: 'gift:send:atom-test',
        metadata: {},
        withinTransaction: async () => {
          throw new Error('side effect fail (giả lập)');
        },
      }),
    ).rejects.toThrow('side effect fail');

    expect(await walletOf(sender.id)).toEqual({ balance: 1200, earnings: 0 });
    expect(await walletOf(receiver.id)).toEqual({ balance: 0, earnings: 0 });
    expect(
      await ds
        .getRepository(LedgerTransaction)
        .countBy({ idempotencyKey: 'gift:send:atom-test' }),
    ).toBe(0);
  });

  it('không đủ diamond → 422, không GiftEvent, không PTS', async () => {
    const [sender, receiver] = await Promise.all([
      createUser('poor-sender'), // 0 diamond
      createUser('poor-receiver'),
    ]);
    const { roomId } = await roomWith(sender, receiver);
    const crown = await giftByCode('crown'); // 500 DIA

    await expect(
      gift.sendGift(auth(sender.id), roomId, crown.id, receiver.id, 'poor-1'),
    ).rejects.toMatchObject({ code: 'ECONOMY_WALLET_INSUFFICIENT_BALANCE' });

    expect(await walletOf(receiver.id)).toEqual({ balance: 0, earnings: 0 });
    expect(
      await ds.getRepository(GiftEvent).countBy({ senderUserId: sender.id }),
    ).toBe(0);
    expect(giftSentCount()).toBe(0); // không hiệu ứng khi giao dịch fail (docs/10 § Gift)
  });

  it('guest nhận quà: chân PTS = 0 (docs/06 § Gift) — chỉ 2 bút toán DIA, earnings không đổi', async () => {
    const sender = await createUser('g-sender');
    const guest = await createUser('g-guest', true);
    await fund(sender.id);
    const { roomId } = await roomWith(sender, guest);
    const heart = await giftByCode('heart'); // 5 DIA

    const { giftEvent } = await gift.sendGift(
      auth(sender.id),
      roomId,
      heart.id,
      guest.id,
      'guest-1',
    );

    expect(giftEvent.pointsAwarded).toBe(0);
    expect(await walletOf(guest.id)).toEqual({ balance: 0, earnings: 0 });
    const entries = await ds
      .getRepository(LedgerEntry)
      .countBy({ transactionId: giftEvent.transactionId });
    expect(entries).toBe(2); // không có chân PTS
  });

  it('validation nghiệp vụ: tự tặng 400, quà không tồn tại 404, sender/receiver ngoài phòng, phòng đóng', async () => {
    const [sender, receiver, outsider] = await Promise.all([
      createUser('v-sender'),
      createUser('v-receiver'),
      createUser('v-outsider'),
    ]);
    await fund(sender.id);
    const { roomId } = await roomWith(sender, receiver);
    const rose = await giftByCode('rose');

    await expect(
      gift.sendGift(auth(sender.id), roomId, rose.id, sender.id, 'v-1'),
    ).rejects.toMatchObject({ code: 'GIFT_SELF_GIFT_FORBIDDEN' });
    await expect(
      gift.sendGift(
        auth(sender.id),
        roomId,
        '00000000-0000-4000-8000-000000000000',
        receiver.id,
        'v-2',
      ),
    ).rejects.toMatchObject({ code: 'GIFT_GIFT_NOT_FOUND' });
    await expect(
      gift.sendGift(auth(outsider.id), roomId, rose.id, receiver.id, 'v-3'),
    ).rejects.toMatchObject({ code: 'GIFT_SENDER_NOT_IN_ROOM' });
    await expect(
      gift.sendGift(auth(sender.id), roomId, rose.id, outsider.id, 'v-4'),
    ).rejects.toMatchObject({ code: 'GIFT_RECEIVER_NOT_IN_ROOM' });

    // receiver rời phòng rồi mới tặng → chặn
    await party.leaveRoom(auth(receiver.id), roomId);
    await expect(
      gift.sendGift(auth(sender.id), roomId, rose.id, receiver.id, 'v-5'),
    ).rejects.toMatchObject({ code: 'GIFT_RECEIVER_NOT_IN_ROOM' });

    expect((await walletOf(sender.id)).balance).toBe(1200); // không lần nào trừ tiền
  });

  it('chốt chặn giá trị ở economy: pointsAwarded > priceDiamond bị chặn (lỗi lập trình)', async () => {
    const [sender, receiver] = await Promise.all([
      createUser('inv-sender'),
      createUser('inv-receiver'),
    ]);
    await fund(sender.id);

    await expect(
      economy.sendGift({
        senderUserId: sender.id,
        receiverUserId: receiver.id,
        priceDiamond: 10,
        pointsAwarded: 11,
        idempotencyKey: 'gift:send:inv-test',
        metadata: {},
      }),
    ).rejects.toThrow(/không được vượt/);
    await expect(
      economy.sendGift({
        senderUserId: sender.id,
        receiverUserId: sender.id,
        priceDiamond: 10,
        pointsAwarded: 4,
        idempotencyKey: 'gift:send:inv-self',
        metadata: {},
      }),
    ).rejects.toThrow(/tự tặng/);
  });

  it('catalog: chỉ trả quà active, sort theo sortOrder', async () => {
    const catalog = await gift.listCatalog();
    expect(catalog.length).toBeGreaterThanOrEqual(6);
    expect(catalog[0].code).toBe('rose');
    expect(catalog.every((g) => g.active)).toBe(true);
  });
});
