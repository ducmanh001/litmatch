[← 01 · Product capabilities](./01-product-features.md) · **02 · Domain model** · [03 · Architecture →](./03-architecture.md)

# 2. Domain model và ownership map

File này là bản đồ aggregate/entity cấp hệ thống. Field, index, state transition và transaction
boundary chi tiết thuộc service spec và source code của module sở hữu. Tên trong bảng phản ánh
entity hiện có trong `apps/core-api/src/modules`; Redis queue/cache và LiveKit room là runtime
state, không được mô tả giả như entity PostgreSQL.

## 2.1 Context map

| Bounded context / owner                                      | Aggregate và entity chính                                                                                                                                                      | Quan hệ và invariant nổi bật                                                                                                                                       |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Identity** — `auth`, `user`                                | `User`, `AuthIdentity`, `PhoneOtp`, `RefreshToken`                                                                                                                             | Guest nâng cấp bằng cách gắn identity vào cùng `User`; refresh rotation/reuse detection thuộc Auth; profile public không lộ field nhạy cảm.                        |
| **Administration & support** — `admin`, `support`            | `AdminRolePermission`, `AdminAuditLog`, `SupportTicket`                                                                                                                        | Frontend role check chỉ hỗ trợ UX; backend guard/permission DB mới là authority. Support không được trở thành đường bypass moderation hoặc Economy.                |
| **Economy** — `economy`                                      | `Wallet`, `LedgerAccount`, `LedgerTransaction` (bảng `transactions`), `LedgerEntry`, `VipPlan`, `IapProduct`, `IapReceipt`, `PayosPackage`, `PayosPaymentOrder`, `OutboxEvent` | `LedgerEntry` double-entry append-only là nguồn sự thật; `Wallet` là snapshot; idempotency unique ở transaction; correction bằng reversal.                         |
| **Matching** — `matching`                                    | `MatchTicket`, `MatchSession`, `MatchInvite`, `GuestMatchQuota`, `MatchDailyQuota`; `MatchQueue` là Redis index                                                                | Một user chỉ có một active queue/ticket; pair/accept re-check consent/safety; regular/VIP/SVIP có quota Soul/Voice theo ngày UTC, guest có key chống farm đã hash. |
| **Anonymous text** — `soul-match`                            | `SoulChatMessage`, `SoulMatchRating` gắn `MatchSession`                                                                                                                        | Phase theo server time; rating immutable; mutual-like mới reveal và tạo Friendship/Conversation.                                                                   |
| **Calling** — `calling`                                      | `CallSession`, `VoiceMatchReaction`                                                                                                                                            | `CallSession.callKind` phân biệt Voice Match tối đa 7 phút và Friend call bền vững; mutual-like phải atomically tạo quan hệ bạn bè.                                |
| **Friend graph** — `friend`                                  | `Friendship`, `Conversation`, `ConversationMemberState`, `Message`, `ConversationStreak`                                                                                       | Một friendship 1-1 có conversation bền vững; block cắt send/read theo rule; streak dựa trên message hai chiều theo ngày UTC.                                       |
| **Discovery & presentation** — `discovery`, `avatar`, `mood` | `UserLocation`, `DiscoverySetting`, `AvatarAsset`, `UserAvatarConfig`, `UserAvatarItem`, `MoodPreset`, `MoodStatusEvent`                                                       | Nearby opt-in, không trả tọa độ thô/chính xác; DTO composition giữ anonymity/privacy; catalog/item ownership được server kiểm tra.                                 |
| **Party & gift** — `party-room`, `gift`                      | `PartyRoom`, `PartyRoomMember`, `Gift`, `GiftEvent`                                                                                                                            | Role/cap được khóa ở server; host lifecycle rõ; gift snapshot catalog và ghi event cùng transaction Economy áp dụng.                                               |
| **Feed & stories** — `feed`                                  | `Post`, `Comment`, `Reaction`, `Story`, `StoryView`                                                                                                                            | Audience/block ở guard trung tâm; counter atomic; story expiry được enforce khi đọc, sweeper chỉ dọn dữ liệu.                                                      |
| **Short video** — `short-video`                              | `Video`, `VideoView`, `VideoReaction`, `VideoComment`                                                                                                                          | State transition conditional; moderation/report không tự đổi trust score user; storage/transcode qua provider port.                                                |
| **Synchronous content** — `movie-match`                      | `MovieSession`, `MovieSessionActiveParticipant`, `MovieMatchQueueEntry`, `MovieSessionMessage`                                                                                 | Friend mode và anonymous mode dùng playback last-write-wins; anonymous queue/chat/rating không lộ partner trước mutual reveal; không tạo pipeline VOD riêng.       |
| **Entertainment content** — `palm-match`, `mini-game`        | `PalmReadingTemplate`, `PalmMatchSession`, `PalmMatchQueueEntry`, `PalmMatchActiveParticipant`, `MiniGameSession`, `MiniGameActiveParticipant`                                 | Palm queue/result snapshot và game state do server quyết định; conditional update/DB key chống double-submit/race.                                                 |
| **Trust & Safety** — `safety`                                | `Report`, `Block`                                                                                                                                                              | Report/audit append-only theo contract; block/report được các consumer re-check tại decision point.                                                                |
| **Notification** — `notification`                            | `Notification`                                                                                                                                                                 | In-app record thuộc core; push là adapter phụ thuộc runtime capability, không quyết định transaction nghiệp vụ gốc.                                                |

## 2.2 Quan hệ xuyên context

```text
User ─┬─ Wallet ─ Transaction ─ LedgerEntry ─ LedgerAccount
      ├─ MatchTicket ─ MatchSession ─┬─ SoulChatMessage / SoulMatchRating
      │                              └─ CallSession / VoiceMatchReaction
      ├─ Friendship ─ Conversation ─ Message ─ ConversationStreak
      ├─ PartyRoom / PartyRoomMember ─ GiftEvent ─ Economy transaction
      └─ Post / Story / Video / Report / Block / Notification
```

Sơ đồ chỉ thể hiện quan hệ nghiệp vụ, không cho phép module import entity nội bộ của nhau. Module
gọi qua public API/NestJS DI; khi cần atomicity xuyên module trong cùng database, owner phải truyền
`EntityManager` qua API được thiết kế rõ thay vì truy cập repository của module khác.

## 2.3 Những distinction bắt buộc

- `Wallet.balance` và `Wallet.earnings` là snapshot đọc nhanh, không phải ledger.
- `MatchQueue` là index Redis phục vụ tìm ứng viên; `MatchTicket` trong DB mới giữ business state.
- LiveKit room/participant và Socket.IO connection là transport/runtime state; quyền, membership,
  timer và lifecycle vẫn thuộc Core API.
- `Story` có lifecycle ephemeral; `Post`, ledger, report và audit không được áp dụng cùng policy
  xóa chỉ vì đều là bảng dữ liệu.
- `OutboxEvent` bảo vệ dual-write của Economy; nó không biến mọi call trong modular monolith thành
  event-driven và không thay transaction đồng bộ cho debit/credit.
- Public DTO là contract đã lọc; không serialize entity trực tiếp qua boundary.

Chi tiết đọc ở [service catalog](./services/README.md), [domain rules](./06-domain-rules.md) và
OpenAPI. Khi thêm entity/module mới, cập nhật bảng owner này cùng migration/spec liên quan; không
biến file này thành bản sao field-level của schema.

---

[← 01 · Product capabilities](./01-product-features.md) · [03 · Architecture →](./03-architecture.md)
