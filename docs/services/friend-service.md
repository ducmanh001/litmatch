# Friend Service (module `friend` trong `core-api`) — Friendship + Chat 1-1 lâu dài

> Phạm vi: mục cuối Giai đoạn 2 "Friend + Chat 1-1". `Friendship` đã có từ slice Soul Match
> ([soul-match-service.md § 3](./soul-match-service.md)) — file này thêm `Conversation`/
> `Message`, chat 1-1 lâu dài giữa 2 user **đã là bạn**, KHÁC chat ẩn danh tạm thời của Soul
> Match (docs/02). **Ngoài phạm vi**: unfriend/remove friendship (chưa có trong roadmap), Party
> Room group chat. Block/report chặn chat ĐÃ áp dụng từ Giai đoạn 4 — xem § 6.

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
**Bất biến**: tồn tại `Friendship` cho 1 cặp ⟺ tồn tại `Conversation` cho đúng cặp đó — nhờ
vậy mọi thao tác chat chỉ cần kiểm tra `Conversation` tồn tại + caller là thành viên, không
cần gọi thêm `areFriends`.

Không có API "unfriend" ở slice này — `Friendship`/`Conversation` là quan hệ vĩnh viễn khi đã
tạo.

## 2. Message — khác Soul Match ở điểm nào

- **Không ẩn danh**: 2 bên đã là bạn (đã unlock profile qua Soul/Voice Match) nên
  `MessageDto` trả thẳng `senderUserId`, không cần vai trò tương đối `me|partner` như chat ẩn
  danh Soul Match.
- **Không có deadline/phase**: chat mở vĩnh viễn, không derive theo giờ server như Soul Match.
- **Append-only**, cursor keyset theo `seq` (bigint identity) — cùng pattern
  `SoulChatMessage` (không dùng `createdAt` làm cursor: 2 message cùng mili-giây làm
  trùng/mất dòng khi phân trang).
- Gửi: Idempotency-Key bắt buộc, unique DB prefix `friend:msg:{userId}:{key}` — client retry
  không nhân đôi; replay trả lại message cũ.
- Ảnh đính kèm: client gửi `imageUrl` (URL, cùng pattern `CreatePostDto.imageUrl` của Feed) —
  controller whitelist thành `attachment {kind:'image', payload:{url}}`; các kind nội bộ khác
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

| Endpoint                                  | Idempotency-Key       | Mô tả                                                                                                                                                                                                          |
| ----------------------------------------- | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /friends`                            | không                 | Danh sách bạn: profile công khai + `conversationId` + `friendSince` + `unreadCount`/`lastMessagePreview`/`muted` (per-caller), sort theo `conversation.lastMessageAt` (bạn mới chưa chat → sort `friendSince`) |
| `GET /friends/:friendUserId/conversation` | không                 | Conversation với đúng 1 bạn cụ thể — dùng để nhảy thẳng từ màn hình unlock-profile (Soul Match) sang chat mà không cần load lại toàn bộ danh sách bạn                                                          |
| `GET /conversations/:id/messages`         | không                 | List message, cursor theo `seq`                                                                                                                                                                                |
| `POST /conversations/:id/messages`        | có                    | Gửi message                                                                                                                                                                                                    |
| `POST /conversations/:id/read`            | không (tự idempotent) | Đánh dấu đã đọc tới hiện tại — upsert `conversation_member_states.last_read_at`, gọi lặp chỉ đẩy mốc tiến lên                                                                                                  |
| `POST /conversations/:id/mute`            | không (tự idempotent) | Bật/tắt thông báo hội thoại (body `{muted}`) — chỉ tắt kênh notification `friend_message` (cả in-app lẫn push); message, realtime và unread vẫn hoạt động                                                      |

### Trạng thái cá nhân theo thành viên — `conversation_member_states`

Mỗi (conversation, user) một dòng, **lazy** (vắng dòng ⟺ chưa đọc gì và không mute) — khác
`Conversation.lastMessageAt` là trạng thái chung. `unreadCount` = số message của **đối
phương** có `created_at > COALESCE(last_read_at, epoch)`. Khi người nhận đang mute,
`FriendService.sendMessage` bỏ qua bước tạo notification (best-effort cuối luồng) — không
ảnh hưởng persist message/streak/realtime.

`GET /friends/:friendUserId/conversation`: nếu `friendUserId` không phải bạn của caller →
404 (tra theo cặp canonical, không tồn tại nghĩa là chưa/không phải bạn — không phân biệt
"chưa từng là bạn" với "user không tồn tại", tránh oracle dò userId qua API này).

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
