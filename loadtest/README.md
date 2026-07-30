# Litmatch — Load test (Giai đoạn 6 + Giai đoạn 7 roadmap)

3 script k6 cho luồng: Matching Queue, Signaling WebSocket, và luồng đầu-cuối Matching → Calling.
Script không phải bằng chứng capacity. Workflow manual `.github/workflows/staging-reliability.yml`
chạy k6 thật trên GitHub Environment `staging`, bắt buộc approval/change ticket và lưu raw summary
cùng commit SHA 90 ngày. Chỉ artifact của workflow đã chạy thành công trên target staging mới
được dùng trong SLO/capacity review; repo hiện không tự nhận một file script là evidence.

Môi trường viết ban đầu không có k6 hay staging credential nên lịch sử trước workflow này **chưa
có staging run hợp lệ**. Sau mỗi thay đổi topology/Redis/ingress/resource limit, operator phải
dispatch lại `Staging reliability evidence` và gắn artifact URL vào change ticket.

Ngoài ra có `party-room-livekit.sh` (Giai đoạn 7) — khác cơ chế hoàn toàn với 3 script k6 trên, xem
mục 4 bên dưới — và `party-room-slo.yaml` (mục tiêu SLO đi kèm).

## Cài k6

Xem hướng dẫn chính thức: https://k6.io/docs/get-started/installation/ (không cài trong task này
theo giới hạn quyền của agent).

## Chạy

```bash
# Matching queue — join/poll/cancel liên tục
k6 run -e BASE_URL=http://localhost:3000 -e VUS=20 -e DURATION=2m loadtest/matching-queue.js

# Luồng đầu-cuối Matching -> Calling (cần VUS chẵn, đủ đông để matcher-worker ghép được cặp)
k6 run -e BASE_URL=http://localhost:3000 -e VUS=10 -e DURATION=3m loadtest/calling-flow.js

# Signaling WebSocket (xem giới hạn quan trọng bên dưới TRƯỚC khi chạy)
k6 run -e BASE_URL_CORE=http://localhost:3000 -e SIGNALING_URL=ws://localhost:3001 \
  -e VUS=50 -e DURATION=2m loadtest/signaling-ws.js
```

## Auth dùng cho load test — vì sao chọn `/auth/guest`

Đã đọc `apps/core-api/src/modules/auth/auth.controller.ts`: có sẵn `POST /api/v1/auth/guest`
(body `{deviceId}`) — endpoint **thật**, không phải mock/dev-only, trả `AuthTokensDto` giống hệt
login OTP thật (`accessToken`, `refreshToken`, `expiresIn`, `userId`, `isGuest`). Đây là lựa chọn
ưu tiên "flow thật" theo đúng yêu cầu, không cần tự ký JWT test cục bộ — mỗi VU tự đăng ký 1 guest
account, JWT do chính core-api ký bằng `JWT_SECRET` thật của môi trường đang test.

**Giả định CẦN chủ thread xác nhận**: guest account tạo qua `/auth/guest` có đủ thuộc tính profile
(tuổi, giới tính, region) mà Matching module dùng để derive shard/ghép cặp
(`docs/03-architecture.md § 3.8.B`) hay không. Nếu guest thiếu field bắt buộc, ticket có thể kẹt
mãi ở `queued` tới `MATCHING_QUEUE_MAX_WAIT_SECONDS` mà không bao giờ `matched` — `matching-
queue.js` vẫn đo được latency/lỗi 3 endpoint join/poll/cancel bất kể giả định này đúng hay sai,
nhưng `calling-flow.js` (cần `matched` thật) sẽ cho tỉ lệ thành công thấp/0 nếu giả định sai. Nếu
vậy, phương án dự phòng là seed test user thật qua `/auth/otp/request` + `/auth/otp/verify`
(phức tạp hơn vì OTP thật cần gửi SMS/mock provider) — không tự chuyển sang phương án đó ở đây vì
ngoài phạm vi 2 hạng mục được giao.

## 1. `matching-queue.js`

Join queue liên tục → poll trạng thái → cancel. Đo latency + tỉ lệ lỗi cho từng endpoint
(`join_queue`, `get_ticket`, `cancel_ticket`) bằng k6 tag + `Trend`/`Rate` metric. Ngưỡng ban đầu:
p95 join < 800ms, get/cancel < 400ms, error rate < 2%.

## 2. `signaling-ws.js` — GIỚI HẠN QUAN TRỌNG (đọc trước khi tin kết quả)

k6 (`k6/ws` lẫn `k6/experimental/websockets`) chỉ nói WebSocket **thuần** theo chuẩn W3C, không có
client Socket.IO/Engine.IO built-in. Socket.IO **không phải** WebSocket trần — nó có 2 lớp framing
riêng (Engine.IO packet bọc Socket.IO packet) cộng cơ chế ping/pong do server khởi xướng để giữ
kết nối sống.

Script `signaling-ws.js` **tự viết tay** phần framing đó theo đặc tả công khai Engine.IO v4/
Socket.IO v4 — đây là _best-effort_, **CHƯA được chạy thử với signaling-gateway thật** (môi trường
viết script không có k6 binary lẫn server sống để verify). Nếu chạy thử và thấy sai lệch (không
nhận được packet CONNECT ack `40/signaling,...`, hoặc bị server đóng kết nối sớm bất thường), đây
là dấu hiệu framing tự viết tay không khớp — **đừng cố vá bằng đoán mò**.

**Phương án thay thế đã chuẩn bị sẵn**: `loadtest/signaling-ws.artillery.yml`, dùng
[`artillery-engine-socketio-v3`](https://www.npmjs.com/package/artillery-engine-socketio-v3) — có
client Socket.IO thật, không tự viết tay giao thức. Cũng **chưa chạy thử** (không có quyền cài
package), và cần xác minh lại tên field `namespace`/`auth` với đúng version plugin cài thật (ghi
rõ trong comment của file đó). Cài đặt:

```bash
npm install --no-save artillery artillery-engine-socketio-v3
ACCESS_TOKEN=$(curl -s -X POST http://localhost:3000/api/v1/auth/guest \
  -H 'Content-Type: application/json' -d '{"deviceId":"artillery-test-1"}' | jq -r '.data.accessToken')
ACCESS_TOKEN=$ACCESS_TOKEN npx artillery run loadtest/signaling-ws.artillery.yml
```

Khuyến nghị: chạy thử CẢ HAI ở môi trường staging thật, so sánh kết quả — nếu k6 script hoạt động
đúng (verify bằng log server hoặc `--http-debug`), dùng nó vì tích hợp cùng hệ CI/tooling TS của
team (đúng lý do chọn k6 ở `docs/04-tech-stack.md`); nếu không, dùng Artillery làm chính thức cho
riêng phần WebSocket.

## 3. `calling-flow.js`

Luồng đầu-cuối: join queue (voice) → poll tới `matched` → confirm → poll tới `confirmed` (lấy
`sessionId`) → `POST /calling/match-sessions/:matchSessionId/join` → giữ ngắn → end call. Đo
`match_to_call_joined_latency` (từ lúc join queue tới lúc join call thành công) và tỉ lệ `matched`
trong cửa sổ chờ `MATCH_WAIT_SECONDS`.

**Cần VUS đủ đông và chẵn** — matching cần ít nhất 2 ticket cùng shard (loại match + region + dải
tuổi) để matcher-worker (chạy nền, `MATCHING_MATCHER_INTERVAL_MS`) ghép cặp. Script không tự điều
phối cặp thủ công, dựa hoàn toàn vào matcher-worker thật đang chạy trong core-api.

## 4. `party-room-livekit.sh` — LiveKit media load (khác cơ chế với 3 script k6 trên)

k6 (`k6/ws` lẫn `k6/experimental/websockets`) không có client WebRTC — nó có thể gọi REST mint
token nhưng **không thể** publish/subscribe audio/video thật, nên không đo được tải media thật
của SFU (LiveKit). LiveKit tự cung cấp công cụ đúng việc này: `lk load-test` (LiveKit CLI, gói
`livekit-cli`) — mở kết nối client Go SDK thật, publish/subscribe track thật vào 1 room thật.

`party-room-livekit.sh` wrap `lk load-test` với **profile Party Room production**: số publisher/
subscriber lấy trực tiếp từ `PARTY_MAX_MEMBERS`/`PARTY_MAX_SPEAKERS` thật (mặc định 100 thành
viên, tối đa 8 speaker + 1 host = 9 publisher, còn lại 91 subscriber audience), audio-only (Party
Room hiện chưa có video — đã grep xác nhận). Xem comment đầu file script để biết đầy đủ nguồn số
liệu (file:line) và lý do chọn ramp-up/duration.

**CHƯA TỪNG CHẠY** — môi trường viết script này không có LiveKit server thật đang sống, và repo
hiện KHÔNG có môi trường staging LiveKit đã triển khai thật (`k8s/base/media-server/` mới là
manifest, chưa `kubectl apply` lên cluster thật). Chạy thử với `docker compose -f
apps/media-server/docker-compose.yml up -d` (dev, chỉ 1 node, không phản ánh capacity production)
hoặc với staging LiveKit thật (khi có) trước khi tin số liệu:

```bash
LIVEKIT_URL=ws://localhost:7880 \
LIVEKIT_API_KEY=devkey \
LIVEKIT_API_SECRET=devsecret_change_me_0123456789abcdef \
  ./loadtest/party-room-livekit.sh
```

Đo được gì: `lk load-test` in bytes/s, packets/s in/out, số track publish/subscribe thành công lúc
kết thúc. Nếu Prometheus đang scrape `prometheus_port` của LiveKit (xem
`apps/media-server/livekit.yaml`), đối chiếu thêm CPU/room/participant per-node qua
`k8s/base/media-server/prometheus-alerts.yaml`. Ngưỡng "đạt/không đạt" tham khảo
`party-room-slo.yaml` — ngưỡng đó cũng là **mục tiêu khởi điểm**, chưa phải số đo xác nhận.

## Về threshold (p95, error rate)

Toàn bộ ngưỡng trong 3 script + Artillery sketch là **gợi ý khởi điểm**, không phải SLO/số liệu
marketing. Production promotion phải có staging run thật và artifact theo
`docs/runbooks/reliability-slo-and-evidence.md`; không có artifact thì
`pnpm reliability:production-gate` phải FAIL.

## Response envelope

Toàn bộ response 2xx của core-api bị bọc bởi `ResponseEnvelopeInterceptor` toàn cục thành
`{"data": {...}}` — mọi chỗ đọc body trong 3 script đều dùng `JSON.parse(res.body).data`, không
đọc thẳng field ở root.
