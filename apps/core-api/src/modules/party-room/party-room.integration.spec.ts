import { DataSource } from 'typeorm';

import { SnakeNamingStrategy } from '../../database/snake-naming.strategy';
import { InitAuthUser1751900000000 } from '../../database/migrations/1751900000000-init-auth-user';
import { EconomyLedger1752000000000 } from '../../database/migrations/1752000000000-economy-ledger';
import { EconomyRefund1752100000000 } from '../../database/migrations/1752100000000-economy-refund';
import { MatchingCore1752200000000 } from '../../database/migrations/1752200000000-matching-core';
import { MatchingGenderPreference1752300000000 } from '../../database/migrations/1752300000000-matching-gender-preference';
import { SoulMatch1752400000000 } from '../../database/migrations/1752400000000-soul-match';
import { Calling1752500000000 } from '../../database/migrations/1752500000000-calling';
import { FriendChat1752600000000 } from '../../database/migrations/1752600000000-friend-chat';
import { PartyRoomGift1752700000000 } from '../../database/migrations/1752700000000-party-room-gift';

import { PartyRoomService } from './party-room.service';
import { PartyRoomSweeperService } from './jobs/party-room-sweeper.service';
import { partyRoomName } from './party-room.constants';
import {
  PartyRoom,
  PartyRoomCloseReason,
  PartyRoomStatus,
} from './entities/party-room.entity';
import {
  PartyRole,
  PartyRoomMember,
} from './entities/party-room-member.entity';
import { Gender, User } from '../user';

import type { ConfigService } from '@nestjs/config';
import type { SchedulerRegistry } from '@nestjs/schedule';
import type { CoreApiEnv } from '../../config/env.validation';
import type { AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import type {
  PartyLivekitRoomPort,
  UpdatePublishResult,
} from './ports/livekit-party-room';

/**
 * Integration test Party Room trên Postgres thật (docs/10 § Party Room):
 * race speaker cap dưới lock phòng, 1-user-1-phòng ở DB, host rời → đóng phòng,
 * webhook idempotent, sweeper backstop. DB riêng `<tên gốc>_party`.
 */
const INTEGRATION_DB_URL = process.env['INTEGRATION_DB_URL'];
const d = INTEGRATION_DB_URL ? describe : describe.skip;
if (!INTEGRATION_DB_URL) {
  // eslint-disable-next-line no-console
  console.warn(
    '[party-room.integration] BỎ QUA — set INTEGRATION_DB_URL để chạy trên Postgres thật',
  );
}

jest.setTimeout(60_000);

const CONFIG: Record<string, unknown> = {
  LIVEKIT_URL: 'ws://localhost:7880',
  PARTY_MAX_SPEAKERS: 2,
  PARTY_MAX_MEMBERS: 4,
  PARTY_TOKEN_TTL_SECONDS: 120,
  PARTY_EMPTY_ROOM_TIMEOUT_SECONDS: 300,
  PARTY_SWEEPER_INTERVAL_MS: 30_000,
  PARTY_STALE_ROOM_SECONDS: 60,
  PARTY_TITLE_MAX_LENGTH: 100,
};
const configStub = {
  getOrThrow: (key: string) => {
    if (!(key in CONFIG)) throw new Error(`missing config ${key}`);
    return CONFIG[key];
  },
  get: (key: string) => CONFIG[key],
} as unknown as ConfigService<CoreApiEnv, true>;
const schedulerStub = {
  addInterval: () => undefined,
  doesExist: () => false,
  deleteInterval: () => undefined,
} as unknown as SchedulerRegistry;

d('Party Room integration (Postgres thật)', () => {
  let ds: DataSource;
  let party: PartyRoomService;
  let sweeper: PartyRoomSweeperService;

  /** Stub SFU có state — theo dõi lời gọi + cho sweeper đối chiếu roomExists. */
  const sfu = {
    created: new Set<string>(),
    deleted: [] as string[],
    permissionUpdates: [] as Array<{
      room: string;
      identity: string;
      canPublish: boolean;
    }>,
    removed: [] as Array<{ room: string; identity: string }>,
    failNextCreate: false,
  };
  const livekitStub: PartyLivekitRoomPort = {
    createRoom: async (roomName: string) => {
      if (sfu.failNextCreate) {
        sfu.failNextCreate = false;
        throw new Error('SFU down (giả lập)');
      }
      sfu.created.add(roomName);
    },
    mintJoinToken: async (
      roomName: string,
      identity: string,
      _ttl: number,
      grants: { canPublish: boolean },
    ) => `tok:${roomName}:${identity}:pub=${grants.canPublish}`,
    updateParticipantPublish: async (
      room: string,
      identity: string,
      canPublish: boolean,
    ): Promise<UpdatePublishResult> => {
      sfu.permissionUpdates.push({ room, identity, canPublish });
      return 'updated';
    },
    removeParticipant: async (room: string, identity: string) => {
      sfu.removed.push({ room, identity });
    },
    deleteRoom: async (roomName: string) => {
      sfu.deleted.push(roomName);
      sfu.created.delete(roomName);
    },
    roomExists: async (roomName: string) => sfu.created.has(roomName),
    receiveWebhook: async () => {
      throw new Error(
        'không dùng trong suite này — verify chữ ký thuộc port SDK',
      );
    },
  };

  const auth = (userId: string): AuthenticatedUser => ({
    userId,
    isGuest: false,
  });

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

  async function activeMembers(roomId: string): Promise<PartyRoomMember[]> {
    return ds
      .getRepository(PartyRoomMember)
      .createQueryBuilder('m')
      .where('m.room_id = :roomId AND m.left_at IS NULL', { roomId })
      .getMany();
  }

  beforeAll(async () => {
    const url = new URL(INTEGRATION_DB_URL as string);
    const dbName = `${url.pathname.slice(1)}_party`;
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
      entities: [User, PartyRoom, PartyRoomMember],
      migrations: [
        InitAuthUser1751900000000,
        EconomyLedger1752000000000,
        EconomyRefund1752100000000,
        MatchingCore1752200000000,
        MatchingGenderPreference1752300000000,
        SoulMatch1752400000000,
        Calling1752500000000,
        FriendChat1752600000000,
        PartyRoomGift1752700000000,
      ],
      namingStrategy: new SnakeNamingStrategy(),
      synchronize: false,
      dropSchema: true,
    });
    await ds.initialize();
    await ds.runMigrations();

    party = new PartyRoomService(
      ds,
      ds.getRepository(PartyRoom),
      ds.getRepository(PartyRoomMember),
      livekitStub,
      configStub,
      // stub publish — realtime end-to-end đã test ở suite signaling-gateway
      { publish: async () => 1 } as never,
    );
    sweeper = new PartyRoomSweeperService(
      ds,
      configStub,
      schedulerStub,
      party,
      livekitStub,
    );
  });

  afterAll(async () => {
    await ds?.destroy();
  });

  beforeEach(() => {
    sfu.deleted.length = 0;
    sfu.permissionUpdates.length = 0;
    sfu.removed.length = 0;
    sfu.failNextCreate = false;
  });

  it('tạo phòng: host membership atomic, SFU room tạo tường minh, token host publish được', async () => {
    const host = await createUser('c-host');
    const { room, membership, token } = await party.createRoom(
      auth(host.id),
      'Phòng test',
    );

    expect(room.status).toBe(PartyRoomStatus.Active);
    expect(room.speakerLimit).toBe(2); // snapshot config
    expect(membership.role).toBe(PartyRole.Host);
    expect(token).toBe(`tok:${partyRoomName(room.id)}:${host.id}:pub=true`);
    expect(sfu.created.has(partyRoomName(room.id))).toBe(true);
    expect(await activeMembers(room.id)).toHaveLength(1);
  });

  it('SFU tạo room fail → phòng vừa tạo bị compensate đóng, trả 503', async () => {
    const host = await createUser('c-fail');
    sfu.failNextCreate = true;

    await expect(
      party.createRoom(auth(host.id), 'Phòng lỗi SFU'),
    ).rejects.toMatchObject({
      message: 'PARTY_MEDIA_ROOM_CREATE_FAILED',
      status: 503,
    });

    // membership đã được nhả — user tạo lại phòng mới được ngay (không kẹt 1-user-1-phòng)
    const retry = await party.createRoom(auth(host.id), 'Phòng thử lại');
    expect(retry.room.status).toBe(PartyRoomStatus.Active);
  });

  it('1 user 1 phòng active: đang host phòng A thì không tạo/join phòng B', async () => {
    const [hostA, hostB] = await Promise.all([
      createUser('one-a'),
      createUser('one-b'),
    ]);
    await party.createRoom(auth(hostA.id), 'Phòng A');
    const roomB = await party.createRoom(auth(hostB.id), 'Phòng B');

    await expect(
      party.createRoom(auth(hostA.id), 'Phòng A2'),
    ).rejects.toMatchObject({ code: 'PARTY_MEMBER_ALREADY_IN_ANOTHER_ROOM' });
    await expect(
      party.joinRoom(auth(hostA.id), roomB.room.id),
    ).rejects.toMatchObject({ code: 'PARTY_MEMBER_ALREADY_IN_ANOTHER_ROOM' });
  });

  it('join: audience token KHÔNG publish; re-join trả membership cũ; đầy phòng → ROOM_FULL', async () => {
    const host = await createUser('j-host');
    const { room } = await party.createRoom(auth(host.id), 'Phòng join');

    const users = await Promise.all([
      createUser('j-1'),
      createUser('j-2'),
      createUser('j-3'),
    ]);
    const r1 = await party.joinRoom(auth(users[0].id), room.id);
    expect(r1.membership.role).toBe(PartyRole.Audience);
    expect(r1.token).toBe(
      `tok:${partyRoomName(room.id)}:${users[0].id}:pub=false`,
    );

    // re-join (rớt mạng) — membership cũ, token mới, không nhân đôi member
    const r1again = await party.joinRoom(auth(users[0].id), room.id);
    expect(r1again.membership.id).toBe(r1.membership.id);
    expect(await activeMembers(room.id)).toHaveLength(2);

    await party.joinRoom(auth(users[1].id), room.id);
    // PARTY_MAX_MEMBERS=4: host + 3 → member thứ 4 bị chặn
    await party.joinRoom(auth(users[2].id), room.id);
    const extra = await createUser('j-4');
    await expect(party.joinRoom(auth(extra.id), room.id)).rejects.toMatchObject(
      { code: 'PARTY_ROOM_FULL' },
    );
  });

  it('RACE speaker cap: 3 promote đồng thời với limit 2 → đúng 2 thắng, SFU chỉ đổi grant 2 lần', async () => {
    const host = await createUser('r-host');
    const { room } = await party.createRoom(auth(host.id), 'Phòng race');
    const members = await Promise.all([
      createUser('r-1'),
      createUser('r-2'),
      createUser('r-3'),
    ]);
    for (const m of members) await party.joinRoom(auth(m.id), room.id);

    const results = await Promise.allSettled(
      members.map((m) =>
        party.changeRole(auth(host.id), room.id, m.id, PartyRole.Speaker),
      ),
    );
    const wins = results.filter((r) => r.status === 'fulfilled');
    const losses = results.filter(
      (r) =>
        r.status === 'rejected' &&
        (r.reason as { code?: string }).code === 'PARTY_SPEAKER_LIMIT_REACHED',
    );
    expect(wins).toHaveLength(2);
    expect(losses).toHaveLength(1);

    const speakers = (await activeMembers(room.id)).filter(
      (m) => m.role === PartyRole.Speaker,
    );
    expect(speakers).toHaveLength(2); // DB không bao giờ vượt cap
    expect(
      sfu.permissionUpdates.filter(
        (u) => u.room === partyRoomName(room.id) && u.canPublish,
      ),
    ).toHaveLength(2);

    // demote 1 speaker → slot mở lại, người thua promote được
    const demoted = speakers[0];
    await party.changeRole(
      auth(host.id),
      room.id,
      demoted.userId,
      PartyRole.Audience,
    );
    expect(
      sfu.permissionUpdates.some(
        (u) => u.identity === demoted.userId && !u.canPublish,
      ),
    ).toBe(true);
    const loser = members.find(
      (m) => !speakers.some((s) => s.userId === m.id),
    ) as User;
    const promoted = await party.changeRole(
      auth(host.id),
      room.id,
      loser.id,
      PartyRole.Speaker,
    );
    expect(promoted.role).toBe(PartyRole.Speaker);
  });

  it('authz role: không phải host → 403; đổi role host → 409; target ngoài phòng → 404', async () => {
    const host = await createUser('a-host');
    const member = await createUser('a-member');
    const outsider = await createUser('a-out');
    const { room } = await party.createRoom(auth(host.id), 'Phòng authz');
    await party.joinRoom(auth(member.id), room.id);

    await expect(
      party.changeRole(auth(member.id), room.id, member.id, PartyRole.Speaker),
    ).rejects.toMatchObject({ code: 'PARTY_MEMBER_NOT_HOST' });
    await expect(
      party.changeRole(auth(host.id), room.id, host.id, PartyRole.Speaker),
    ).rejects.toMatchObject({ code: 'PARTY_MEMBER_CANNOT_CHANGE_HOST_ROLE' });
    await expect(
      party.changeRole(auth(host.id), room.id, outsider.id, PartyRole.Speaker),
    ).rejects.toMatchObject({ code: 'PARTY_TARGET_NOT_A_MEMBER' });
  });

  it('host rời → phòng đóng host_left, MỌI membership nhả, SFU room bị xoá; leave lặp idempotent', async () => {
    const host = await createUser('h-host');
    const member = await createUser('h-member');
    const { room } = await party.createRoom(auth(host.id), 'Phòng host rời');
    await party.joinRoom(auth(member.id), room.id);

    await party.leaveRoom(auth(host.id), room.id);

    const fresh = await ds
      .getRepository(PartyRoom)
      .findOneByOrFail({ id: room.id });
    expect(fresh.status).toBe(PartyRoomStatus.Closed);
    expect(fresh.closeReason).toBe(PartyRoomCloseReason.HostLeft);
    expect(await activeMembers(room.id)).toHaveLength(0);
    expect(sfu.deleted).toContain(partyRoomName(room.id));

    // member (đã bị nhả khi đóng phòng) tạo phòng mới được ngay
    await party.leaveRoom(auth(member.id), room.id); // idempotent — không nổ
    const again = await party.createRoom(auth(member.id), 'Phòng mới');
    expect(again.room.status).toBe(PartyRoomStatus.Active);

    // join phòng đã đóng → ROOM_CLOSED
    const late = await createUser('h-late');
    await expect(party.joinRoom(auth(late.id), room.id)).rejects.toMatchObject({
      code: 'PARTY_ROOM_CLOSED',
    });
  });

  it('member thường rời qua REST → membership nhả + kick khỏi SFU, phòng vẫn mở', async () => {
    const host = await createUser('l-host');
    const member = await createUser('l-member');
    const { room } = await party.createRoom(auth(host.id), 'Phòng leave');
    await party.joinRoom(auth(member.id), room.id);

    await party.leaveRoom(auth(member.id), room.id);

    expect(await activeMembers(room.id)).toHaveLength(1);
    expect(sfu.removed).toContainEqual({
      room: partyRoomName(room.id),
      identity: member.id,
    });
    const fresh = await ds
      .getRepository(PartyRoom)
      .findOneByOrFail({ id: room.id });
    expect(fresh.status).toBe(PartyRoomStatus.Active);

    // rejoin sau khi rời = row membership MỚI
    const rejoined = await party.joinRoom(auth(member.id), room.id);
    expect(rejoined.membership.role).toBe(PartyRole.Audience);
    expect(await activeMembers(room.id)).toHaveLength(2);
  });

  it('webhook: participant_left member → nhả (retry idempotent); host left → đóng; room lạ → bỏ qua', async () => {
    const host = await createUser('w-host');
    const member = await createUser('w-member');
    const { room } = await party.createRoom(auth(host.id), 'Phòng webhook');
    await party.joinRoom(auth(member.id), room.id);
    const roomName = partyRoomName(room.id);

    await party.handleWebhookEvent({
      event: 'participant_left',
      roomName,
      participantIdentity: member.id,
    });
    expect(await activeMembers(room.id)).toHaveLength(1);
    // retry webhook — không đổi gì thêm
    await party.handleWebhookEvent({
      event: 'participant_left',
      roomName,
      participantIdentity: member.id,
    });
    expect(await activeMembers(room.id)).toHaveLength(1);

    // room không phải party-* → bỏ qua không nổ
    await party.handleWebhookEvent({
      event: 'participant_left',
      roomName: `call-${room.id}`,
      participantIdentity: host.id,
    });

    // host rớt kết nối → đóng phòng
    await party.handleWebhookEvent({
      event: 'participant_left',
      roomName,
      participantIdentity: host.id,
    });
    const fresh = await ds
      .getRepository(PartyRoom)
      .findOneByOrFail({ id: room.id });
    expect(fresh.status).toBe(PartyRoomStatus.Closed);
    expect(fresh.closeReason).toBe(PartyRoomCloseReason.HostLeft);

    // room_finished đến SAU (retry/out-of-order) — idempotent, không dọn SFU 2 lần
    const deletesBefore = sfu.deleted.filter((r) => r === roomName).length;
    await party.handleWebhookEvent({
      event: 'room_finished',
      roomName,
      participantIdentity: null,
    });
    expect(sfu.deleted.filter((r) => r === roomName).length).toBe(
      deletesBefore,
    );
  });

  it('sweeper: phòng DB còn member nhưng SFU đã đóng (mọi webhook rớt) → sweep; phòng khoẻ → giữ', async () => {
    const [hostA, hostB] = await Promise.all([
      createUser('s-a'),
      createUser('s-b'),
    ]);
    const orphan = await party.createRoom(auth(hostA.id), 'Phòng mồ côi');
    const healthy = await party.createRoom(auth(hostB.id), 'Phòng khoẻ');
    // cả 2 đều đủ già để bị quét
    await ds.query(
      `UPDATE party_rooms SET created_at = now() - interval '1 hour' WHERE id = ANY($1)`,
      [[orphan.room.id, healthy.room.id]],
    );
    // giả lập SFU đã empty-timeout phòng mồ côi mà không webhook nào tới được
    sfu.created.delete(partyRoomName(orphan.room.id));

    await sweeper.runOnce();

    const freshOrphan = await ds
      .getRepository(PartyRoom)
      .findOneByOrFail({ id: orphan.room.id });
    expect(freshOrphan.status).toBe(PartyRoomStatus.Closed);
    expect(freshOrphan.closeReason).toBe(PartyRoomCloseReason.Swept);
    expect(await activeMembers(orphan.room.id)).toHaveLength(0);

    const freshHealthy = await ds
      .getRepository(PartyRoom)
      .findOneByOrFail({ id: healthy.room.id });
    expect(freshHealthy.status).toBe(PartyRoomStatus.Active);
  });

  it('list phòng active: cursor pagination, phòng đóng không hiện', async () => {
    const page = await party.listRooms(50);
    expect(page.data.every((r) => r.status === PartyRoomStatus.Active)).toBe(
      true,
    );
    const smallPage = await party.listRooms(1);
    expect(smallPage.data).toHaveLength(1);
    if (smallPage.meta.nextCursor) {
      const next = await party.listRooms(1, smallPage.meta.nextCursor);
      expect(next.data[0]?.id).not.toBe(smallPage.data[0].id);
    }
  });
});
