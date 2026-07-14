import { createHash } from 'node:crypto';

import axios from 'axios';
import { AccessToken } from 'livekit-server-sdk';

/**
 * LiveKit gửi webhook thật với `Content-Type: application/webhook+json` (không phải
 * `application/json` chuẩn) — phát hiện qua UX audit 2026-07-14: `main.ts` chỉ bật `rawBody`
 * cho parser JSON mặc định (khớp đúng `application/json`), nên request LiveKit không bao giờ
 * được parser nào khớp, `req.rawBody` luôn `undefined`, verify chữ ký webhook luôn fail —
 * âm thầm 404/401 trước đó, `Calling`/`Party Room` không bao giờ nhận được sự kiện thật.
 *
 * Test này dựng đúng 1 webhook LiveKit hợp lệ (ký bằng `AccessToken.sha256` như SDK tự test —
 * xem `livekit-server-sdk/src/WebhookReceiver.test.ts`) và gửi với content-type thật của
 * LiveKit — phải nhận `200 { ok: true }`, không phải 401.
 */
describe('LiveKit webhook — Content-Type application/webhook+json', () => {
  const apiKey = 'devkey';
  const apiSecret = 'devsecret_change_me_0123456789abcdef';

  async function signedWebhookRequest(body: string): Promise<string> {
    const sha = createHash('sha256').update(body).digest('base64');
    const token = new AccessToken(apiKey, apiSecret);
    token.sha256 = sha;
    return token.toJwt();
  }

  it('calling webhook — nhận đúng content-type LiveKit dùng, không 401 vì thiếu rawBody', async () => {
    const body = JSON.stringify({
      event: 'room_started',
      room: {
        sid: 'RM_e2e_test',
        name: `call-e2e-webhook-${Date.now()}`,
      },
    });
    const jwt = await signedWebhookRequest(body);

    const res = await axios
      .post('/api/v1/calling/webhooks/livekit', body, {
        headers: {
          'Content-Type': 'application/webhook+json',
          // LiveKit KHÔNG thêm tiền tố "Bearer " vào header Authorization của webhook (khác quy
          // ước OAuth thông thường) — gửi thẳng JWT, khớp đúng cách SDK verify (jose.jwtVerify
          // nhận JWT trần, không parse "Bearer <token>").
          Authorization: jwt,
        },
        transformRequest: [(data) => data], // giữ nguyên body thô — không để axios tự stringify lại
      })
      .catch((err) => err.response);

    expect(res.status).toBe(200);
    expect(res.data.data.ok).toBe(true);
  });

  it('party-room webhook — nhận đúng content-type LiveKit dùng, không 401 vì thiếu rawBody', async () => {
    // roomId sau prefix phải là UUID hợp lệ (party-room.service.ts dùng thẳng làm PK query) —
    // không tồn tại thật thì service no-op (return sớm), miễn cú pháp UUID đúng.
    const body = JSON.stringify({
      event: 'room_started',
      room: {
        sid: 'RM_e2e_test',
        name: 'party-00000000-0000-0000-0000-000000000000',
      },
    });
    const jwt = await signedWebhookRequest(body);

    const res = await axios
      .post('/api/v1/party/webhooks/livekit', body, {
        headers: {
          'Content-Type': 'application/webhook+json',
          // LiveKit KHÔNG thêm tiền tố "Bearer " vào header Authorization của webhook (khác quy
          // ước OAuth thông thường) — gửi thẳng JWT, khớp đúng cách SDK verify (jose.jwtVerify
          // nhận JWT trần, không parse "Bearer <token>").
          Authorization: jwt,
        },
        transformRequest: [(data) => data],
      })
      .catch((err) => err.response);

    expect(res.status).toBe(200);
    expect(res.data.data.ok).toBe(true);
  });

  it('chữ ký sai vẫn bị từ chối đúng cách (không phải lỗi "thiếu body")', async () => {
    const body = JSON.stringify({
      event: 'room_started',
      room: { sid: 'RM_e2e_test', name: `call-e2e-bad-sig-${Date.now()}` },
    });

    const res = await axios
      .post('/api/v1/calling/webhooks/livekit', body, {
        headers: {
          'Content-Type': 'application/webhook+json',
          Authorization: 'Bearer not-a-real-jwt',
        },
        transformRequest: [(data) => data],
      })
      .catch((err) => err.response);

    expect(res.status).toBe(401);
    // rawBody ĐÃ được capture đúng (fix hoạt động) — lỗi phải là chữ ký sai, không phải "thiếu
    // body" (đó mới là triệu chứng của bug content-type gốc).
    expect(res.data.error.message).not.toMatch(/thiếu body/i);
  });
});
