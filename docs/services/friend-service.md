# Friend Service (module `friend` trong `core-api`) — Follow + Friendship + Chat 1-1 lâu dài

> Phạm vi: profile follow + Friendship + Chat 1-1. `Friendship` đã có từ slice Soul Match
> ([soul-match-service.md § 3](./soul-match-service.md)) — file này thêm `Conversation`/
> `Message`, chat 1-1 lâu dài giữa 2 user; ngoài Friendship, profile có thể mở conversation
> trực tiếp hoặc bằng Gift khi profile đã có đủ first-contact trong ngày. Khác chat ẩn danh tạm thời của Soul Match
> (docs/02). **Ngoài phạm vi**: unfriend/remove friendship (chưa có trong roadmap), Party Room
> group chat. Block/report chặn chat ĐÃ áp dụng từ Giai đoạn 4 — xem § 6.

## 1. Quan hệ Friendship ↔ Conversation — tạo cùng lúc, cùng transaction

1 cặp bạn = tối đa 1 `Conversation`, cùng cặp canonical `userLowId < userHighId` như
`Friendship`. `Conversation` được tạo **atomically cùng `Friendship`** trong
`FriendService.ensureFriendship` (không lazy-create ở lần gửi message đầu — tránh việc 2 bạn
mới match cùng nhau bấm gửi tin đầu tiên gần như đồng thời phải tự lo race tạo phòng):

```sql
INSERT INTO friendships (...) VALUES (...) ON CONFLICT DO NOTHING;
INSERT INTO conversations (...) VALUES (...) ON CONFLICT DO NOTHING;
```

Cả 2 câu lệnh cùng 1 transaction Postgres của caller (Soul Match rating, sau này Voice Match).
**Bất biến**: tồn tại `Friendship` cho 1 cặp ⇒ tồn tại `Conversation` cho đúng cặp đó. Ngoài
ra, `ProfileSocialService` có thể tạo một `Conversation` profile trước Friendship; mọi thao tác
chat vẫn chỉ cần kiểm tra `Conversation` tồn tại + caller là thành viên, không dùng client làm
nguồn sự thật về quyền. Friendship là quan hệ match hai chiều; follow là quan hệ một chiều và
không phải điều kiện để nhắn tin.

Khi một flow chat ẩn danh đạt mutual-like, caller truyền `FriendMessageSeed[]` trung lập vào
`ensureFriendship`. Friend ghi seed vào `messages` theo đúng sender/nội dung/thời điểm và key
import ổn định, cùng transaction với hai dòng quan hệ; `ON CONFLICT DO NOTHING` giúp replay
không nhân đôi. Module Friend không import entity của flow nguồn, còn flow nguồn giữ nguyên các
dòng chat ẩn danh append-only cho T&S.

Không có API "unfriend" ở slice này — `Friendship`/`Conversation` là quan hệ vĩnh viễn khi đã
tạo.

## 1.1 Profile follow và mở chat trực tiếp

- `POST /profiles/:profileUserId/follow` và `DELETE .../follow` là follow một chiều, upsert
  idempotent theo cặp; unfollow chỉ tắt `active`, không xoá lịch sử thời điểm quan tâm.
- `GET /profiles/:profileUserId/actions` trả `isFollowing`, conversation hiện có và trạng thái
  `requiresGift`; count/threshold do server tính theo số người lần đầu mở chat trực tiếp trong
  ngày UTC (`ProfileChatContact`), không theo follower.
- `POST /profiles/:profileUserId/conversation` mở chat ngay nếu dưới ngưỡng hoặc conversation
  đã tồn tại. Nếu đã có đủ N first-contact trong ngày, trả
  `PROFILE_SOCIAL_MESSAGE_GIFT_REQUIRED` (402) và không tạo conversation/contact.
- `POST /profiles/:profileUserId/gifts` dùng catalog server-side; `EconomyService.sendGift`
  ghi ledger, `GiftEvent` context `profileUserId`, conversation và first-contact trong cùng
  transaction. Quà mở chat một lần cho cặp; retry dùng idempotency key của transaction.

## 2. Message — khác Soul Match ở điểm nào

- **Không ẩn danh**: 2 bên đã mở chat (qua Friendship hoặc profile direct chat) nên
  `MessageDto` trả thẳng `senderUserId`, không cần vai trò tương đối `me|partner` như chat ẩn
  danh Soul Match.
- **Không có deadline/phase**: chat mở vĩnh viễn, không derive theo giờ server như Soul Match.
- **Append-only**, cursor keyset theo `seq` (bigint identity) — cùng pattern
  `SoulChatMessage` (không dùng `createdAt` làm cursor: 2 message cùng mili-giây làm
  trùng/mất dòng khi phân trang).
- Gửi: Idempotency-Key bắt buộc, unique DB prefix `friend:msg:{userId}:{key}` — client retry
  không nhân đôi; replay trả lại message cũ.
- Ảnh đính kèm: client upload qua Media Service rồi gửi `imageAssetId`; backend kiểm tra ownership
  - object tồn tại rồi whitelist thành `attachment {kind:'image', payload:{url}}`; các kind nội bộ khác
    (vd `story_reply`) chỉ set được qua DI giữa module. `content` được rỗng khi có ảnh; rỗng cả
    hai → 422 `FRIEND_MESSAGE_EMPTY`.
- `Conversation.lastMessageAt` cập nhật cùng transaction với insert message — dùng để sắp
  xếp danh sách chat gần nhất ở `GET /friends` (không phải nguồn sự thật gì khác, chỉ để sort).

## 3. Membership & IDOR (docs/10 § 10.1.D)

Mọi endpoint theo `conversationId` chỉ chấp nhận khi caller là 1 trong 2
`userLowId`/`userHighId` của đúng conversation đó — conversation không tồn tại **hoặc**
caller không phải thành viên đều trả **cùng 404** (không làm oracle dò `conversationId`,
cùng nguyên tắc đã áp dụng ở Soul Match/Calling).

## 4. API (`api/v1/friends`)

| Endpoint                                  | Idempotency-Key       | Mô tả                                                                                                                                                                                                       |
| ----------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /friends`                            | không                 | Danh sách mọi conversation: profile công khai + `conversationId` + `friendSince` + `unreadCount`/`lastMessagePreview`/`muted` + `isFriend` + `canCall` (per-caller), sort theo `conversation.lastMessageAt` |
| `GET /friends/:friendUserId/conversation` | không                 | Conversation của một cặp đã mở chat — dùng cho Friend Chat và profile chat trực tiếp                                                                                                                        |
| `GET /conversations/:id/messages`         | không                 | List message, cursor theo `seq`                                                                                                                                                                             |
| `POST /conversations/:id/messages`        | có                    | Gửi message                                                                                                                                                                                                 |
| `POST /conversations/:id/read`            | không (tự idempotent) | Đánh dấu đã đọc tới hiện tại — upsert `conversation_member_states.last_read_at`, gọi lặp chỉ đẩy mốc tiến lên                                                                                               |
| `POST /conversations/:id/mute`            | không (tự idempotent) | Bật/tắt thông báo hội thoại (body `{muted}`) — chỉ tắt kênh notification `friend_message` (cả in-app lẫn push); message, realtime và unread vẫn hoạt động                                                   |

### Trạng thái cá nhân theo thành viên — `conversation_member_states`

Mỗi (conversation, user) một dòng, **lazy** (vắng dòng ⟺ chưa đọc gì và không mute) — khác
`Conversation.lastMessageAt` là trạng thái chung. `unreadCount` = số message của **đối
phương** có `created_at > COALESCE(last_read_at, epoch)`; covering index
`(conversation_id, created_at) INCLUDE (sender_user_id)` giữ phép đếm này theo range của từng
conversation thay vì quét toàn bộ lịch sử chat. Khi người nhận đang mute,
`FriendService.sendMessage` bỏ qua bước tạo notification (best-effort cuối luồng) — không ảnh
hưởng persist message/streak/realtime.

`GET /friends/:friendUserId/conversation`: nếu chưa có conversation với `friendUserId` → 404
(tra theo cặp canonical, không phân biệt "chưa mở chat" với "user không tồn tại", tránh oracle
dò userId qua API này). `POST /conversations/:id/messages` vẫn chỉ guard membership của
conversation, nên người chưa follow vẫn nhắn tin được sau khi mở chat.

`canCall` chỉ true khi cả hai bản ghi `ProfileFollow` active tồn tại theo hai chiều. Đây là
metadata UX; endpoint Calling vẫn kiểm tra lại điều kiện ở server tại thời điểm mở phòng.

## 5. Realtime (tái dùng hạ tầng — [realtime-gateway.md](./realtime-gateway.md))

Publish `friend.message` cho cả 2 thành viên sau khi persist (best-effort, không outbox —
REST polling `GET /conversations/:id/messages` là fallback). Payload chứa thẳng
`senderUserId` (không cần per-recipient tính toán như Soul Match vì không ẩn danh). Hợp
đồng: `@litmatch/common-dtos` `realtime-events.ts`.

## 6. Block/Report — ĐÃ áp dụng (Safety module, Giai đoạn 4)

`sendMessage` guard block **2 chiều** tại thời điểm hành động (docs/10 § 10.0.C) qua
`SafetyService.isBlocked`; bị block trả **cùng mã lỗi/status** với "không phải thành viên"
(`CONVERSATION_NOT_FOUND` 404) — không tiết lộ ai block ai qua mã lỗi khác nhau
(docs/services/safety-service.md § 6). Report từ chat đi qua `POST /safety/reports` với
picker lý do ở web.

## 7. Config (Joi + `.env.example`)

`FRIEND_MESSAGE_MAX_LENGTH` (mặc định 2000 — chat lâu dài không cần giới hạn ngắn như Soul
Match 2-3 phút).
