# Realtime qua Signaling Gateway — slice nền fanout (Giai đoạn 2) + cluster adapter (Giai đoạn 6)

> Phạm vi: nền realtime của `apps/signaling-gateway` (Socket.IO) + cách core-api publish +
> Redis cluster adapter cho horizontal scale (§ 6).
> **Ngoài phạm vi**: điều khiển LiveKit (mint token phòng, join/leave call, ACK media —
> thuộc mục SFU/Calling của roadmap).

## 1. Nguyên tắc phân vai (docs/03 § 3.3)

Gateway **không chứa business logic** và không query DB. Mọi quyết định authz/membership/
ẩn danh do **core-api quyết TẠI THỜI ĐIỂM PUBLISH**: event được publish vào channel theo
**người nhận** `realtime:user:{userId}`, payload đã tính sẵn per-recipient (vd `senderRole`
của chat ẩn danh là `me|partner`, không bao giờ chứa userId đối phương). Gateway chỉ làm 3
việc: (1) verify JWT lúc handshake, (2) join socket vào room `user:{userId}` lấy từ
`payload.sub` **đã verify** — không nhận room từ client, (3) relay envelope Redis → socket
nguyên văn. Nhờ vậy slice này **không cần internal API** giữa gateway và core-api.

## 2. Hợp đồng (1 định nghĩa duy nhất — `@litmatch/common-dtos`)

- `AccessTokenPayload` (`auth-token.ts`): core-api ký, core-api guard + gateway handshake
  cùng verify bằng CÙNG `JWT_SECRET`. Gateway không bao giờ ký token.
- `realtime-events.ts`: channel builder/parser, tên event, kiểu payload
  (`RealtimeEnvelope<T>`). Event hiện có: `soul.message`, `soul.matched`, `match.matched`,
  `match.confirmed`, `call.ended`, `friend.message`, `party.member.joined`,
  `party.member.left`, `party.role.changed`, `party.room.closed`, `gift.sent`. Thêm event
  mới = thêm vào file này, 2 app cùng thấy — lệch hợp đồng là lỗi compile.

## 3. Ngữ nghĩa best-effort (chủ đích, không phải thiếu sót)

Publish luôn chạy **SAU khi DB transaction commit**, bọc try/catch + log warn
(`common/realtime/publish-realtime.ts` phía core-api) — publish fail **không** phá nghiệp vụ
đã commit, và replay idempotency **không bắn lại** event. Client luôn còn REST polling làm
fallback (`GET /matching/tickets/:id`, `GET /soul-match/sessions/:id[/messages]`). Vì event
là ephemeral + có fallback nên **không dùng outbox** cho luồng này (outbox dành cho consumer
nghiệp vụ như Notification — docs/10 § Distributed).

## 4. Producer hiện có (core-api)

| Nơi publish                                          | Event             | Người nhận                   |
| ---------------------------------------------------- | ----------------- | ---------------------------- |
| matcher-worker `tryPair` thành công (sau commit)     | `match.matched`   | cả 2 user của cặp            |
| `confirmTicket` chốt đủ 2 confirm (sau commit)       | `match.confirmed` | cả 2 user                    |
| `soul-match` gửi message MỚI (sau persist)           | `soul.message`    | cả 2 (payload per-recipient) |
| `soul-match` mutual like TẠO friendship (sau commit) | `soul.matched`    | cả 2                         |
| `calling` end call ở MỌI nhánh (sau commit)          | `call.ended`      | cả 2 user của call           |
| `friend` gửi message chat 1-1 (sau persist)          | `friend.message`  | cả 2 bạn                     |
| `party-room` join/leave/đổi role/đóng phòng          | `party.*`         | member active của phòng      |
| `gift` tặng quà thành công (SAU transaction tiền)    | `gift.sent`       | member active của phòng      |

Mỗi module publish bằng Redis client riêng của mình (docs/05 § 5.3) qua helper chung
`publishRealtimeEvent`.

## 5. Gateway (apps/signaling-gateway)

- Namespace `/signaling`; handshake `auth.token` = access token của core-api; fail →
  `connect_error: UNAUTHORIZED` (không thành connection — không tồn tại socket vô danh).
- 1 connection Redis riêng cho `PSUBSCRIBE realtime:user:*` (ioredis subscriber mode không
  dùng chung với lệnh khác); channel lạ/payload rác → bỏ qua + log, không chết.
- Socket chết được dọn bởi ping/pong mặc định của Socket.IO (`pingTimeout`) — chưa cần timer
  riêng vì gateway không giữ room state nghiệp vụ (docs/10 § Calling/Signaling).
- Config Joi: `JWT_SECRET` (bắt buộc, cùng core-api), `REDIS_URL`.

## 6. Cluster adapter cho Socket.IO (Giai đoạn 6 — horizontal scale)

`SignalingRedisAdapterService` (`apps/signaling-gateway/src/app/redis-adapter.service.ts`) mở
**2 kết nối Redis riêng** cho `@socket.io/redis-adapter` — KHÔNG dùng chung với connection
PSUBSCRIBE `realtime:user:*` của `SignalingGateway` (giữ đúng nguyên tắc "1 connection riêng cho
subscribe" ở § 5). Adapter được `connect()` xong TRƯỚC `app.listen()` và gắn vào `CorsIoAdapter`
(nay nhận thêm tham số `clusterAdapter`) — bắt buộc thứ tự này vì `afterInit()` của gateway (chạy
lúc `listen()`) cần Server đã có adapter.

Giá trị mang lại: gọi `server.to(room).emit()` ở 1 instance giờ tới được socket đang giữ ở
**instance khác** trong cụm — điều relay PSUBSCRIBE ở § 3-4 (mỗi instance tự nhận toàn bộ event
qua Redis pub/sub rồi chỉ emit cho room cục bộ của mình) vốn KHÔNG cần tới cluster adapter để hoạt
động đúng, nhưng cluster adapter mở đường cho các tính năng Socket.IO xuyên instance sau này
(broadcast toàn cụm, `fetchSockets()`...) mà không phải thiết kế lại tầng transport.

Verify: `signaling.horizontal-scale.integration.spec.ts` boot 2 Nest app instance thật (2 port
khác nhau, cùng Redis thật), 1 client chỉ connect vào instance A, gọi thẳng `server.to(room).emit()`
ở instance B — client vẫn nhận được event. Readiness `/health/ready` cộng thêm check
`redisClusterAdapter` (song song `redisSubscription` sẵn có).

Lưu ý transport: cluster adapter không tự giải quyết sticky-session cho Socket.IO long-polling
qua nhiều instance — client hiện đã cố định `transports: ['websocket']` (xem test), nên không cần
sticky session ở tầng LB miễn còn giữ đúng cấu hình này.
