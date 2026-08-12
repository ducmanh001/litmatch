# Notification Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 4 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/notification`.

## 1. Cơ chế — gọi trực tiếp qua DI, KHÔNG Outbox/Kafka

Vẫn là modular monolith, chỉ có ĐÚNG 1 consumer (Notification) cho các sự kiện match/message/
gift/like-comment — chưa có nhu cầu tách service. Outbox+Kafka (docs/03 § 3.6) giải quyết
dual-write problem khi publish và ghi DB là 2 hệ khác nhau; ở đây Notification chỉ là 1 bảng khác
trong CÙNG Postgres, nên module sinh sự kiện (Matching/Friend/Gift/Feed) gọi thẳng
`NotificationService` qua DI, **trong cùng transaction đã có** khi có thể — không dual-write, không
cần Kafka. Quyết định này user đã chọn tường minh (so với xây Outbox chung — nhiều hạ tầng hơn cho
đúng 1 consumer, chưa cần thiết ở GĐ4). Đổi sang Outbox+Kafka sau NẾU thật sự tách Notification
thành consumer độc lập/nhiều consumer.

- Có transaction sẵn (Matching matcher/`confirmTicket` legacy, Gift `sendGift` qua `withinTransaction`, Feed
  `like`/`createComment`): gọi `NotificationService.createWithManager(manager, input)` — ghi
  Notification atomic cùng hành động gốc.
- Không có transaction chia sẻ được (Friend `sendMessage` — message tự commit riêng, xem
  `friend-service.md`): gọi `NotificationService.create(input)` — tự transaction riêng, chạy NGAY
  SAU khi message đã persist, best-effort (bọc try/catch, log lỗi, KHÔNG làm fail luồng gửi tin
  nhắn — notification là side effect phụ, docs/03 § 3.6).
- Push (best-effort, SAU khi transaction/insert notification đã commit — không bao giờ trước):
  `NotificationService.sendPush(notification)`, nuốt lỗi + log, không throw ra caller.

## 2. Data model

- `Notification`: `userId` (người nhận), `type` (enum), `payload` (jsonb — dữ liệu tối thiểu để
  client tự render, KHÔNG hardcode text hiển thị ở backend), `readAt` (nullable), `createdAt`.

## 3. Trigger point theo từng loại (không chen vào luồng chính — chỉ thêm, không đổi logic gốc)

| Type              | Nơi gọi                                                                   | Payload                                            | Lưu ý                                                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `match_confirmed` | Matcher chốt cặp (hoặc `MatchingService.confirmTicket` legacy)            | `{ sessionId, matchType }`                         | **KHÔNG bao giờ có partnerId/nickname** — Soul Match ẩn danh tới khi unlock (docs/06); lộ danh tính qua notification phá toàn bộ giá trị ẩn danh, xem docs/10 § Soul Match |
| `friend_message`  | `FriendService.sendMessage` sau khi message persist                       | `{ conversationId, senderUserId, preview }`        | Friend Chat KHÔNG ẩn danh (đã unlock) nên lộ senderUserId là ĐÚNG, không phải bug (khác Soul Match)                                                                        |
| `gift_received`   | `GiftService.sendGift` trong `withinTransaction` (economy-service.md § 6) | `{ roomId, senderUserId, giftCode, priceDiamond }` | Party Room không ẩn danh — sender lộ là đúng                                                                                                                               |
| `post_liked`      | `FeedService.like`                                                        | `{ postId, actorUserId }`                          | Bỏ qua nếu actor = author (không tự notify chính mình)                                                                                                                     |
| `post_commented`  | `FeedService.createComment`                                               | `{ postId, commentId, actorUserId }`               | Tương tự — bỏ qua tự comment lên bài mình                                                                                                                                  |

## 4. Push — isolated provider adapters

Business code chỉ phụ thuộc `PushNotificationPort` tại `common/platform`; `Dev`, `Disabled`, FCM
HTTP v1 và APNs HTTP/2 là các adapter được chọn bởi `NOTIFICATION_PUSH_PROVIDER`. `dev` bị chặn ở
production; `disabled` chỉ bỏ external push nên row in-app vẫn được persist. FCM/APNs không log
device token, payload hay user id. Lỗi provider trả trạng thái thất bại/bị nuốt ở boundary và không
được làm hỏng transaction chính.

Adapter nhận device token khi caller có token. Luồng đăng ký/rotate token native chưa thuộc scope
này; các call site hiện tại không có token nên vẫn giữ fallback in-app/dev/disabled như trước.

Config provider: `NOTIFICATION_PUSH_PROVIDER` (`dev` | `fcm` | `apns` | `disabled`, default `dev`),
`NOTIFICATION_PUSH_HTTP_TIMEOUT_MS` và credential tương ứng `NOTIFICATION_FCM_*` hoặc
`NOTIFICATION_APNS_*`. Production không có credential/token phải chọn `disabled`, không fallback về
`dev`.

## 5. Analytics — optional PostHog adapter

Business code chỉ gọi `AnalyticsPort`; `PostHogAnalyticsAdapter` dùng server capture API và không
import `posthog-js`. `ANALYTICS_ENABLED=false` hoặc `ANALYTICS_PROVIDER=disabled` chọn no-op.
Provider failure được log bằng thông điệp tổng quát và bỏ qua; key nhạy cảm như token, secret,
OTP, receipt, message, email, phone và IP bị loại khỏi properties trước khi gửi.

Config: `ANALYTICS_ENABLED`, `ANALYTICS_PROVIDER` (`posthog` | `disabled`), `POSTHOG_PROJECT_TOKEN`,
`POSTHOG_HOST` và `ANALYTICS_HTTP_TIMEOUT_MS`.

## 6. API

- `GET /notifications` — cursor, mới nhất trước.
- `GET /notifications/unread-count` — badge số chưa đọc.
- `POST /notifications/:id/read` — đánh dấu đã đọc, idempotent, chỉ chủ sở hữu.

## 7. Ngoài scope GĐ4

- Native device-token registration/rotation và preference theo từng loại notification — cần contract
  backend/native riêng.
- Notification preference (tắt riêng từng loại) — chưa có, mọi loại luôn bật.
- Soul Match message (ẩn danh, cửa sổ ngắn 2-3 phút) KHÔNG có notification — giá trị thấp do phòng
  đóng nhanh, ẩn danh cũng khiến payload khó thiết kế đúng như `friend_message`.
