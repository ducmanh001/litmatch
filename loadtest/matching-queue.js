/**
 * Load test cho Matching Queue (Giai đoạn 6 roadmap — Load test k6/Artillery).
 *
 * Luồng mỗi iteration: guest login (1 lần/VU, tái dùng token) -> POST join queue
 * -> poll GET ticket vài lần -> DELETE cancel (nếu vẫn `queued`).
 *
 * Endpoint xác nhận từ code thật (không đoán):
 * - apps/core-api/src/modules/auth/auth.controller.ts: POST /api/v1/auth/guest {deviceId}
 *   -> AuthTokensDto {accessToken, refreshToken, expiresIn, userId, isGuest} (bọc trong
 *   envelope {"data": {...}} bởi ResponseEnvelopeInterceptor toàn cục).
 * - apps/core-api/src/modules/matching/matching.controller.ts:
 *   POST   /api/v1/matching/tickets            (bắt buộc header Idempotency-Key)
 *   GET    /api/v1/matching/tickets/:id
 *   DELETE /api/v1/matching/tickets/:id
 * - Global prefix core-api = 'api/v1' (loại trừ mỗi `/health*`) — apps/core-api/src/main.ts.
 * - Body JoinQueueDto: { matchType: 'soul'|'voice', genderPreference?: 'any'|'male'|'female' }
 *   (apps/core-api/src/modules/matching/entities/match-ticket.entity.ts — MatchType, GenderPreference).
 *
 * GIẢ ĐỊNH CẦN XÁC NHẬN: guest account tạo qua /auth/guest có đủ profile (tuổi, giới tính) để
 * matcher-worker ghép cặp không — nếu guest mặc định thiếu field bắt buộc cho matching, ticket
 * có thể kẹt ở `queued` tới khi hết MATCHING_QUEUE_MAX_WAIT_SECONDS. Test này KHÔNG phụ thuộc kết
 * quả matched (chỉ đo latency/lỗi của chính 3 endpoint join/poll/cancel), nên vẫn có giá trị dù
 * giả định trên sai — nhưng nếu cần đo tỉ lệ matched thật, dùng loadtest/calling-flow.js và xác
 * nhận giả định này trước.
 *
 * Chạy: k6 run -e BASE_URL=http://localhost:3000 loadtest/matching-queue.js
 * Biến môi trường:
 *   BASE_URL   - gốc core-api, mặc định http://localhost:3000
 *   VUS        - số virtual user đồng thời, mặc định 20
 *   DURATION   - thời lượng test, mặc định 2m
 *   MATCH_TYPE - 'voice' hoặc 'soul', mặc định 'voice'
 */
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const API_PREFIX = '/api/v1';
const MATCH_TYPE = __ENV.MATCH_TYPE || 'voice';

// Ngưỡng dưới đây là GỢI Ý KHỞI ĐIỂM, không phải SLO marketing — điều chỉnh theo dữ liệu
// production thật khi có (docs/03 § 3.8 phân biệt quyết định thiết kế sớm vs vận hành thật).
export const options = {
  scenarios: {
    matching_queue: {
      executor: 'constant-vus',
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || '2m',
    },
  },
  thresholds: {
    'http_req_duration{endpoint:join_queue}': ['p(95)<800'],
    'http_req_duration{endpoint:get_ticket}': ['p(95)<400'],
    'http_req_duration{endpoint:cancel_ticket}': ['p(95)<400'],
    errors: ['rate<0.02'],
  },
};

const errorRate = new Rate('errors');
const joinLatency = new Trend('join_queue_latency', true);

function uuidv4() {
  // Không phụ thuộc lib ngoài (jslib qua CDN) để script chạy được cả khi máy chạy k6 không có
  // mạng ra ngoài internet lúc thực thi — chỉ cần unique đủ dùng cho Idempotency-Key/deviceId.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

// Token guest cache theo VU (module-level state — mỗi VU chạy 1 JS VM riêng trong k6, biến này
// tồn tại xuyên suốt các iteration của CÙNG 1 VU, không phải global thật sự chia sẻ giữa các VU).
let cachedToken = null;

function guestLogin() {
  if (cachedToken) return cachedToken;
  const deviceId = `loadtest-${__VU}-${uuidv4()}`;
  const res = http.post(
    `${BASE_URL}${API_PREFIX}/auth/guest`,
    JSON.stringify({ deviceId }),
    {
      headers: { 'Content-Type': 'application/json' },
      tags: { endpoint: 'guest_login' },
    },
  );
  const ok = check(res, {
    'guest login 200/201': (r) => r.status === 200 || r.status === 201,
  });
  errorRate.add(!ok);
  if (!ok) return null;
  const body = JSON.parse(res.body);
  cachedToken = body.data.accessToken;
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

  // 1) Join queue
  const joinRes = http.post(
    `${BASE_URL}${API_PREFIX}/matching/tickets`,
    JSON.stringify({ matchType: MATCH_TYPE, genderPreference: 'any' }),
    {
      headers: { ...authHeaders, 'Idempotency-Key': uuidv4() },
      tags: { endpoint: 'join_queue' },
    },
  );
  joinLatency.add(joinRes.timings.duration);
  const joinOk = check(joinRes, {
    'join queue 201 hoặc 409 (đã có ticket active)': (r) =>
      r.status === 201 || r.status === 409,
  });
  errorRate.add(!joinOk);
  if (joinRes.status !== 201) {
    sleep(1);
    return;
  }
  const ticket = JSON.parse(joinRes.body).data;
  const ticketId = ticket.id;

  // 2) Poll ticket vài lần (mô phỏng client chờ kết quả ghép trong lúc chưa có push realtime
  // trong kịch bản test này — production dùng Socket.IO `match.matched`, xem signaling-ws.js)
  let status = ticket.status;
  for (let i = 0; i < 3 && status === 'queued'; i++) {
    sleep(1);
    const getRes = http.get(
      `${BASE_URL}${API_PREFIX}/matching/tickets/${ticketId}`,
      {
        headers: authHeaders,
        tags: { endpoint: 'get_ticket' },
      },
    );
    const getOk = check(getRes, { 'get ticket 200': (r) => r.status === 200 });
    errorRate.add(!getOk);
    if (getOk) status = JSON.parse(getRes.body).data.status;
  }

  // 3) Cancel nếu vẫn còn queued — nếu đã matched/confirmed/expired thì DELETE sẽ hợp lệ trả lỗi
  // theo state machine (chỉ cancel được từ `queued`), không tính là lỗi load test.
  if (status === 'queued') {
    const cancelRes = http.del(
      `${BASE_URL}${API_PREFIX}/matching/tickets/${ticketId}`,
      null,
      {
        headers: authHeaders,
        tags: { endpoint: 'cancel_ticket' },
      },
    );
    const cancelOk = check(cancelRes, {
      'cancel ticket 200/204': (r) => r.status === 200 || r.status === 204,
    });
    errorRate.add(!cancelOk);
  }

  sleep(1);
}
