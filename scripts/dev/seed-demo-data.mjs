#!/usr/bin/env node
/**
 * Seed dữ liệu demo cho môi trường dev local (KHÔNG chạy ở production — script patch trực tiếp
 * vài cột không thể set qua API do dev transcode port trả URL giả `dev-storage.invalid`,
 * docs/13 § 13.9 KHÔNG áp dụng ở đây vì đây là tool vận hành, không phải code sản phẩm).
 *
 * Mục đích: làm đầy MỌI màn hình web + admin bằng dữ liệu THẬT đi qua các API thật (không fake
 * nghiệp vụ) để không còn trống rỗng khi test thủ công trên trình duyệt:
 * - Web: Home (wallet + rooms + notification), Feed (post ảnh + comment + tim), Video (view/
 *   tim/bình luận/gift), Tin nhắn + Chat, Discovery (browse + nearby), Matching (invite inbox),
 *   Party (room đủ category + member), Movie Match (session xem chung với bạn), Palm Match
 *   (session hoàn tất giữa 2 bot), Profile (bài viết + avatar item), Wallet (VIP + số dư),
 *   Help (ticket đã có phản hồi staff).
 * - Admin: Dashboard (user mới hôm nay/hôm qua, doanh thu diamond, donut VIP, phòng live,
 *   audit log), Users (đủ role/status), Moderation (reports đủ reason + status, video chờ
 *   duyệt, tickets đủ status), Gifts (active/inactive), Economy (tra cứu ví user demo),
 *   Rooms, Config, Permissions (staff ≥2 admin + moderator).
 *
 * Chạy: `node scripts/dev/seed-demo-data.mjs`
 * Chạy nhanh chỉ để mở lại Party Room trước khi browse tay: `node scripts/dev/seed-demo-data.mjs --rooms-only`
 *
 * Script RE-RUN AN TOÀN: bot guest dùng deviceId ổn định (đăng nhập lại đúng account cũ),
 * account OTP tra theo phone, các khối dữ liệu đếm-rồi-bù (top-up) tới target thay vì tạo mù.
 *
 * Yêu cầu trước khi chạy: `pnpm dev:up` (docker compose dev đang chạy core-api ở
 * localhost:3000, postgres ở localhost:5432).
 *
 * Giới hạn đã biết (không sửa được chỉ bằng seed data, cần logic/hạ tầng thật):
 * - Party Room: sweeper thật kiểm tra phòng có tồn tại trên LiveKit SFU không — phòng seed ở
 *   đây sẽ bị tự đóng (status='finished') sau ~PARTY_EMPTY_ROOM_TIMEOUT_SECONDS vì không có
 *   kết nối LiveKit thật giữ phòng sống → dùng `--rooms-only` để mở lại ngay trước khi browse.
 * - Video: `VIDEO_MODERATION_MODE=pre` khiến finalize dừng ở 'pending_review'; dev transcode
 *   port trả playback/thumbnail URL giả `dev-storage.invalid`. Với video muốn hiển thị công
 *   khai, script patch thẳng 2 cột này sang URL video mẫu công khai (CC0) + set
 *   status='published' qua SQL sau khi tạo qua API thật. Một số video CỐ Ý giữ nguyên
 *   status='pending_review' để hàng đợi duyệt video của Admin không trống.
 * - Biểu đồ diamond 7 ngày (Admin dashboard): ledger append-only là invariant repo — KHÔNG
 *   backdate ledger entry, nên toàn bộ doanh thu seed nằm ở cột "hôm nay"; 6 ngày trước = 0
 *   trừ khi có hoạt động thật các ngày đó.
 * - Luồng cần 2 user sống đồng thời (voice/soul call, movie anon, palm realtime) chỉ seed được
 *   tới trạng thái session/queue; trải nghiệm realtime cần 2 client thật.
 * - Guest bị chặn tạo post/comment/tim (GUEST_FORBIDDEN) — mọi hành vi social trên feed/video
 *   đi từ nhóm account OTP thật (DISCOVERY_BOTS + hero).
 * - Admin: migration không seed admin (gán admin đầu là việc ops). Script tạo staff OTP thật
 *   rồi promote role bằng SQL CHỈ ĐỂ demo local — đăng nhập lại sau promote vì role bake vào
 *   JWT lúc issue.
 */

import 'dotenv/config';

import { Client } from 'pg';
import { createSeedApiClient } from './seed-demo-data-client.mjs';
import {
  ADMIN_PHONE_LOCAL,
  BOTS,
  DEMO_PHONE_LOCAL,
  DISCOVERY_BOTS,
  FRIEND_PAIRS,
  HANOI_LAT,
  HANOI_LON,
  POST_COMMENTS,
  POST_TOPICS,
  REPORT_REASONS,
  ROOMS,
  ROOM_JOINERS,
  SAMPLE_VIDEOS,
  STAFF,
  VIDEO_COMMENTS,
  canonicalPair,
  profileExtras,
} from './seed-demo-data.fixtures.mjs';

const apiUrl = new URL(
  process.env['SEED_API_URL'] ??
    process.env['NEXT_PUBLIC_API_URL'] ??
    'http://localhost:3000',
);
apiUrl.pathname = '/api/v1';
apiUrl.search = '';
apiUrl.hash = '';
const API = apiUrl.toString().replace(/\/$/u, '');
const ROOMS_ONLY = process.argv.includes('--rooms-only');
const { request: req, guestLogin, otpLogin } = createSeedApiClient(API);

const pg = new Client({
  connectionString:
    process.env['DATABASE_URL'] ??
    'postgresql://litmatch:litmatch_local@localhost:5432/litmatch',
});

function uuid() {
  return crypto.randomUUID();
}

async function count(sql, params = []) {
  const r = await pg.query(sql, params);
  return Number(r.rows[0]?.count ?? 0);
}

async function friendConversation(lowId, highId) {
  await pg.query(
    `INSERT INTO friendships (user_low_id, user_high_id, source)
     VALUES ($1, $2, 'soul_match') ON CONFLICT DO NOTHING`,
    [lowId, highId],
  );
  await pg.query(
    `INSERT INTO conversations (user_low_id, user_high_id)
     VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [lowId, highId],
  );
}

async function main() {
  await pg.connect();
  const ids = {};
  const tokens = {};
  const videoIds = {};

  console.log('== Tạo/đăng nhập lại bot accounts (guest, deviceId ổn định) ==');
  for (const [index, bot] of BOTS.entries()) {
    const session = await guestLogin(`seed-bot-${bot.key}`);
    if (!session) continue;
    tokens[bot.key] = session.accessToken;
    ids[bot.key] = session.userId;
    await req('PATCH', '/users/me', session.accessToken, {
      nickname: bot.nickname,
      gender: bot.gender,
      ...profileExtras(index, bot.gender),
    });
    console.log(`  ${bot.key} -> ${ids[bot.key]}`);
  }

  console.log('== Mở Party Room (đủ category, kèm member join) ==');
  const openRooms = await count(
    `SELECT count(*) FROM party_rooms WHERE status = 'active'`,
  );
  if (openRooms >= ROOMS.length) {
    console.log(`  đã có ${openRooms} phòng đang mở — bỏ qua.`);
  } else {
    // Rời phòng đang kẹt từ lần chạy trước (host/joiner đều chỉ được ở 1 phòng).
    const leaveCurrentRoom = async (key) => {
      if (!ids[key] || !tokens[key]) return;
      const r = await pg.query(
        `SELECT m.room_id FROM party_room_members m
         JOIN party_rooms p ON p.id = m.room_id
         WHERE m.user_id = $1 AND m.left_at IS NULL AND p.status = 'active'`,
        [ids[key]],
      );
      for (const row of r.rows) {
        await req('POST', `/party/rooms/${row.room_id}/leave`, tokens[key]);
      }
    };
    for (const room of ROOMS) {
      await leaveCurrentRoom(room.bot);
      for (const joiner of ROOM_JOINERS[room.bot] ?? []) {
        await leaveCurrentRoom(joiner);
      }
      // POST /party/rooms throttle 5/phút — chờ rồi thử lại khi bị 429.
      let r = await req('POST', '/party/rooms', tokens[room.bot], {
        title: room.title,
        category: room.category,
      });
      if (r.status === 429) {
        console.log('  bị rate limit tạo phòng, đợi 65s...');
        await new Promise((resolve) => setTimeout(resolve, 65_000));
        r = await req('POST', '/party/rooms', tokens[room.bot], {
          title: room.title,
          category: room.category,
        });
      }
      if (!r.ok) {
        // Host đang giữ phòng mở từ lần chạy trước → không coi là lỗi.
        console.log(`  ${room.bot}: ${room.title} -> bỏ qua (đã có phòng)`);
        continue;
      }
      // Create trả JoinPartyRoomDto: { room, membership, token, livekitUrl }.
      const roomId = r.data.room?.id ?? r.data.id;
      for (const joiner of ROOM_JOINERS[room.bot] ?? []) {
        if (tokens[joiner]) {
          await req('POST', `/party/rooms/${roomId}/join`, tokens[joiner]);
        }
      }
      console.log(`  ${room.bot}: ${room.title} [${room.category}] -> ok`);
    }
  }
  if (ROOMS_ONLY) {
    await pg.end();
    console.log(
      '\n--rooms-only XONG. Phòng sẽ tự đóng sau vài phút, browse ngay.',
    );
    return;
  }

  console.log(
    '== Tạo account OTP thật cho Discovery (guest bot bị loại khỏi browse/nearby) ==',
  );
  for (const [index, bot] of DISCOVERY_BOTS.entries()) {
    const session = await otpLogin(bot.phoneLocal);
    if (!session) continue;
    tokens[bot.key] = session.accessToken;
    ids[bot.key] = session.userId;
    await req('PATCH', '/users/me', session.accessToken, {
      nickname: bot.nickname,
      gender: bot.gender,
      ...profileExtras(index, bot.gender),
    });
    await req('PUT', '/discovery/nearby/visible', session.accessToken, {
      visible: true,
    });
    await req('PUT', '/discovery/nearby/location', session.accessToken, {
      lat: HANOI_LAT + (index - 2) * 0.004,
      lon: HANOI_LON + (index - 2) * 0.004,
    });
    console.log(`  ${bot.key} -> ${ids[bot.key]}`);
  }

  console.log('== Staff OTP thật (đăng nhập được UI Admin) + promote role ==');
  for (const staff of STAFF) {
    let session = await otpLogin(staff.phoneLocal);
    if (!session) continue;
    await req('PATCH', '/users/me', session.accessToken, {
      nickname: staff.nickname,
    });
    const current = await pg.query(`SELECT role FROM users WHERE id = $1`, [
      session.userId,
    ]);
    if (current.rows[0]?.role !== staff.role) {
      await pg.query(`UPDATE users SET role = $1 WHERE id = $2`, [
        staff.role,
        session.userId,
      ]);
      // Role bake vào JWT lúc issue — đăng nhập lại để token mang quyền mới.
      session = await otpLogin(staff.phoneLocal);
      if (!session) continue;
    }
    tokens[staff.key] = session.accessToken;
    ids[staff.key] = session.userId;
    console.log(`  ${staff.key} (${staff.role}) -> ${ids[staff.key]}`);
  }
  const adminToken = tokens.admin_an;

  console.log('== Video published (top-up tới 8) + patch URL mẫu CC0 ==');
  const publishedCount = await count(
    `SELECT count(*) FROM videos WHERE status = 'published'`,
  );
  if (publishedCount >= 8) {
    console.log(`  đã có ${publishedCount} video published — bỏ qua.`);
  } else {
    const videoAuthors = ['chi', 'minh', 'vy', 'disc_mai', 'disc_huy'];
    for (const [i, botKey] of videoAuthors.entries()) {
      if (!tokens[botKey]) continue;
      const intent = await req(
        'POST',
        '/videos/upload-intent',
        tokens[botKey],
        { caption: `Video demo #${i + 1} 🎬` },
        { 'Idempotency-Key': uuid() },
      );
      if (!intent.ok) continue;
      const videoId = intent.data.videoId;
      videoIds[botKey] = videoId;
      await req('POST', `/videos/${videoId}/finalize`, tokens[botKey]);
      await pg.query(
        `UPDATE videos SET status = 'published', playback_url = $1,
           thumbnail_url = $2 WHERE id = $3`,
        [
          SAMPLE_VIDEOS[i % SAMPLE_VIDEOS.length],
          `https://picsum.photos/seed/${botKey}/400/700`,
          videoId,
        ],
      );
      console.log(`  ${botKey}: video published`);
    }
  }

  console.log(
    '== Video pending_review (top-up tới 3 — hàng đợi duyệt Admin) ==',
  );
  const pendingCount = await count(
    `SELECT count(*) FROM videos WHERE status = 'pending_review'`,
  );
  const pendingAuthors = ['khang', 'lan', 'tuan'].slice(
    0,
    Math.max(0, 3 - pendingCount),
  );
  for (const botKey of pendingAuthors) {
    const intent = await req(
      'POST',
      '/videos/upload-intent',
      tokens[botKey],
      { caption: `Video chờ duyệt nội dung 🕒 (${botKey})` },
      { 'Idempotency-Key': uuid() },
    );
    if (!intent.ok) continue;
    const pendingVideoId = intent.data.videoId;
    await req('POST', `/videos/${pendingVideoId}/finalize`, tokens[botKey]);
    // Chỉ patch 2 cột URL giả của dev transcode port — KHÔNG đụng status, để video này
    // vẫn nằm ở pending_review cho Admin duyệt thủ công.
    await pg.query(
      `UPDATE videos SET playback_url = $1, thumbnail_url = $2 WHERE id = $3`,
      [
        SAMPLE_VIDEOS[0],
        `https://picsum.photos/seed/${botKey}-pending/400/700`,
        pendingVideoId,
      ],
    );
    console.log(`  ${botKey}: video pending_review`);
  }

  console.log('== Kết bạn + trò chuyện giữa các bot ==');
  for (const [a, b] of FRIEND_PAIRS) {
    if (!ids[a] || !ids[b]) continue;
    const [low, high] = canonicalPair(ids[a], ids[b]);
    await friendConversation(low, high);
    console.log(`  ${a} <-> ${b}`);
  }

  console.log('== Reports (top-up tới 24 pending, đủ 5 reason) ==');
  const pendingReports = await count(
    `SELECT count(*) FROM reports WHERE status = 'pending'`,
  );
  const reporterKeys = [
    ...BOTS.map((b) => b.key),
    ...DISCOVERY_BOTS.map((b) => b.key),
  ].filter((k) => k !== 'spam' && tokens[k]);
  const targetKeys = BOTS.map((b) => b.key).filter((k) => ids[k]);
  let createdReports = 0;
  const needReports = Math.max(0, 24 - pendingReports);
  outer: for (
    let round = 0;
    round < 3 && createdReports < needReports;
    round += 1
  ) {
    for (const [i, reporter] of reporterKeys.entries()) {
      if (createdReports >= needReports) break outer;
      const target = targetKeys[(i + round + 1) % targetKeys.length];
      if (target === reporter || !ids[target]) continue;
      const reason = REPORT_REASONS[(i + round) % REPORT_REASONS.length];
      let r = await req('POST', '/safety/reports', tokens[reporter], {
        targetUserId: ids[target],
        reason,
        description: `Báo cáo demo (${reason}) từ ${reporter} về ${target}.`,
      });
      if (r.status === 429) {
        // /safety/reports throttle 10/60 PHÚT (safety.controller.ts) — đợi trong run này
        // là vô ích; dừng sớm, lần chạy sau (cách ≥1h) sẽ top-up tiếp.
        console.log(
          '  throttle report là 10/giờ — dừng khối reports, chạy lại sau ≥1h để bù.',
        );
        break outer;
      }
      if (r.ok) createdReports += 1;
    }
  }
  console.log(
    `  pending trước: ${pendingReports}, tạo thêm: ${createdReports}`,
  );

  console.log('== Support tickets (top-up tới 8, đủ category) ==');
  const ticketCount = await count(`SELECT count(*) FROM support_tickets`);
  const ticketSpecs = [
    {
      bot: 'minh',
      category: 'bug',
      message: 'Ứng dụng bị lag khi vào Party Room đông người.',
    },
    {
      bot: 'chi',
      category: 'idea',
      message: 'Mong có thêm filter tìm bạn theo sở thích âm nhạc.',
    },
    {
      bot: 'lan',
      category: 'feedback',
      message: 'Giao diện mới rất đẹp, dùng mượt hơn hẳn!',
    },
    {
      bot: 'khoa',
      category: 'bug',
      message: 'Thỉnh thoảng không nhận được thông báo lời mời match.',
    },
    {
      bot: 'disc_mai',
      category: 'idea',
      message: 'Đề xuất thêm chế độ tối tự động theo giờ.',
    },
    {
      bot: 'disc_huy',
      category: 'bug',
      message: 'Ảnh đại diện upload xong bị xoay ngang.',
    },
    {
      bot: 'vy',
      category: 'feedback',
      message: 'Movie Match xem chung với bạn rất vui, 10 điểm!',
    },
    {
      bot: 'tuan',
      category: 'idea',
      message: 'Mong có bảng xếp hạng phòng hát hàng tuần.',
    },
  ].slice(0, Math.max(0, 8 - ticketCount));
  for (const spec of ticketSpecs) {
    if (!tokens[spec.bot]) continue;
    await req(
      'POST',
      '/support/tickets',
      tokens[spec.bot],
      { category: spec.category, message: spec.message },
      { 'Idempotency-Key': uuid() },
    );
  }
  console.log(`  tổng trước: ${ticketCount}, tạo thêm: ${ticketSpecs.length}`);

  console.log('== User mới hôm nay/hôm qua (thống kê Dashboard) ==');
  const today = new Date().toISOString().slice(0, 10);
  for (let i = 0; i < 6; i += 1) {
    const s = await guestLogin(`seed-newuser-${today}-${i}`);
    if (!s) continue;
    await req('PATCH', '/users/me', s.accessToken, {
      nickname: `Newbie ${i + 1}`,
      gender: i % 2 === 0 ? 'female' : 'male',
    });
    if (i >= 3) {
      // 3 account cuối lùi created_at về hôm qua để có số so sánh ngày trước đó.
      await pg.query(
        `UPDATE users SET created_at = now() - interval '1 day'
         WHERE id = $1 AND created_at > now() - interval '1 hour'`,
        [s.userId],
      );
    }
  }
  console.log('  6 user mới (3 hôm nay + 3 hôm qua)');

  console.log('== Feed: post ảnh công khai (top-up tới 12) + comment + tim ==');
  const publicPosts = await count(
    `SELECT count(*) FROM posts WHERE audience = 'public' AND deleted_at IS NULL`,
  );
  const posterKeys = DISCOVERY_BOTS.map((b) => b.key).filter((k) => tokens[k]);
  const postsToCreate = Math.max(0, 12 - publicPosts);
  for (let i = 0; i < postsToCreate; i += 1) {
    const topic = POST_TOPICS[i % POST_TOPICS.length];
    const poster = posterKeys[i % posterKeys.length];
    if (!poster) break;
    await req(
      'POST',
      '/feed/posts',
      tokens[poster],
      {
        content: topic.content,
        imageUrl: `https://picsum.photos/seed/${topic.img}-${i}/800/600`,
        audience: 'public',
      },
      { 'Idempotency-Key': uuid() },
    );
  }
  console.log(`  public trước: ${publicPosts}, tạo thêm: ${postsToCreate}`);
  // Comment + tim từ account OTP (guest bị GUEST_FORBIDDEN) cho các post đầu bảng tin.
  if (posterKeys.length > 0) {
    const feedPage = await req(
      'GET',
      '/feed/posts?limit=10',
      tokens[posterKeys[0]],
    );
    for (const [i, post] of (feedPage.data?.items ?? []).entries()) {
      if (post.commentCount >= 2) continue;
      const commenters = [
        posterKeys[i % posterKeys.length],
        posterKeys[(i + 2) % posterKeys.length],
      ];
      for (const [j, commenter] of commenters.entries()) {
        if (ids[commenter] === post.authorUserId) continue;
        await req(
          'POST',
          `/feed/posts/${post.id}/comments`,
          tokens[commenter],
          { content: POST_COMMENTS[(i + j) % POST_COMMENTS.length] },
        );
      }
      for (const liker of posterKeys.slice(0, 3)) {
        await req('POST', `/feed/posts/${post.id}/reactions`, tokens[liker]);
      }
    }
    console.log('  đã rải comment + tim lên 10 post đầu');
  }

  console.log('== Video: view + tim + bình luận (social proof) ==');
  if (posterKeys.length > 0) {
    const videosPage = await req(
      'GET',
      '/videos?sort=recent&limit=10',
      tokens[posterKeys[0]],
    );
    for (const [i, video] of (videosPage.data?.items ?? []).entries()) {
      if (video.likeCount >= 2) continue;
      for (const [j, watcher] of posterKeys.entries()) {
        if (ids[watcher] === video.authorUserId) continue;
        await req('POST', `/videos/${video.id}/views`, tokens[watcher], {
          watchTimeMs: 4000 + ((i + j) % 5) * 1500,
        });
        if (j < 3) {
          await req('POST', `/videos/${video.id}/reactions`, tokens[watcher]);
        }
        if (j < 2) {
          await req('POST', `/videos/${video.id}/comments`, tokens[watcher], {
            content: VIDEO_COMMENTS[(i + j) % VIDEO_COMMENTS.length],
          });
        }
      }
    }
    console.log('  đã rải view/tim/bình luận lên 10 video mới nhất');
  }

  console.log('== VIP cho discovery bots (donut VIP + doanh thu Dashboard) ==');
  // Mỗi discovery bot nạp diamond (dev IAP) + mua VIP qua API thật. Ledger append-only là
  // invariant repo nên KHÔNG backdate — doanh thu seed nằm trọn ở cột "hôm nay" của biểu đồ.
  for (const [index, botKey] of posterKeys.entries()) {
    const token = tokens[botKey];
    const vipRow = await pg.query(
      `SELECT vip_tier, vip_expires_at FROM wallets WHERE user_id = $1`,
      [ids[botKey]],
    );
    const hasVip =
      vipRow.rows[0]?.vip_tier &&
      vipRow.rows[0].vip_tier !== 'free' &&
      new Date(vipRow.rows[0].vip_expires_at ?? 0) > new Date();
    if (hasVip) continue;
    // Nạp gói to nhất để chắc chắn đủ diamond cho mọi plan; nếu vẫn thiếu (ví dụ plan SVIP
    // đắt hơn 1 gói nạp) thì nạp thêm 1 lần rồi thử lại.
    const products =
      (await req('GET', '/economy/iap/products', token)).data ?? [];
    const bestProduct = [...products].sort(
      (a, b) => Number(b.diamonds) - Number(a.diamonds),
    )[0];
    if (!bestProduct) continue;
    const topUp = () =>
      req('POST', '/economy/iap/verify', token, {
        provider: bestProduct.provider,
        productId: bestProduct.productId,
        payload: { devTransactionId: `seed-tx-${uuid()}` },
      });
    await topUp();
    const plans = (await req('GET', '/economy/vip/plans', token)).data ?? [];
    const plan = plans[index % Math.max(plans.length, 1)];
    if (plan) {
      let buy = await req(
        'POST',
        '/economy/vip/purchase',
        token,
        { planId: plan.id },
        { 'Idempotency-Key': uuid() },
      );
      if (!buy.ok && buy.status === 422) {
        await topUp();
        buy = await req(
          'POST',
          '/economy/vip/purchase',
          token,
          { planId: plan.id },
          { 'Idempotency-Key': uuid() },
        );
      }
    }
    console.log(`  ${botKey}: nạp diamond + mua VIP`);
  }

  console.log('== Palm Match: 1 session hoàn tất giữa 2 bot OTP ==');
  const palmCount = await count(`SELECT count(*) FROM palm_match_sessions`);
  if (palmCount > 0) {
    console.log(`  đã có ${palmCount} session — bỏ qua.`);
  } else if (tokens.disc_quang && tokens.disc_yen) {
    await req('POST', '/palm-match/queue', tokens.disc_quang);
    const st = await req('POST', '/palm-match/queue', tokens.disc_yen);
    const sessionId = st.data?.sessionId;
    if (sessionId) {
      await req(
        'POST',
        `/palm-match/sessions/${sessionId}/flip`,
        tokens.disc_quang,
      );
      await req(
        'POST',
        `/palm-match/sessions/${sessionId}/flip`,
        tokens.disc_yen,
      );
      await req(
        'POST',
        `/palm-match/sessions/${sessionId}/rating`,
        tokens.disc_quang,
        { rating: 'like' },
      );
      await req(
        'POST',
        `/palm-match/sessions/${sessionId}/rating`,
        tokens.disc_yen,
        { rating: 'like' },
      );
      await req('DELETE', '/palm-match/current', tokens.disc_quang);
      await req('DELETE', '/palm-match/current', tokens.disc_yen);
      console.log(`  session ${sessionId} hoàn tất (mutual like)`);
    } else {
      // Không ghép được ngay — dọn queue để không kẹt lần sau.
      await req('DELETE', '/palm-match/current', tokens.disc_quang);
      await req('DELETE', '/palm-match/current', tokens.disc_yen);
      console.log('  không ghép được session — đã dọn queue.');
    }
  }

  console.log('== Tài khoản demo "hero" — đăng nhập thật qua OTP để tự xem ==');
  const heroSession = await otpLogin(DEMO_PHONE_LOCAL);
  if (!heroSession) {
    console.error('  Không đăng nhập được tài khoản demo — dừng phần này.');
  } else {
    const demoToken = heroSession.accessToken;
    const demoId = heroSession.userId;
    ids.hero = demoId;
    await req('PATCH', '/users/me', demoToken, {
      nickname: 'Demo Test',
      gender: 'male',
      ...profileExtras(2, 'male'),
    });
    await req('PUT', '/discovery/nearby/visible', demoToken, {
      visible: true,
    });
    await req('PUT', '/discovery/nearby/location', demoToken, {
      lat: HANOI_LAT,
      lon: HANOI_LON,
    });

    const heroPosts = await count(
      `SELECT count(*) FROM posts WHERE author_user_id = $1 AND deleted_at IS NULL`,
      [demoId],
    );
    if (heroPosts < 3) {
      await req(
        'POST',
        '/feed/posts',
        demoToken,
        {
          content:
            'Chào mọi người, mình là tài khoản demo có sẵn dữ liệu đầy đủ để test UI 🎉',
          audience: 'public',
        },
        { 'Idempotency-Key': uuid() },
      );
      await req(
        'POST',
        '/feed/posts',
        demoToken,
        {
          content: 'Hôm nay trời đẹp, ai rảnh vào Party Room chill không? 🎶',
          imageUrl: 'https://picsum.photos/seed/hero-party/800/600',
          audience: 'public',
        },
        { 'Idempotency-Key': uuid() },
      );
      await req(
        'POST',
        '/feed/posts',
        demoToken,
        {
          content: 'Check-in góc làm việc cuối tuần ✨',
          imageUrl: 'https://picsum.photos/seed/hero-desk/800/600',
          audience: 'friends',
        },
        { 'Idempotency-Key': uuid() },
      );
    }

    const heroVideos = await count(
      `SELECT count(*) FROM videos WHERE author_user_id = $1 AND status = 'published'`,
      [demoId],
    );
    if (heroVideos === 0) {
      const intent = await req(
        'POST',
        '/videos/upload-intent',
        demoToken,
        { caption: 'Video demo test giao diện 📱' },
        { 'Idempotency-Key': uuid() },
      );
      if (intent.ok) {
        await req('POST', `/videos/${intent.data.videoId}/finalize`, demoToken);
        await pg.query(
          `UPDATE videos SET status = 'published', playback_url = $1,
               thumbnail_url = $2 WHERE id = $3`,
          [
            'https://samplelib.com/mp4/sample-15s.mp4',
            'https://picsum.photos/seed/demotest/400/700',
            intent.data.videoId,
          ],
        );
      }
    }

    console.log('  == Kết bạn + tin nhắn với chi/khang/lan/disc_mai ==');
    for (const friendKey of ['chi', 'khang', 'lan', 'disc_mai']) {
      if (!ids[friendKey]) continue;
      const [low, high] = canonicalPair(demoId, ids[friendKey]);
      await friendConversation(low, high);
    }
    const heroMessages = {
      chi: 'Chào Chi, mình mới join Litmatch 👋',
      khang: 'Khang ơi, có rảnh voice call không? 🎧',
      lan: 'Lan này, tối nay vào Party Room chill không? 🎶',
      disc_mai: 'Mai ơi, thấy bạn cũng thích cà phê, cuối tuần cafe không? ☕',
    };
    for (const [friendKey, content] of Object.entries(heroMessages)) {
      if (!ids[friendKey]) continue;
      const conv = await req(
        'GET',
        `/friends/${ids[friendKey]}/conversation`,
        demoToken,
      );
      if (conv.ok) {
        const msgs = await req(
          'GET',
          `/conversations/${conv.data.id}/messages?limit=5`,
          demoToken,
        );
        if ((msgs.data?.items ?? []).length >= 3) continue;
        await req(
          'POST',
          `/conversations/${conv.data.id}/messages`,
          demoToken,
          { content },
          { 'Idempotency-Key': uuid() },
        );
        // Bạn bên kia nhắn lại để hội thoại 2 chiều + unread badge.
        if (tokens[friendKey]) {
          await req(
            'POST',
            `/conversations/${conv.data.id}/messages`,
            tokens[friendKey],
            { content: 'Okela, hẹn bạn tối nay nhé! 😄' },
            { 'Idempotency-Key': uuid() },
          );
        }
      }
    }

    console.log('  == Lời mời Matching (inbox + notification) từ bot ==');
    const pendingInvites = await count(
      `SELECT count(*) FROM match_invites
       WHERE invitee_user_id = $1 AND status = 'pending'`,
      [demoId],
    );
    if (pendingInvites < 2) {
      if (ids.ngoc) {
        await req('POST', '/matching/invites', tokens.ngoc, {
          inviteeUserId: demoId,
          matchType: 'soul',
        });
      }
      if (tokens.disc_trang) {
        await req('POST', '/matching/invites', tokens.disc_trang, {
          inviteeUserId: demoId,
          matchType: 'voice',
        });
      }
    }

    console.log('  == Movie Match: session xem chung đang mở với Chi ==');
    const activeMovie = await count(
      `SELECT count(*) FROM movie_sessions
       WHERE status = 'active'
         AND (user_low_id = $1 OR user_high_id = $1)`,
      [demoId],
    );
    if (activeMovie === 0 && ids.chi) {
      const movie = await req('POST', '/movie-match/sessions', demoToken, {
        friendUserId: ids.chi,
        videoUrl: 'https://www.youtube.com/watch?v=aqz-KE-bpKQ',
      });
      if (movie.ok) {
        console.log(`  movie session -> ${movie.data.id}`);
      }
    }

    console.log('  == Ticket hỗ trợ từ tài khoản demo ==');
    const heroTickets = await count(
      `SELECT count(*) FROM support_tickets WHERE user_id = $1`,
      [demoId],
    );
    if (heroTickets === 0) {
      await req(
        'POST',
        '/support/tickets',
        demoToken,
        {
          category: 'feedback',
          message:
            'Ứng dụng dùng rất mượt, mong sớm có thêm tính năng video call nhóm!',
        },
        { 'Idempotency-Key': uuid() },
      );
    }

    console.log('  == Nạp diamond (dev IAP) + mua VIP + gửi gift ==');
    const heroWallet = await pg.query(
      `SELECT balance, vip_tier FROM wallets WHERE user_id = $1`,
      [demoId],
    );
    if (Number(heroWallet.rows[0]?.balance ?? 0) < 500) {
      const products =
        (await req('GET', '/economy/iap/products', demoToken)).data ?? [];
      const bestProduct = [...products].sort(
        (a, b) => Number(b.diamonds) - Number(a.diamonds),
      )[0];
      if (bestProduct) {
        await req('POST', '/economy/iap/verify', demoToken, {
          provider: bestProduct.provider,
          productId: bestProduct.productId,
          payload: { devTransactionId: `seed-tx-${uuid()}` },
        });
      }
    }
    if ((heroWallet.rows[0]?.vip_tier ?? 'free') === 'free') {
      const plans =
        (await req('GET', '/economy/vip/plans', demoToken)).data ?? [];
      const cheapestPlan = [...plans].sort(
        (a, b) => Number(a.priceDiamond) - Number(b.priceDiamond),
      )[0];
      if (cheapestPlan) {
        await req(
          'POST',
          '/economy/vip/purchase',
          demoToken,
          { planId: cheapestPlan.id },
          { 'Idempotency-Key': uuid() },
        );
      }
    }
    const gifts = (await req('GET', '/gifts', demoToken)).data ?? [];
    const cheapestGift = [...gifts].sort(
      (a, b) => a.priceDiamond - b.priceDiamond,
    )[0];
    const giftVideoId =
      videoIds.chi ??
      (
        await pg.query(
          `SELECT id FROM videos
           WHERE status = 'published' AND author_user_id <> $1
           ORDER BY created_at DESC LIMIT 1`,
          [demoId],
        )
      ).rows[0]?.id;
    if (cheapestGift && giftVideoId) {
      await req(
        'POST',
        `/videos/${giftVideoId}/gifts`,
        demoToken,
        { giftId: cheapestGift.id },
        { 'Idempotency-Key': uuid() },
      );
    }

    console.log('  == Avatar: nhận item free + mua 1 item + trang bị ==');
    const ownedRes = await req('GET', '/avatar/me/items', demoToken);
    const owned = ownedRes.data?.items ?? ownedRes.data ?? [];
    if (owned.length === 0) {
      const catalogRes = await req('GET', '/avatar/catalog', demoToken);
      const assets = catalogRes.data?.items ?? catalogRes.data ?? [];
      const freeAssets = assets.filter(
        (a) => Number(a.priceDiamond ?? 0) === 0,
      );
      const paidAssets = assets.filter((a) => Number(a.priceDiamond ?? 0) > 0);
      for (const asset of freeAssets.slice(0, 3)) {
        await req('POST', `/avatar/items/${asset.id}/claim`, demoToken);
      }
      if (paidAssets[0]) {
        await req(
          'POST',
          `/avatar/items/${paidAssets[0].id}/buy`,
          demoToken,
          undefined,
          { 'Idempotency-Key': uuid() },
        );
      }
      // Equip từng item theo slot (PUT /avatar/me/equip nhận {slot, avatarAssetId}).
      const toEquip = [...freeAssets.slice(0, 2), paidAssets[0]].filter(
        Boolean,
      );
      for (const asset of toEquip) {
        await req('PUT', '/avatar/me/equip', demoToken, {
          slot: asset.slot,
          avatarAssetId: asset.id,
        });
      }
    }

    console.log(
      `  Đăng nhập được bằng SĐT nội địa "${DEMO_PHONE_LOCAL}" — OTP đọc qua`,
    );
    console.log('  Mã OTP được trả trực tiếp về client trong response.');
  }

  console.log('== Admin actions (audit log + status variety) ==');
  if (adminToken) {
    // Ban spam bot (idempotent theo status).
    if (ids.spam) {
      const spamStatus = await pg.query(
        `SELECT status FROM users WHERE id = $1`,
        [ids.spam],
      );
      if (spamStatus.rows[0]?.status !== 'banned') {
        await req('POST', `/admin/users/${ids.spam}/ban`, adminToken);
        console.log('  ban spam bot');
      }
    }
    // Resolve 2 + dismiss 1 report pending cũ nhất — Moderation có đủ 3 status.
    const resolvedReports = await count(
      `SELECT count(*) FROM reports WHERE status <> 'pending'`,
    );
    if (resolvedReports < 3) {
      const olds = await pg.query(
        `SELECT id FROM reports WHERE status = 'pending'
         ORDER BY created_at ASC LIMIT 3`,
      );
      const [r1, r2, r3] = olds.rows.map((r) => r.id);
      if (r1) await req('POST', `/admin/reports/${r1}/resolve`, adminToken);
      if (r2) await req('POST', `/admin/reports/${r2}/resolve`, adminToken);
      if (r3) await req('POST', `/admin/reports/${r3}/dismiss`, adminToken);
      console.log('  resolve 2 + dismiss 1 report');
    }
    // Ticket triage: 1 in_progress (kèm phản hồi), 1 resolved, 1 closed.
    const triaged = await count(
      `SELECT count(*) FROM support_tickets WHERE status <> 'open'`,
    );
    if (triaged < 3) {
      const openTickets = await pg.query(
        `SELECT id FROM support_tickets WHERE status = 'open'
         ORDER BY created_at ASC LIMIT 3`,
      );
      const [t1, t2, t3] = openTickets.rows.map((r) => r.id);
      if (t1)
        await req('PATCH', `/admin/support/tickets/${t1}`, adminToken, {
          status: 'in_progress',
          staffResponse:
            'Team kỹ thuật đang kiểm tra, sẽ phản hồi trong 24h nhé!',
        });
      if (t2)
        await req('PATCH', `/admin/support/tickets/${t2}`, adminToken, {
          status: 'resolved',
          staffResponse:
            'Lỗi đã được sửa ở bản cập nhật mới nhất. Cảm ơn bạn đã báo!',
        });
      if (t3)
        await req('PATCH', `/admin/support/tickets/${t3}`, adminToken, {
          status: 'closed',
        });
      console.log('  triage 3 ticket (in_progress/resolved/closed)');
    }
    // Gift catalog variety: 1 gift mới active + 1 gift tắt active (màn Gifts đủ trạng thái).
    const seasonalGift = await pg.query(
      `SELECT id FROM gifts WHERE code = 'seed_firework'`,
    );
    if (seasonalGift.rows.length === 0) {
      const g = await req('POST', '/admin/gifts', adminToken, {
        code: 'seed_firework',
        name: 'Pháo hoa rực rỡ',
        priceDiamond: 199,
        sortOrder: 50,
      });
      if (g.ok) console.log('  tạo gift "Pháo hoa rực rỡ"');
    }
    const retiredGift = await pg.query(
      `SELECT id FROM gifts WHERE code = 'seed_retired'`,
    );
    if (retiredGift.rows.length === 0) {
      const g = await req('POST', '/admin/gifts', adminToken, {
        code: 'seed_retired',
        name: 'Quà mùa cũ (ngừng bán)',
        priceDiamond: 99,
        sortOrder: 99,
      });
      if (g.ok && g.data?.id) {
        await req('PATCH', `/admin/gifts/${g.data.id}`, adminToken, {
          active: false,
        });
        console.log('  tạo + tắt gift "Quà mùa cũ"');
      }
    }
  } else {
    console.log('  KHÔNG có admin token — bỏ qua khối admin actions.');
  }

  await pg.end();
  console.log('\nXONG. Tóm tắt đăng nhập:');
  console.log(
    `  Web (hero):  SĐT ${DEMO_PHONE_LOCAL} — user ${ids.hero ?? '?'}`,
  );
  console.log(`  Admin:       SĐT ${ADMIN_PHONE_LOCAL} (role admin)`);
  console.log('  OTP được trả trực tiếp về client trong response.');
  console.log(
    '  Party Room tự đóng sau vài phút — chạy lại với --rooms-only trước khi browse.',
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
