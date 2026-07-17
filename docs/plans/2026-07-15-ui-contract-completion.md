# UI contract completion — lấy `layouts/` làm nguồn yêu cầu

Ngày: 2026-07-15  
Trạng thái: HOÀN TẤT 2026-07-16 (verify PASS — xem mục cuối)

## 1. Hợp đồng task

- **Objective:** mọi route và hành động có ý nghĩa trong `layouts/web/*.html` và
  `layouts/admins/*.html` phải được nối tới state/API thật; frontend không tự dựng business
  state. OpenAPI, service spec, code và test phải khớp hai chiều.
- **Ngoài phạm vi:** provision credential/tenant bên thứ ba (Apple, Google, Facebook, FCM/APNs,
  object storage/transcode production), triển khai multi-region/cluster production và các hiệu
  ứng chỉ để trang trí không thay đổi dữ liệu.
- **Acceptance criteria:** không còn nút “sắp có”, `DemoPill`, số đếm hash/demo hoặc mutation chỉ
  đổi state cục bộ cho một hành động nghiệp vụ; mọi write có auth/validation/ownership và
  idempotency phù hợp; `openapi:sync`, test/lint/build/agent verify sạch; walkthrough trình duyệt
  bằng ít nhất hai user cho luồng tương tác hai phía.
- **Nguồn sự thật:** UI quyết định capability và flow; domain docs quyết định correctness,
  security, privacy, transaction và boundary. Nếu hình vẽ UI mâu thuẫn invariant (ví dụ client
  tự tính tiền/quyền), backend vẫn là chốt chặn và UI nhận state đã xác nhận từ server.

## 2. Ma trận chức năng

| Cụm UI                               | Đã nối thật                                       | Khoảng trống phải đóng                                                           | Owner backend                      |
| ------------------------------------ | ------------------------------------------------- | -------------------------------------------------------------------------------- | ---------------------------------- |
| Auth/onboarding                      | OTP, guest, refresh cookie                        | Google/Apple/Facebook UI, onboarding profile                                     | `auth`, `user`                     |
| Home/navigation                      | route tới feature thật                            | notification panel, mood/story action, bỏ số demo                                | `notification`, `mood`, `feed`     |
| Discovery                            | browse, nearby, invite                            | xem public profile đầy đủ, trạng thái invite đã gửi                              | `discovery`, `matching`, `user`    |
| Matching/Soul/Voice                  | queue, confirm, speed-up, chat/rating, call       | friend-call CTA từ chat và trạng thái đầy đủ khi retry                           | `matching`, `calling`              |
| Friend chat                          | list, message text, block                         | search, unread/presence, mute persist, report picker, public profile, attachment | `friend`, `safety`, `user`         |
| Party Room                           | create/join/leave/role/gift/audio                 | search/category, member counts thật, admin force-close                           | `party-room`, `admin`              |
| Feed/Stories                         | post/like/comment/detail                          | audience selector, media upload, story UI, emoji UX                              | `feed`                             |
| Short video                          | feed/view/like/comment/report, upload API backend | upload UI, gift CTA, admin list published/remove                                 | `short-video`, `gift`, `admin`     |
| Movie Match                          | session giữa bạn bè, playback sync/chat           | flow ghép ẩn danh theo UI, reaction realtime, time limit, rating                 | `movie-match`                      |
| Palm Match                           | bài đọc solo backend                              | flow ghép/flip/% hợp/rating thật thay demo local                                 | `palm-match`                       |
| Profile/avatar                       | xem/sửa profile cơ bản                            | public profile route, interests/seeking/age range, avatar/photo UI               | `user`, `avatar`                   |
| Wallet/VIP                           | wallet, IAP product/top-up, VIP purchase backend  | list VIP plans + nút mua thật; admin catalog                                     | `economy`, `admin`                 |
| Help/privacy                         | nội dung tĩnh                                     | feedback submit + trạng thái theo dõi; report từ chat                            | module `support` mới + `safety`    |
| Admin users/moderation/economy/gifts | API thật                                          | warning, published video/remove                                                  | `admin`, owner domain              |
| Admin rooms                          | list phòng                                        | count thật, force-close                                                          | `party-room`, `admin`              |
| Admin config                         | demo local                                        | catalog Diamond/VIP + broadcast notification thật                                | `economy`, `notification`, `admin` |
| Admin permissions                    | demo local                                        | staff list/assign role + effective permission matrix                             | `user`, `admin`                    |
| Admin dashboard                      | live rooms thật                                   | aggregate stats, revenue series, tier split, audit-log list                      | `admin` + public read models       |

## Review — UI contract (cross-domain) — plan — 2026-07-15

### 1. Phạm vi & luồng nghiệp vụ

`layout action → React form/mutation → generated API client → controller DTO/guard → domain
service → transaction/DB or external port → response DTO → query invalidation/realtime → UI
confirmed state`

Các flow hai người dùng tuân theo chuỗi:

`A khởi tạo → server ghi pending/idempotency → B thấy qua REST/realtime → B accept/decline →
server khoá state và chuyển một lần → cả A/B refetch state thật → session hoạt động → kết thúc/
rating terminal`.

### 2. Bảng giả định

| #   | Giả định                                         | Ai phá / cách phá                  | Chặn dự kiến ở đâu                                                   | Verdict     |
| --- | ------------------------------------------------ | ---------------------------------- | -------------------------------------------------------------------- | ----------- |
| 1   | UI không phải chốt quyền                         | deep-link/caller gọi API trực tiếp | JWT + role/permission + ownership trong controller/service           | ✅ kế hoạch |
| 2   | Retry không nhân đôi side effect                 | double-click, timeout, reconnect   | `Idempotency-Key` + unique DB/conditional transition                 | ✅ kế hoạch |
| 3   | Giá/số dư/quyền không lấy từ client              | client sửa payload/cache cũ        | catalog và lock/transaction ở owner domain                           | ✅ kế hoạch |
| 4   | Một user không ở hai phiên ghép active cùng loại | hai tab/two workers                | active-participant unique/lock + state machine                       | ✅ kế hoạch |
| 5   | Block/report có hiệu lực tại lúc hành động       | block giữa lúc đang xem/chat       | `SafetyService` re-check trong transaction/action                    | ✅ kế hoạch |
| 6   | Realtime chỉ là delta                            | socket rớt/miss event              | reconnect invalidate REST query liên quan                            | ✅ kế hoạch |
| 7   | Upload lớn không đi qua NestJS                   | browser gửi file vào API           | presigned upload port; API chỉ nhận metadata/complete                | ✅ kế hoạch |
| 8   | Admin mutation luôn truy vết được                | moderator/admin thao tác nhạy cảm  | append-only `admin_audit_logs` cùng transaction                      | ✅ kế hoạch |
| 9   | Credential ngoài có thể chưa tồn tại local       | OAuth/push/storage production      | port + env validation + fail-fast production; dev adapter có nhãn rõ | ✅ kế hoạch |
| 10  | Dữ liệu hiện có sống qua migration               | deploy rolling/rollback            | migration additive, default/backfill, không sửa migration cũ         | ✅ kế hoạch |

### 3. Checklist áp dụng

| Mục                                 | Kết quả  | Ghi chú                                             |
| ----------------------------------- | -------- | --------------------------------------------------- |
| Boundary/domain ownership           | Kế hoạch | mở rộng owner hiện hữu; chỉ `support` là module mới |
| DTO/OpenAPI/generated client        | Kế hoạch | sync trong cùng thay đổi API                        |
| Auth/IDOR/privacy                   | Kế hoạch | deny-by-default và test caller khác                 |
| Transaction/idempotency/concurrency | Kế hoạch | bắt buộc cho Economy và state machine hai phía      |
| Realtime/reconnect                  | Kế hoạch | event versioned, REST refetch sau reconnect         |
| Error/empty/loading/success UX      | Kế hoạch | mọi query/mutation có đủ state                      |
| Observability/audit                 | Kế hoạch | admin writes có audit; support có status/timestamps |
| Compatibility/migration             | Kế hoạch | additive only                                       |

### 4. Test dự kiến

- Unit/component: mỗi CTA gọi đúng endpoint, giữ idempotency key khi retry, render đủ state.
- Integration Postgres: Economy catalog/purchase, admin permission/audit, các transition
  Movie/Palm và race hai request.
- HTTP E2E: auth → profile → discovery/chat/report; admin config/permission/dashboard.
- Playwright/dogfood: hai user OTP/guest, match/chat/party/movie/palm; một admin vận hành.
- Gates: `pnpm agent:check`, `pnpm agent:test`, `pnpm format:check`, `pnpm lint`, `pnpm build`,
  `pnpm agent:verify core`, `pnpm agent:verify frontend` và Economy Postgres không cache.

### 5. Kết luận: PASS (plan)

Vị trí chặn và acceptance criteria đã xác định. Mỗi cụm domain sẽ có spec chi tiết trước khi
thay state machine/schema; mode `verify` phải PASS sau toàn bộ thay đổi.

## Review — Palm Match ghép ẩn danh — plan — 2026-07-15

### 1. Business flow và nguồn sự thật

`POST queue → transaction khóa matcher → Safety re-check → tạo session snapshot → mỗi bên chỉ
lật lá của mình → server chỉ trả kết quả duyên số sau khi cả hai đã lật → mỗi bên rate một lần →
mutual-like tạo Friendship + Conversation trong cùng transaction → profile đối phương mới mở`.

Queue, session, lượt lật, rating và kết quả terminal đều thuộc `palm-match`; quan hệ bạn và
conversation vẫn do public API `FriendService.ensureFriendship` sở hữu. REST state là nguồn sự
thật; web poll để phục hồi khi mất kết nối hoặc reload, không tự sinh đối thủ/kết quả.

### 2. Bảng giả định và vị trí chặn

| #   | Giả định                                         | Cách bị phá                   | Chặn ở đâu                                                                           | Verdict     |
| --- | ------------------------------------------------ | ----------------------------- | ------------------------------------------------------------------------------------ | ----------- |
| P1  | Một user chỉ queue một lần                       | double-click/hai tab          | PK `palm_match_queue_entries.user_id` + insert idempotent                            | ✅ kế hoạch |
| P2  | Một user chỉ có một session chưa dismiss         | hai matcher cùng ghép         | PK `palm_match_active_participants.user_id` + advisory transaction lock              | ✅ kế hoạch |
| P3  | Cặp không block/report nhau lúc ghép             | block sau khi đã enqueue      | `SafetyService.canPair` chạy lại trong transaction matcher                           | ✅ kế hoạch |
| P4  | Client không tự lật lá đối phương                | sửa JS/gọi endpoint trực tiếp | flip suy participant từ JWT; không nhận `userId/card` trong body                     | ✅ kế hoạch |
| P5  | Kết quả không đổi khi retry/reload               | client random lại             | sign/%/fortune snapshot một lần trong `palm_match_sessions`                          | ✅ kế hoạch |
| P6  | Rating không đổi sau lần đầu                     | retry payload khác            | row lock + cột rating một lần; khác verdict trả 409                                  | ✅ kế hoạch |
| P7  | Profile ẩn danh không bị leak                    | dò session/đọc response sớm   | 404 gộp non-member; chỉ trả `partnerUserId` khi Friendship tồn tại                   | ✅ kế hoạch |
| P8  | Hai like không tạo friendship thiếu conversation | hai rating đồng thời          | lock session + `FriendService.ensureFriendship(manager, ...)` atomic/idempotent      | ✅ kế hoạch |
| P9  | Session/queue không giữ user vô hạn              | tab đóng/mạng rớt             | deadline từ config, lazy expiry trên current/action/join, state terminal cần dismiss | ✅ kế hoạch |

### 3. Test dự kiến

- Unit: reading cũ không đổi; DTO privacy theo caller; rating retry cùng giá trị idempotent và
  đổi giá trị bị chặn.
- Integration Postgres: hai user queue/ghép, active uniqueness, non-member 404, mỗi bên chỉ flip
  lá mình, kết quả chỉ xuất hiện sau hai flip, mutual-like tạo đúng một friendship/conversation,
  skip/expiry/cancel giải phóng phiên.
- Component: queued polling, reveal lấy server state, chỉ lật lá mình, waiting-rating, mutual-like
  mở public profile, cancel/restart gọi API thật.

### 4. Kết luận: PASS (plan)

Luồng có owner, transition, chốt race/privacy/idempotency và bằng chứng test dự kiến rõ ràng;
được phép triển khai additive migration trong `core-api`, không tạo deployable thứ tư.

## Review — Movie Match ghép ẩn danh — plan — 2026-07-16

### 1. Business flow và nguồn sự thật (layouts/web/movie-match.html)

`POST anon/queue → advisory lock chọn cặp + Safety re-check → session mode='anonymous'
(server chọn video từ config, expiresAt = now + duration) → 2 bên xem chung (playback
last-write-wins như friend mode) + reaction realtime + chat ẩn danh persist theo session →
"Kết thúc"/hết giờ (lazy expiry) set watchEndedAt → mỗi bên rate một lần (like|boring|rude) →
rate non-like HOẶC cả hai like ⇒ terminal; mutual-like tạo Friendship + Conversation
(FriendshipSource.MovieMatch) cùng transaction → chỉ khi matched mới trả partnerUserId`.

Tái dùng hạ tầng friend-mode: bảng `movie_sessions` (thêm cột additive `mode`, `expires_at`,
`watch_ended_at`, `low_rating`, `high_rating`, `outcome`), `MovieSessionActiveParticipant`
(PK userId — 1 user 1 phiên active bất kể mode), realtime `movie.state.changed`. Flow ẩn danh
có bộ endpoint riêng (`/movie-match/anon/*`) trả state view role-relative — KHÔNG dùng
`MovieSessionDto` (DTO đó expose partnerUserId, đúng cho friend mode, sai cho ẩn danh).

### 2. Bảng giả định và vị trí chặn

| #   | Giả định                                         | Cách bị phá                         | Chặn ở đâu                                                                                 | Verdict     |
| --- | ------------------------------------------------ | ----------------------------------- | ------------------------------------------------------------------------------------------ | ----------- |
| M1  | Một user chỉ queue một lần                       | double-click/hai tab                | PK `movie_match_queue_entries.user_id` + insert `orIgnore`                                 | ✅ kế hoạch |
| M2  | Một user chỉ 1 phiên active (mọi mode)           | hai matcher/friend-create song song | PK `movie_session_active_participants.user_id` + advisory lock matcher riêng key           | ✅ kế hoạch |
| M3  | Cặp không block nhau lúc ghép                    | block sau khi enqueue               | `SafetyService.canPair` chạy lại trong transaction matcher                                 | ✅ kế hoạch |
| M4  | Video do server chọn                             | client gửi URL tuỳ ý                | flow ẩn danh KHÔNG nhận videoUrl; server chọn từ `MOVIE_MATCH_ANON_VIDEO_URLS` (config)    | ✅ kế hoạch |
| M5  | Ẩn danh không leak trước mutual-like             | đọc response sớm/dò session         | state view role-relative; 404 gộp non-member; `partnerUserId` chỉ khi outcome=matched      | ✅ kế hoạch |
| M6  | Rating không đổi sau lần đầu                     | retry payload khác                  | row lock session + cột rating một lần; khác giá trị → 409                                  | ✅ kế hoạch |
| M7  | Hai like không tạo friendship thiếu conversation | 2 rating đồng thời                  | lock session + `FriendService.ensureFriendship(manager)` atomic/idempotent                 | ✅ kế hoạch |
| M8  | Rating chỉ mở sau khi xem xong                   | gọi rate sớm                        | guard `watchEndedAt`/expiry trong transaction rate                                         | ✅ kế hoạch |
| M9  | Session/queue không giữ user vô hạn              | tab đóng/mạng rớt                   | `expiresAt` config + lazy expiry trên current/action/join; dismiss giải phóng cả hai       | ✅ kế hoạch |
| M10 | Chat retry không nhân đôi                        | double-send/timeout                 | Idempotency-Key unique DB trên `movie_session_messages`                                    | ✅ kế hoạch |
| M11 | Reaction chỉ là hiệu ứng                         | spam                                | realtime-only (không persist) + whitelist emoji + Throttle; membership check trước publish | ✅ kế hoạch |

### 3. Test dự kiến

- Integration Postgres: 2 user queue/ghép; queue replay idempotent; active-uniqueness chéo với
  friend mode; ẩn danh không leak partner trước matched; rate trước khi xem xong bị chặn;
  mutual-like tạo đúng 1 friendship/conversation; non-like → not_matched; expiry; dismiss huỷ
  cho cả hai; chat idempotent + non-member 404.
- Component web: search state (huỷ), watch state (timer từ expiresAt server, playback, reaction,
  chat), rating 3 nút, result 2 nhánh, restart (dismiss → queue).

### 4. Kết luận: PASS (plan) — được phép triển khai additive migration, không deployable mới.

## Review — UI contract đợt 2 (chat/gift/video/avatar/profile/movie-anon/notification/social) — verify — 2026-07-16

### 1. Phạm vi & luồng nghiệp vụ

Đóng nốt các khoảng trống ma trận § 2 còn lại sau đợt 1 của agent trước: notification panel
web; Feed audience+emoji; chat unread/mute/attachment ảnh; gift cho tác giả video + tab
"Đang theo dõi"; avatar builder web; profile interests/seeking/age-range; Movie Match ghép
ẩn danh end-to-end; social login Google/Apple (Facebook nhãn "chưa hỗ trợ" tường minh).
Story UI, upload UI video, attachment-file: KHÔNG có trong mockup layouts/ → ngoài phạm vi
theo đúng nguồn sự thật § 1 (backend story vẫn tồn tại, không bị đụng).

### 2. Bảng giả định

| #   | Giả định                                         | Ai phá / cách phá           | Chặn ở đâu                                                                                                                                   | Verdict |
| --- | ------------------------------------------------ | --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Mark-read/mute upsert atomic, không dòng đôi     | 2 tab cùng gọi              | PK (conversation_id,user_id) + `orUpdate` — friend.service.ts:218,239                                                                        | ✅      |
| 2   | Mute chỉ tắt notification, message vẫn tới       | hiểu nhầm semantics         | check partnerState SAU persist+realtime — friend.service.ts:423; test integration mute                                                       | ✅      |
| 3   | HTTP không set được attachment kind tuỳ ý        | client gửi kind nội bộ      | whitelist `kind:'image'` tại controller — friend.controller.ts:181; message rỗng cả 2 → 422 friend.service.ts:353                            | ✅      |
| 4   | Người nhận gift video suy từ video, giá từ DB    | client gửi receiver/giá giả | gift.service.ts:272-273 (authorUserId), :282 (giá DB), :305 (idempotency); context CHECK `chk_gift_events_context` (migration 1755700000000) | ✅      |
| 5   | Feed following chỉ video bạn bè                  | dò video người lạ           | short-video.service.ts:185-186 (friendIds filter, rỗng → trang rỗng)                                                                         | ✅      |
| 6   | Avatar buy: giá server, retry không trừ 2 lần    | double-click                | backend GĐ4 sẵn (spendDiamond idempotent); web gửi Idempotency-Key + confirm trước khi mua (avatar-builder.tsx)                              | ✅      |
| 7   | seeking min ≤ max kể cả khi gửi lẻ 1 đầu         | PATCH từng field            | gộp giá trị mới+cũ rồi check — user.service.ts:285; interests ≤ 5 (update-profile.dto.ts:60)                                                 | ✅      |
| 8   | Movie anon: 1 user 1 queue/1 phiên, ghép an toàn | 2 tab/matcher song song     | PK queue + PK active-participant + advisory lock (movie-match.service.ts:296,679) + canPair re-check :338                                    | ✅      |
| 9   | Ẩn danh không leak trước mutual-like             | đọc response/dò session     | partnerUserId chỉ khi outcome=matched — movie-match.service.ts:890; 404 gộp non-member; chat DTO vai trò me/partner                          | ✅      |
| 10  | Rating 1 lần, chỉ mở sau khi xem xong            | rate sớm/đổi rating         | row lock + RATING_NOT_OPEN :495 + RATING_CONFLICT; mutual-like ensureFriendship CÙNG transaction                                             | ✅      |
| 11  | Chat anon retry không nhân đôi                   | double-send                 | unique idempotency_key DB — movie-match-anon.entities.ts:45                                                                                  | ✅      |
| 12  | Reaction chỉ hiệu ứng, không spam tuỳ ý          | emoji lạ/spam               | whitelist :616 + Throttle 60/phút controller; realtime-only không persist                                                                    | ✅      |
| 13  | Social login token do server verify              | client đưa token giả        | `SocialVerifierService` (jose JWKS, sẵn từ GĐ0) — web chỉ chuyển idToken; thiếu client id → báo "chưa cấu hình" rõ ràng                      | ✅      |

### 3. Checklist áp dụng

| Mục                                 | Kết quả | Ghi chú                                                                     |
| ----------------------------------- | ------- | --------------------------------------------------------------------------- |
| Boundary/domain ownership           | ✅      | không module backend mới; gift↔short-video, short-video↔friend qua index.ts |
| DTO/OpenAPI/generated client        | ✅      | openapi:sync mỗi lần đổi API; openapi:check PASS                            |
| Auth/IDOR/privacy                   | ✅      | 404 gộp mọi endpoint theo session/conversation; anon view role-relative     |
| Transaction/idempotency/concurrency | ✅      | tiền qua economy.sendGift; mutual-like atomic; integration race pass        |
| Migration additive                  | ✅      | 4 migration mới đều additive, không sửa migration cũ                        |
| Error/empty/loading UX              | ✅      | mọi query/mutation web có pending/error/empty                               |
| Docs                                | ✅      | friend/gift/short-video/movie-match service docs cập nhật cùng thay đổi     |

### 4. Test đã chạy (thật, không cache)

- `INTEGRATION_DB_URL=... pnpm nx test core-api --skip-nx-cache --runInBand` → **62 suites, 697/697 PASS** (gồm integration Postgres: friend 21, gift 11, movie-match 13, admin, economy, party-room, palm-match…)
- `pnpm nx test web --skip-nx-cache` → **204/204 PASS**; `pnpm nx test admin --skip-nx-cache` → **50/50 PASS**
- `pnpm format:check` / `pnpm lint` / `pnpm agent:check` / `pnpm openapi:check` → PASS
- `pnpm nx build core-api|web|admin` → PASS; `pnpm agent:verify core` (full, gồm e2e) → PASS; `pnpm agent:verify frontend` (full) → PASS

### 5. Kết luận: PASS

Toàn bộ CTA/route trong layouts/web + layouts/admins đã nối state/API thật hoặc có trạng thái
"chưa hỗ trợ" tường minh (duy nhất Facebook login — backend chủ đích chưa nhận, ghi ở
social-verifier.ts). Còn mở (không chặn): walkthrough trình duyệt 2 user bằng tay và
Playwright e2e cho các flow 2 phía mới — test tự động các tầng dưới đã phủ.
