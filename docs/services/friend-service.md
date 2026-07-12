# Friend Service (module `friend` trong `core-api`) — Friendship + Chat 1-1 lâu dài

> Phạm vi: mục cuối Giai đoạn 2 "Friend + Chat 1-1". `Friendship` đã có từ slice Soul Match
> ([soul-match-service.md § 3](./soul-match-service.md)) — file này thêm `Conversation`/
> `Message`, chat 1-1 lâu dài giữa 2 user **đã là bạn**, KHÁC chat ẩn danh tạm thời của Soul
> Match (docs/02). **Ngoài phạm vi**: unfriend/remove friendship (chưa có trong roadmap), Party
> Room group chat, block/report chặn chat (Safety module là mục Giai đoạn 4 — chưa tồn tại,
> xem § 5).

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
- `Conversation.lastMessageAt` cập nhật cùng transaction với insert message — dùng để sắp
  xếp danh sách chat gần nhất ở `GET /friends` (không phải nguồn sự thật gì khác, chỉ để sort).

## 3. Membership & IDOR (docs/10 § 10.1.D)

Mọi endpoint theo `conversationId` chỉ chấp nhận khi caller là 1 trong 2
`userLowId`/`userHighId` của đúng conversation đó — conversation không tồn tại **hoặc**
caller không phải thành viên đều trả **cùng 404** (không làm oracle dò `conversationId`,
cùng nguyên tắc đã áp dụng ở Soul Match/Calling).

## 4. API (`api/v1/friends`)

| Endpoint                                  | Idempotency-Key | Mô tả                                                                                                                                                              |
| ----------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /friends`                            | không           | Danh sách bạn: profile công khai + `conversationId` + `friendSince`, sort theo `conversation.lastMessageAt` (bạn mới, chưa chat lần nào → sort theo `friendSince`) |
| `GET /friends/:friendUserId/conversation` | không           | Conversation với đúng 1 bạn cụ thể — dùng để nhảy thẳng từ màn hình unlock-profile (Soul Match) sang chat mà không cần load lại toàn bộ danh sách bạn              |
| `GET /conversations/:id/messages`         | không           | List message, cursor theo `seq`                                                                                                                                    |
| `POST /conversations/:id/messages`        | có              | Gửi message                                                                                                                                                        |

`GET /friends/:friendUserId/conversation`: nếu `friendUserId` không phải bạn của caller →
404 (tra theo cặp canonical, không tồn tại nghĩa là chưa/không phải bạn — không phân biệt
"chưa từng là bạn" với "user không tồn tại", tránh oracle dò userId qua API này).

## 5. Realtime (tái dùng hạ tầng — [realtime-gateway.md](./realtime-gateway.md))

Publish `friend.message` cho cả 2 thành viên sau khi persist (best-effort, không outbox —
REST polling `GET /conversations/:id/messages` là fallback). Payload chứa thẳng
`senderUserId` (không cần per-recipient tính toán như Soul Match vì không ẩn danh). Hợp
đồng: `@litmatch/common-dtos` `realtime-events.ts`.

## 6. Block/Report — chưa áp dụng (ghi nợ kỹ thuật tường minh)

`docs/01-product-features.md #15` liệt kê "block/report áp dụng cho chat" là 1 phần đặc tả
tính năng, nhưng Safety module (block/report) là mục Giai đoạn 4, hiện **chưa tồn tại trong
codebase** (matching module cũng đang ở trạng thái tương tự — dùng
`AllowAllInteractionPolicy` làm default). Slice này KHÔNG thêm guard block vì:

- Không có bảng `Block`/`Report` để tra.
- Thêm 1 policy interface riêng cho Friend ngay bây giờ là đặt trước abstraction cho use-case
  chưa tồn tại (docs/11 § chống over-engineering).

Khi Safety module ra đời (Giai đoạn 4): thêm guard "2 bên không block nhau" tại
`sendMessage`/`getConversationForFriend`, đọc TẠI THỜI ĐIỂM HÀNH ĐỘNG (docs/10 § 10.0.C) —
cùng pattern `MatchInteractionPolicy` của Matching.

## 7. Config (Joi + `.env.example`)

`FRIEND_MESSAGE_MAX_LENGTH` (mặc định 2000 — chat lâu dài không cần giới hạn ngắn như Soul
Match 2-3 phút).
