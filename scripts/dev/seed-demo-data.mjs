#!/usr/bin/env node
/**
 * Seed dữ liệu demo cho môi trường dev local (KHÔNG chạy ở production — script này gọi thẳng
 * DevSmsProvider-style endpoint thật + patch trực tiếp 2 cột không thể set qua API do dev
 * transcode port trả URL giả `dev-storage.invalid`, docs/13 § 13.9 KHÔNG áp dụng ở đây vì đây
 * là tool vận hành, không phải code sản phẩm).
 *
 * Mục đích: làm đầy Feed/Party Room/Video/Tin nhắn/Hồ sơ bằng dữ liệu THẬT đi qua các API thật
 * (không fake nghiệp vụ) để UI không còn trống rỗng khi test thủ công trên trình duyệt.
 *
 * Yêu cầu trước khi chạy: `pnpm dev:up` (docker compose dev đang chạy core-api ở
 * localhost:3000, postgres ở localhost:5432).
 *
 * Chạy: `node scripts/dev/seed-demo-data.mjs`
 *
 * Giới hạn đã biết (không sửa được chỉ bằng seed data, cần logic/hạ tầng thật):
 * - Party Room: sweeper thật kiểm tra phòng có tồn tại trên LiveKit SFU không — phòng seed ở
 *   đây sẽ bị tự đóng (status='finished') trong vài phút vì không có kết nối LiveKit thật giữ
 *   phòng sống. Muốn phòng luôn "đang mở" cần 1 client LiveKit thật kết nối liên tục.
 * - Video: `VIDEO_MODERATION_MODE=pre` (.env.example) khiến finalize dừng ở 'pending_review';
 *   dev transcode port trả playback/thumbnail URL giả `dev-storage.invalid`. Script patch thẳng
 *   2 cột này sang URL video mẫu công khai (CC0) + set status='published' qua SQL sau khi tạo
 *   qua API thật (giữ đúng trạng thái sở hữu/idempotency, chỉ patch phần dev port cố tình giả).
 * - "Tin nhắn"/Bạn bè/bài viết hồ sơ là dữ liệu SCOPE THEO TÀI KHOẢN ĐANG ĐĂNG NHẬP — script chỉ
 *   seed được cho các tài khoản demo bên dưới (bot + 1 tài khoản phone thật), không thể tự làm
 *   đầy cho 1 tài khoản chưa biết trước sẽ đăng nhập.
 */

import { Client } from 'pg';

const API = 'http://localhost:3000/api/v1';
const DEMO_PHONE_LOCAL = '912345678'; // Tài khoản "hero" đăng nhập được thật qua OTP dev.

const pg = new Client({
  host: 'localhost',
  port: 5432,
  user: 'litmatch',
  password: 'litmatch_local',
  database: 'litmatch',
});

function uuid() {
  return crypto.randomUUID();
}

async function req(method, path, token, body, extraHeaders = {}) {
  const headers = { 'Content-Type': 'application/json', ...extraHeaders };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  const json = text ? JSON.parse(text) : undefined;
  if (!res.ok) {
    console.error(
      `  FAIL ${method} ${path} -> ${res.status}`,
      JSON.stringify(json),
    );
    return { ok: false, status: res.status, data: json };
  }
  return { ok: true, status: res.status, data: json?.data };
}

async function guestLogin(deviceId) {
  return (await req('POST', '/auth/guest', undefined, { deviceId })).data;
}

async function readLatestOtp(phoneE164) {
  const { execSync } = await import('node:child_process');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const log = execSync('docker logs litmatch-core-api-1 --tail 30', {
      encoding: 'utf8',
    });
    const matches = [...log.matchAll(/Ma xac thuc Litmatch cua ban: (\d{6})/g)];
    if (matches.length > 0) return matches[matches.length - 1][1];
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Không đọc được OTP cho ${phoneE164} từ docker logs`);
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

function pair(a, b) {
  return a < b ? [a, b] : [b, a];
}

const BOTS = [
  { key: 'chi', nickname: 'Chi', gender: 'female' },
  { key: 'minh', nickname: 'Minh', gender: 'male' },
  { key: 'linh', nickname: 'Linh', gender: 'female' },
  { key: 'khang', nickname: 'Khang', gender: 'male' },
  { key: 'lan', nickname: 'Lan', gender: 'female' },
  { key: 'khoa', nickname: 'Khoa', gender: 'male' },
  { key: 'vy', nickname: 'Vy', gender: 'female' },
  { key: 'dat', nickname: 'Đạt', gender: 'male' },
  { key: 'tuan', nickname: 'Tuấn', gender: 'male' },
  { key: 'ngoc', nickname: 'Ngọc', gender: 'female' },
];

const ROOMS = [
  { bot: 'lan', title: 'Tâm sự đêm khuya 🌙' },
  { bot: 'khoa', title: 'Hát cho nhau nghe 🎤' },
  { bot: 'vy', title: 'Làm quen Sài Gòn 👋' },
  { bot: 'dat', title: 'Học tiếng Anh cùng nhau 📚' },
  { bot: 'tuan', title: 'Beatbox & rap cypher 🔥' },
];

const SAMPLE_VIDEOS = [
  'https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4',
  'https://www.w3schools.com/html/mov_bbb.mp4',
  'https://samplelib.com/mp4/sample-10s.mp4',
];

const FRIEND_PAIRS = [
  ['chi', 'minh'],
  ['linh', 'khang'],
  ['lan', 'khoa'],
  ['vy', 'dat'],
  ['tuan', 'ngoc'],
  ['chi', 'linh'],
];

async function main() {
  await pg.connect();
  const ids = {};
  const tokens = {};

  console.log('== Tạo bot accounts (guest) ==');
  for (const bot of BOTS) {
    const session = await guestLogin(`seed-${bot.key}-${uuid()}`);
    if (!session) continue;
    tokens[bot.key] = session.accessToken;
    ids[bot.key] = session.userId;
    await req('PATCH', '/users/me', session.accessToken, {
      nickname: bot.nickname,
      gender: bot.gender,
    });
    console.log(`  ${bot.key} -> ${ids[bot.key]}`);
  }

  console.log(
    '== Tạo Party Room (sẽ tự đóng sau vài phút — xem giới hạn ở đầu file) ==',
  );
  for (const room of ROOMS) {
    const r = await req('POST', '/party/rooms', tokens[room.bot], {
      title: room.title,
    });
    console.log(`  ${room.bot}: ${room.title} -> ${r.ok ? 'ok' : 'FAILED'}`);
  }

  console.log(
    '== Tạo video (patch playback URL sang video mẫu CC0 sau khi tạo qua API thật) ==',
  );
  const videoBots = ['chi', 'minh', 'vy'];
  for (const [i, botKey] of videoBots.entries()) {
    const intent = await req(
      'POST',
      '/videos/upload-intent',
      tokens[botKey],
      {
        caption: `Video demo #${i + 1} 🎬`,
      },
      { 'Idempotency-Key': uuid() },
    );
    if (!intent.ok) continue;
    const videoId = intent.data.videoId;
    await req('POST', `/videos/${videoId}/finalize`, tokens[botKey]);
    await pg.query(
      `UPDATE videos SET status = 'published', playback_url = $1,
         thumbnail_url = $2 WHERE id = $3`,
      [
        SAMPLE_VIDEOS[i],
        `https://picsum.photos/seed/${botKey}/400/700`,
        videoId,
      ],
    );
    console.log(`  ${botKey}: video published`);
  }

  console.log('== Kết bạn + trò chuyện giữa các bot ==');
  for (const [a, b] of FRIEND_PAIRS) {
    if (!ids[a] || !ids[b]) continue;
    const [low, high] = pair(ids[a], ids[b]);
    await friendConversation(low, high);
    console.log(`  ${a} <-> ${b}`);
  }

  console.log('== Tài khoản demo "hero" — đăng nhập thật qua OTP để tự xem ==');
  const otpReq = await fetch(`${API}/auth/otp/request`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: `+84${DEMO_PHONE_LOCAL}` }),
  });
  if (!otpReq.ok) {
    console.error('  Không gửi được OTP cho tài khoản demo — dừng phần này.');
  } else {
    const code = await readLatestOtp(`+84${DEMO_PHONE_LOCAL}`);
    const verify = await req('POST', '/auth/otp/verify', undefined, {
      phone: `+84${DEMO_PHONE_LOCAL}`,
      code,
    });
    if (verify.ok) {
      const demoToken = verify.data.accessToken;
      const demoId = verify.data.userId;
      await req('PATCH', '/users/me', demoToken, {
        nickname: 'Demo Test',
        gender: 'male',
      });
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
          audience: 'public',
        },
        { 'Idempotency-Key': uuid() },
      );

      const intent = await req(
        'POST',
        '/videos/upload-intent',
        demoToken,
        {
          caption: 'Video demo test giao diện 📱',
        },
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

      for (const friendKey of ['chi', 'khang', 'lan']) {
        if (!ids[friendKey]) continue;
        const [low, high] = pair(demoId, ids[friendKey]);
        await friendConversation(low, high);
      }
      const chiConv = await req(
        'GET',
        `/friends/${ids.chi}/conversation`,
        demoToken,
      );
      if (chiConv.ok) {
        await req(
          'POST',
          `/conversations/${chiConv.data.id}/messages`,
          demoToken,
          { content: 'Chào Chi, mình mới join Litmatch 👋' },
          { 'Idempotency-Key': uuid() },
        );
      }
      console.log(
        `  Đăng nhập được bằng SĐT nội địa "${DEMO_PHONE_LOCAL}" — OTP đọc qua`,
      );
      console.log('  `docker logs litmatch-core-api-1 | grep "Ma xac thuc"`.');
    }
  }

  await pg.end();
  console.log('\nXONG.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
