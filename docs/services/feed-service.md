# Feed Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 4 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/feed`.

## 1. Mô hình hiển thị — feed công khai toàn cục, KHÔNG fanout

Domain model hiện tại không có `Follow`/`Follower` (docs/02); [07-roadmap.md](../07-roadmap.md)
Giai đoạn 7 mới nhắc "follower" như tối ưu fanout tương lai. GĐ4: **feed công khai toàn cục** —
mọi user (không phải guest) đăng nhập thấy tất cả bài chưa xoá, trừ tác giả đang trong quan hệ
block với mình (§ 3). Query thẳng theo `seq` giảm dần (cursor keyset, cùng pattern
`Message.seq` — [friend-service.md](./friend-service.md)), KHÔNG fanout-on-write — hợp lệ ở quy
mô hiện tại (docs/10 § Feed: fanout chỉ cần khi có follower lớn, chưa có ở GĐ4). Nếu sau này thêm
Follow, đổi query feed cá nhân hoá là việc riêng, không ảnh hưởng schema `Post`/`Comment`.

## 2. Data model

- `Post`: `authorUserId`, `content` (nullable), `imageUrl` (nullable — CHECK ít nhất 1 trong 2 có
  giá trị; client tự upload ảnh ra host ngoài, backend chỉ lưu URL — không có storage/CDN trong
  scope, cùng cách `User.avatarId` chỉ là reference), `likeCount`/`commentCount` (denormalized,
  cập nhật ATOMIC cùng transaction với insert/delete `Reaction`/`Comment` — chống pitfall "tăng
  trực tiếp 1 cột counter không transaction", docs/10 § Feed), `deletedAt` (soft delete — giữ lại
  cho comment con còn tham chiếu + audit, không hard-delete cascade).
- `Comment`: `postId`, `authorUserId`, `content`, `deletedAt` (soft delete, chỉ tác giả).
- `Reaction`: `postId`, `userId`, unique `(postId, userId)` — 1 loại duy nhất ("thả tim", docs/01
  #6), KHÔNG phải bảng đa loại reaction. Nguồn sự thật ai đã like (cho toggle idempotent); đếm
  atomic vào `Post.likeCount` cùng transaction insert/delete.

## 3. Block cắt hết điểm chạm (docs/10 § Trust & Safety, § Feed)

`SafetyService.getBlockedUserIds(userId): Promise<string[]>` (method mới, dùng chung được cho
Notification sau này) — trả tập userId đang có quan hệ block ACTIVE với `userId` (2 chiều, dựa
trên dòng mới nhất mỗi cặp — cùng logic `isBlocked` nhưng gộp thành 1 query `DISTINCT ON` thay vì
gọi lặp cho từng ứng viên).

- `GET /feed/posts`: loại tác giả nằm trong tập blocked khỏi kết quả.
- `GET /feed/posts/:id`: tác giả bị block (2 chiều) → CÙNG mã lỗi với "không tồn tại"
  (`POST_NOT_FOUND`, 404) — nhất quán style oracle-safe đã dùng ở Friend Chat, dù nội dung public
  (đơn giản hoá: 1 nhánh lỗi duy nhất, không cần phân biệt).
- Comment/reaction guard CHỈ theo cặp (người thao tác, tác giả bài) — KHÔNG lọc tiếp các
  commenter khác trong cùng thread có block với người xem (vd A không block B nhưng B đã block C
  — C vẫn thấy comment của B nếu C không bị block bởi tác giả bài). Đây là giới hạn phạm vi GĐ4,
  ghi rõ để không tưởng nhầm là đã cắt hết mọi điểm chạm.

## 4. Guest bị giới hạn

`AuthenticatedUser.isGuest` (đã có sẵn trong JWT payload, không cần round-trip DB) chặn tạo
post/comment/reaction — 403 `FeedErrors.GUEST_FORBIDDEN`. Xem feed vẫn cho phép (docs/06: guest
giới hạn tính năng tạo dữ liệu/giá trị, không giới hạn xem).

## 5. Idempotency reaction (like/unlike)

Không dùng append-only log như Block (reaction không phải hành động nhạy cảm cần audit) — 1 dòng
mutable/cặp, unique DB `(postId, userId)` chặn double-like race; unlike xoá dòng. Tăng/giảm
`likeCount` CHỈ khi insert/delete thực sự thành công (thua race unique → không tăng đếm 2 lần).

## 6. Ngoài scope GĐ4

- Không có Follow/personalized feed, không fanout, không edit post/comment (chỉ tạo + xoá mềm).
- Không upload ảnh thật (chỉ nhận URL) — thêm storage/CDN là quyết định hạ tầng riêng.
- Không cascade lọc block cho toàn bộ commenter trong thread (§ 3).

## 7. Audience per-post (W3 — docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 3.3)

`Post.audience` (`public | friends | only_me`, mặc định `public` — không đổi hành vi bài cũ):

- **Feed toàn cục (`GET /feed/posts`) CHỈ hiện `audience=public`** — trộn `friends`/`only_me` vào
  đây bắt buộc check quan hệ bạn cho TỪNG tác giả trên 1 trang lớn, quá tốn cho 1 feed discovery.
- **Profile timeline (`GET /feed/users/:userId/posts`)** — filter theo QUAN HỆ với 1 tác giả
  (1 check, không phải N): tự xem mình → mọi audience; là bạn (`FriendService.areFriends`) →
  `public`+`friends`; người lạ → chỉ `public`.
- **`getPostOrThrow` (guard trung tâm dùng lại ở comment/like/xoá) cũng enforce audience** — đi
  thẳng URL `GET /posts/:id` không phải cách né audience; vi phạm audience/block/không tồn tại
  đều trả CÙNG mã lỗi `POST_NOT_FOUND` (oracle-safe, không lộ lý do thật).
- `createPost` **idempotent theo Idempotency-Key** (unique DB) — client retry mất mạng không tạo
  đôi bài; cùng key khác nội dung → 409 `POST_IDEMPOTENCY_CONFLICT`.

## 8. Stories (W3, entity riêng `Story`/`StoryView` — KHÔNG dùng chung `Post`)

Ephemeral — KHÁC `Post` (không soft-delete/audit trail): hết hạn = filter lúc đọc
(`expiresAt <= now()`) là nguồn sự thật; `StorySweeperService` (pattern Party Room) hard-delete
định kỳ chỉ dọn rác, không phải chốt correctness. `story_views` cascade xoá theo FK khi story bị
sweeper xoá.

- **Ring (`GET /stories/ring`): chỉ story của mình + bạn bè** (quyết định chốt
  [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 6](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md))
  — `FriendService.listFriendIds` gộp toàn bộ graph bạn bè, loại tác giả đang block 2 chiều.
  `audience=public` tồn tại trên schema nhưng CHƯA có kênh phân phối rộng hơn ring ở W3 — không
  lộ khác biệt hành vi nào cho tới khi có discovery rộng hơn (backlog).
- **`getStoryOrThrow`**: tồn tại + chưa hết hạn + không block + đúng audience (`public` luôn qua;
  `friends` cần `areFriends`) — CÙNG mã lỗi `STORY_NOT_FOUND` cho mọi vi phạm.
- **Self-view không đếm** — tác giả xem story của mình không tạo `StoryView`. Xem lại nhiều lần =
  idempotent (unique `(storyId, viewerId)`).
- **Danh sách người xem CHỈ tác giả truy vấn được**, lọc block HIỆN TẠI lúc đọc — viewer đã xem
  trước khi bị block vẫn bị ẩn khỏi danh sách nếu block xảy ra SAU đó (docs/10 § 10.0.C).
- **Reply story → DM thật qua `FriendService.sendMessage`** với `attachment` snapshot
  `{ kind: 'story_reply', payload: { storyId, mediaUrl } }` — story chết sau TTL, message sống
  mãi nên phải snapshot `mediaUrl` NGAY LÚC REPLY. Đi trọn pipeline idempotency/block/
  realtime/notification sẵn có của Friend Chat. Chỉ reply được nếu là bạn của tác giả (cần
  `Conversation` thật) — trường hợp story `audience=public` từ người lạ (hiếm, chưa có kênh phân
  phối rộng ở W3): dịch lỗi Friend module sang `FEED_STORY_REPLY_REQUIRES_FRIENDSHIP` riêng, KHÔNG
  phụ thuộc mã lỗi nội bộ của module khác (docs/16 § 16.4).
- `Message.attachment` (jsonb, nullable) — cột trung lập `friend` sở hữu, dùng cho story reply
  (ở đây) và video share vào chat (backlog sau, xem
  [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md § 2](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)).

Config: `STORY_TTL_HOURS` (mặc định 24), `STORY_SWEEPER_INTERVAL_MS` (mặc định 3600000).

### Ngoài scope W3 Stories

- Chưa có xoá story sớm (chỉ tự hết hạn theo TTL).
- `audience=public` chưa có kênh phân phối ngoài ring bạn bè (điểm nối tương lai với Discovery).
- Chưa giới hạn số lần grace/replay cho reply (dùng chung rate-limit toàn cục, không riêng).
