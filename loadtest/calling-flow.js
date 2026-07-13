/**
 * Load test luồng đầu-cuối Matching -> Calling (Giai đoạn 6 roadmap — Load test k6/Artillery).
 *
 * Luồng: guest login -> join queue (voice) -> poll tới `matched` -> confirm -> poll tới
 * `confirmed` (lấy `sessionId`) -> POST join call (mint LiveKit token) -> poll trạng thái call
 * vài lần (mô phỏng giữ cuộc gọi) -> end call.
 *
 * Endpoint xác nhận từ code thật:
 * - apps/core-api/src/modules/matching/matching.controller.ts:
 *   POST /api/v1/matching/tickets, GET .../tickets/:id, POST .../tickets/:id/confirm
 * - apps/core-api/src/modules/calling/calling.controller.ts:
 *   POST /api/v1/calling/match-sessions/:matchSessionId/join -> JoinCallDto {call, token, livekitUrl}
 *   GET  /api/v1/calling/calls/:id -> CallDto {id, matchSessionId, status, ...}
 *   POST /api/v1/calling/calls/:id/end
 * - Liên kết: `TicketDto.sessionId` (có giá trị sau khi ticket `matched`/`confirmed`) CHÍNH LÀ
 *   `matchSessionId` dùng ở endpoint calling — không phải 2 id độc lập.
 *
 * QUAN TRỌNG — cần 2 phía để match thật: matching cần ÍT NHẤT 2 ticket cùng shard (loại match +
 * region + dải tuổi, docs/03 § 3.8.B) mới ghép được. Với N virtual user cùng chạy matchType=voice
 * và cùng genderPreference=any, matcher-worker (chạy nền trong core-api, MATCHING_MATCHER_INTERVAL_MS)
 * sẽ tự ghép các cặp phù hợp trong queue — script này KHÔNG tự điều phối cặp thủ công, dựa vào
 * matcher-worker thật. Nếu N quá nhỏ (vd VUS=1) sẽ không bao giờ matched — dùng VUS >= 2 (chẵn,
 * càng đông thì matcher càng có nhiều ứng viên).
 *
 * GIẢ ĐỊNH CẦN XÁC NHẬN (giống matching-queue.js): guest account qua /auth/guest có đủ thuộc tính
 * profile (tuổi, giới tính, region) mà matcher dùng để ghép hay không. Nếu tỉ lệ `matched` trong
 * kết quả test này rất thấp/0 dù VUS đủ đông, nhiều khả năng do guest thiếu field bắt buộc — cần
 * xác nhận với chủ thread hoặc chuyển sang seed user thật qua /auth/otp trước khi kết luận về
 * hiệu năng matching.
 *
 * Chạy: k6 run -e BASE_URL=http://localhost:3000 loadtest/calling-flow.js
 * Biến môi trường: BASE_URL, VUS (mặc định 10, nên là số chẵn), DURATION (mặc định 3m),
 *   MATCH_WAIT_SECONDS (thời gian tối đa chờ matched trước khi coi là timeout, mặc định 30).
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_PREFIX = '/api/v1';
const MATCH_WAIT_SECONDS = Number(__ENV.MATCH_WAIT_SECONDS || 30);

export const options = {
  scenarios: {
    calling_flow: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 10),
      duration: __ENV.DURATION || '3m',
    },
  },
  thresholds: {
    // p95 rộng hơn matching-queue.js vì đây là tổng nhiều bước tuần tự (join->matched->confirm->
    // join call), không phải 1 endpoint đơn lẻ — điều chỉnh theo SLO thật khi có traffic production.
    'http_req_duration{endpoint:join_call}': ['p(95)<1500'],
    errors: ['rate<0.05'],
    // Tỉ lệ ticket đạt matched trong cửa sổ chờ — ngưỡng thấp cố tình vì phụ thuộc số VU đủ đông
    // và giả định profile guest nêu trên; đây là tín hiệu quan sát, không phải gate cứng ban đầu.
  },
};

const errorRate = new Rate('errors');
const matchedRate = new Rate('matched');
const endToEndLatency = new Trend('match_to_call_joined_latency', true);

function uuidv4() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

let cachedToken = null;

function guestLogin() {
  if (cachedToken) return cachedToken;
  const deviceId = `loadtest-calling-${__VU}-${uuidv4()}`;
  const res = http.post(
    `${BASE_URL}${API_PREFIX}/auth/guest`,
    JSON.stringify({ deviceId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'guest_login' },
    },
  );
  const ok = check(res, {
    'guest login ok': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!ok);
  if (!ok) return null;
  cachedToken = JSON.parse(res.body).data.accessToken;
  return cachedToken;
}

export default function () {
  const token = guestLogin();
  if (!token) {
    sleep(1);
    return;
  }
  const authHeaders = {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  const flowStart = Date.now();

  // 1) Join queue (voice — có Calling gắn liền, khác Soul Match chỉ có chat ẩn danh)
  const joinRes = http.post(
    `${BASE_URL}${API_PREFIX}/matching/tickets`,
    JSON.stringify({ matchType: 'voice', genderPreference: 'any' }),
    {
      headers: { ...authHeaders, 'Idempotency-Key': uuidv4() },
      tags: { endpoint: 'join_queue' },
    },
  );
  const joinOk = check(joinRes, {
    'join queue 201 hoặc 409': (r) => r.status === 201 || r.status === 409,
  });
  errorRate.add(!joinOk);
  if (joinRes.status !== 201) {
    sleep(1);
    return;
  }
  let ticket = JSON.parse(joinRes.body).data;
  const ticketId = ticket.id;

  // 2) Poll tới `matched` trong cửa sổ MATCH_WAIT_SECONDS
  let waited = 0;
  while (ticket.status === 'queued' && waited < MATCH_WAIT_SECONDS) {
    sleep(1);
    waited += 1;
    const getRes = http.get(
      `${BASE_URL}${API_PREFIX}/matching/tickets/${ticketId}`,
      {
        headers: authHeaders,
        tags: { endpoint: 'get_ticket' },
      },
    );
    if (check(getRes, { 'get ticket 200': (r) => r.status === 200 })) {
      ticket = JSON.parse(getRes.body).data;
    }
  }
  matchedRate.add(ticket.status === 'matched' || ticket.status === 'confirmed');
  if (ticket.status !== 'matched') {
    // Timeout chưa matched (đủ ứng viên hay chưa, xem ghi chú giả định ở đầu file) — huỷ ticket
    // cho sạch queue rồi kết thúc iteration, không coi là lỗi cứng của flow calling.
    http.del(`${BASE_URL}${API_PREFIX}/matching/tickets/${ticketId}`, null, {
      headers: authHeaders,
      tags: { endpoint: 'cancel_ticket' },
    });
    sleep(1);
    return;
  }

  // 3) Confirm — cần CẢ HAI bên confirm mới sang `confirmed`; VU này chỉ confirm phần của mình,
  // phía đối phương là 1 VU khác trong cùng test cũng đang chạy script này.
  const confirmRes = http.post(
    `${BASE_URL}${API_PREFIX}/matching/tickets/${ticketId}/confirm`,
    null,
    { headers: authHeaders, tags: { endpoint: 'confirm_ticket' } },
  );
  const confirmOk = check(confirmRes, {
    'confirm 200/201': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!confirmOk);
  if (confirmOk) ticket = JSON.parse(confirmRes.body).data;

  // 4) Poll tới `confirmed` (chờ phía kia cũng confirm) để lấy sessionId
  waited = 0;
  while (
    ticket.status !== 'confirmed' &&
    ticket.sessionId == null &&
    waited < MATCH_WAIT_SECONDS
  ) {
    sleep(1);
    waited += 1;
    const getRes = http.get(
      `${BASE_URL}${API_PREFIX}/matching/tickets/${ticketId}`,
      {
        headers: authHeaders,
        tags: { endpoint: 'get_ticket' },
      },
    );
    if (check(getRes, { 'get ticket 200': (r) => r.status === 200 })) {
      ticket = JSON.parse(getRes.body).data;
    }
  }
  if (!ticket.sessionId) {
    sleep(1);
    return;
  }

  // 5) Join call bằng chính sessionId của ticket (= matchSessionId của Calling module)
  const joinCallRes = http.post(
    `${BASE_URL}${API_PREFIX}/calling/match-sessions/${ticket.sessionId}/join`,
    null,
    { headers: authHeaders, tags: { endpoint: 'join_call' } },
  );
  const joinCallOk = check(joinCallRes, {
    'join call 200/201': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!joinCallOk);
  if (!joinCallOk) {
    sleep(1);
    return;
  }
  endToEndLatency.add(Date.now() - flowStart);
  const call = JSON.parse(joinCallRes.body).data.call;

  // 6) Giữ cuộc gọi ngắn (mô phỏng), poll trạng thái vài lần thay vì realtime `call.ended`
  // (production dùng Socket.IO — xem signaling-ws.js) rồi chủ động end.
  sleep(2);
  http.get(`${BASE_URL}${API_PREFIX}/calling/calls/${call.id}`, {
    headers: authHeaders,
    tags: { endpoint: 'get_call' },
  });

  const endRes = http.post(
    `${BASE_URL}${API_PREFIX}/calling/calls/${call.id}/end`,
    null,
    {
      headers: authHeaders,
      tags: { endpoint: 'end_call' },
    },
  );
  check(endRes, {
    'end call 200/201': (r) => r.status === 200 || r.status === 201,
  });

  sleep(1);
}
