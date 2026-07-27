# Master plan: 6 tính năng Social/Discovery (2026-07-14)

> **Trạng thái: PROPOSAL — chưa phải luật kỹ thuật.** Tài liệu này tổng hợp kết quả nghiên cứu
> (5 luồng: sản phẩm/thị trường + 4 luồng thiết kế kỹ thuật) cho 6 tính năng mới. Khi bắt tay
> code từng phần, bắt buộc chạy `review-module plan` và cập nhật docs canonical (02/06/07 +
> services spec) trong cùng thay đổi. Các quyết định mở ở § 6 phải được con người chốt trước
> khi code phần tương ứng.

6 tính năng: (1) tìm quanh đây kiểu Zalo, (2) video ngắn kiểu TikTok, (3) stories + feed logic
kiểu Facebook, (4) filter duyệt theo giới tính/tuổi/khu vực, (5) streak trò chuyện, (6) mood status.

> **Lăng kính sản phẩm (chốt 2026-07-14, phiên 3):** Litmatch là **dating app** — mục đích là tìm
> bạn/người yêu, mọi tính năng phải rút ngắn đường "thấy người lạ → bắt chuyện → hẹn". KHÔNG xây
> mạng xã hội gắn bó kiểu Facebook (nơi user ở lại với nhau lâu dài). Hệ quả trực tiếp: cắt Feed
> P2/P3/P5 xuống backlog (§ 3.3), đôn Stories (opener) và Nearby lên sớm hơn (§ 4), bổ sung CTA
> "mời Voice/Soul Match" cho discovery (§ 6 phiên 3).

---

## 1. Thứ tự ship — góc nhìn khách hàng trước (kết luận nghiên cứu sản phẩm)

Nguyên tắc: **vá retention trước khi đổ tiền acquisition**; tính năng cần mật độ user ship sau,
theo từng thành phố. Nữ giới là nguồn cung hiếm của dating app (nữ chỉ swipe phải 5–9%) — mọi
quyết định xoay quanh bảo vệ niềm tin của user nữ.

| Đợt | Tính năng                              | Vai trò                                       | Cần critical mass?                         | Độ phức tạp BE           |
| --- | -------------------------------------- | --------------------------------------------- | ------------------------------------------ | ------------------------ |
| 1   | Filter giới tính/tuổi/khu vực (browse) | Chất lượng match, nền cho nearby              | Không                                      | S–M                      |
| 1   | Mood status                            | Icebreaker, mồi bắt chuyện                    | Không                                      | M–H (nghẽn ở moderation) |
| 2   | Streak trò chuyện                      | Retention D7/D30 (bằng chứng mạnh nhất ngành) | Không                                      | M                        |
| 3   | Stories + feed audience (chỉ P1+P4)    | Opener (reply story → chat), profile "sống"   | Trung bình                                 | M (P2/P3/P5 → backlog)   |
| 4   | Tìm quanh đây + CTA mời match          | Acquisition + supply matching                 | **Có** — bật theo thành phố (HCM/HN trước) | L (nặng nhất ở privacy)  |
| 5   | Video ngắn                             | Acquisition/differentiation                   | **Rất cao**                                | Lớn nhất (nhiều đợt)     |

Căn cứ chính (có nguồn trong báo cáo nghiên cứu):

- **Streak**: Snapchat user có streak mở app 3.2x/ngày; Duolingo streak +14% D7. Streak Freeze
  bán bằng diamond → retention mechanic tự trả tiền, móc thẳng economy sẵn có.
- **Nearby là rủi ro tử huyệt**: chính Zalo đã **gỡ bỏ** "Tìm quanh đây" vì spam/lừa đảo/gạ gẫm.
  Safety phải là tính năng ngang hàng, không phải phần phụ. Guard metric: report/1000 tương tác
  nearby + retention nữ ở cohort bật nearby — xấu đi là tắt theo khu vực.
- **Video ngắn có tiền lệ ngành bất lợi nhất**: Snack/Lolly/Feels không breakout; Tinder khai tử
  Moments/Loops/Feed/Face-to-Face. Khuyến nghị: cân nhắc đi đường Momo — video/clip gắn **gift
  economy sẵn có** (highlight party room, tặng diamond) thay vì clone TikTok thuần; đo bằng
  video→match conversion, không phải watch time.
- **Filter**: giới tính = hard filter; tuổi/khu vực = **soft filter** khi pool khu vực mỏng
  (chống "match collapse" ở tỉnh); filter nâng cao để dành gói trả phí.
- **Stories phải phục vụ vòng match** (reply story → chat), không phải feed giải trí độc lập —
  guard metric: % DAU đăng story < 5% sau 8 tuần = tín hiệu Tinder-Moments, cắt lỗ.

**Vòng lặp engagement đích**: Filter/Nearby/Feed tạo supply khám phá → Mood status + Story làm
mồi mở lời (opener cá nhân hoá reply rate ~+30%) → Chat/Voice/Party → Streak giữ chân hằng ngày

- Gift monetize → user gắn bó đăng story/video → nuôi feed → quay lại đầu vòng.

KPI theo dõi: tách theo giới tính (trung bình cộng che mất việc nữ rời đi); mỗi tính năng có
north-star + guard metric riêng (chi tiết trong báo cáo sản phẩm).

---

## 2. Kiến trúc tổng thể — module nào, ở đâu (tuân luật baseline 3 deployable)

| Tính năng              | Vị trí code                                 | Lý do                                                                                                                      |
| ---------------------- | ------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| Nearby + Browse filter | **Module mới `discovery`** trong core-api   | Cùng là "duyệt user chủ động" (pull), cùng tập rule loại trừ; KHÔNG phải mở rộng `matching` (queue 1-1 invariant khác hẳn) |
| Video ngắn             | **Module mới `short-video`** trong core-api | KHÔNG đụng `media-server` (LiveKit SFU realtime ≠ transcode VOD); hạ tầng media chỉ là port                                |
| Stories + Feed FB      | **Mở rộng module `feed` hiện có**           | Feed GĐ4 đã có nền post/reaction/comment/block-filter/cursor; stories là entity riêng nhưng cùng module                    |
| Streak                 | **Trong module `friend`**                   | Streak là state phái sinh từ Message/Conversation mà friend sở hữu; tính on-write trong transaction sendMessage            |
| Mood status            | **Module mới `mood`** trong core-api        | Có state machine moderation + catalog + TTL riêng; không nhét vào `user` (đảo hướng phụ thuộc sai)                         |

Điểm chạm cross-module cần mở public API (không query thẳng bảng module khác):

- `SafetyService.getHiddenUserIds(userId)` (mới) = block 2 chiều ∪ report 2 chiều — discovery dùng.
- `FriendService.listFriendIds(userId)` (mới) — feed audience `friends` dùng.
- `Message.attachment jsonb` (cột trung lập, friend sở hữu) — story reply + video share vào chat dùng.
- Report mở rộng `targetType ('user'|'video')` trong safety — quyết định chốt lúc code W5: video
  report KHÔNG tái dùng trust penalty pipeline (video không có "chủ tài khoản" để trừ điểm), chỉ
  đếm distinct reporter cho `short-video` tự quyết auto-hide. Xem [services/short-video-service.md § 5](../services/short-video-service.md).
- `MoodService.getPublicMood(viewerId, targetId)` — friend/user/matching composition, không sửa `PublicProfileDto`.

---

## 3. Điểm thiết kế chốt theo từng tính năng (tóm tắt — chi tiết ở plan gốc từng luồng)

### 3.1 Discovery: Browse filter + Nearby (module `discovery`)

- Bảng mới `user_locations` (toạ độ **đã quantize ~500m ngay khi ghi** — không lưu toạ độ thô)
  - `discovery_settings` (`nearbyVisible` default **false** — opt-in). **Ghost mode hoãn lại
    (chốt 2026-07-14, § 6) — không scaffold cột `ghostMode` ở MVP**; ẩn/hiện chỉ dựa vào
    reciprocity (chưa opt-in thì không xem được nearby).
- API chỉ trả **distance bucket** (`<1km`, `1–3km`…), không bao giờ trả toạ độ/khoảng cách chính xác.
- Chống trilateration 3 lớp: quantize tại nguồn + jitter deterministic theo cặp-theo-ngày (pattern
  FNV-1a của palm-match) + rate limit cập nhật vị trí và truy vấn nearby.
- Tắt opt-in = xoá `user_locations` cùng transaction. Vị trí quá `DISCOVERY_LOCATION_FRESHNESS_HOURS`
  tự biến mất khỏi kết quả (derive khi đọc, không cron). Cấm log lat/lon (thêm redact list logger).
- Spatial MVP: bounding-box btree + haversine (không cần PostGIS); đường nâng cấp earthdistance/GiST
  không đổi data model. Pagination nearby: snapshot Redis TTL ~120s + hydrate lọc lại hidden lúc đọc.
- Browse: query trên `users` (gender/birthDate/region sẵn có), age = khoảng birth_date derive,
  keyset cursor chuẩn; loại banned/guest/block/report 2 chiều — cùng ngữ nghĩa 404 "không tồn tại".
- Config prefix `DISCOVERY_*` (buckets, radius, jitter, freshness, rate limit… — không hardcode).
- **CTA "mời Voice/Soul Match" từ profile browse/nearby (re-chốt 2026-07-14 phiên 3, làm ở W4):**
  vòng "khám phá → kết nối" không được đứt ở bước xem profile. KHÔNG build friend-request flow
  mới — thêm lối vào **có chủ đích** cho matching sẵn có (directed invite: A mời B → B nhận →
  vào đúng pipeline MatchSession/CallSession hiện hành, cả 2 like → Friendship như cũ). Thiết kế
  chi tiết (invite entity, TTL, decline, rate limit chống spam mời — đặc biệt bảo vệ user nữ)
  chốt khi `review-module plan` ở W4.

### 3.2 Video ngắn (module `short-video`)

- State machine: `uploading → processing → pending_review | published → removed/rejected/failed`;
  mọi transition là conditional UPDATE (thua race = no-op). Sweeper dọn upload treo.
- Upload qua presigned URL — body video không bao giờ chạm NestJS. 2 port: `VideoStoragePort`,
  `VideoTranscodePort` + Dev impl chặn cứng production. Vendor = ADR sau.
- View counting: `video_views` unique (video, viewer); watch-time clamp theo giờ server; qualified
  view transition bằng conditional UPDATE → race không đếm đôi; self-view không đếm.
- Ranking v1: `rankScore` derived qua job, công thức engagement + time-decay, trọng số env
  `VIDEO_RANK_WEIGHT_*`; fallback `sort=recent`. Watch-time per-viewer thu từ v1 → nâng ranker
  sau không đổi schema.
- T&S: report video qua safety (mở rộng target), auto-hide theo ngưỡng reporter distinct,
  moderation queue tái dùng module admin + audit log cùng transaction. `VIDEO_MODERATION_MODE=pre|post`.
- **Cấm video ở phase ẩn danh Soul Match** (phá invariant ẩn danh — ghi vào docs/06 khi implement).
- Dating integration: video trên profile (pin tối đa N) + share vào chat làm icebreaker (V2).

### 3.3 Stories + Feed (mở rộng module `feed`) — scope đã cắt theo lăng kính dating-first

Gap so với FB: audience per-post, reactions đa loại, comment threading, share, edit history, pin,
stories, ranking — feed hiện tại thuần public + chronological + 1 loại tim.

**Cắt scope (chốt 2026-07-14, phiên 3): chỉ làm P1 (audience) + P4 (Stories)** — phần phục vụ
vòng match (đăng story/post cho bạn bè xem → reply → chat). **P2/P3/P5 chuyển backlog vô thời
hạn**: threading/share/edit-history/pin/EdgeRank là cơ chế mạng-xã-hội-gắn-bó kiểu FB, không rút
ngắn đường "thấy → bắt chuyện → hẹn"; Tinder đã khai tử nhóm tính năng tương đương; graph bạn bè
sparse (§ 5.1) khiến feed friends thiếu supply để các cơ chế này có giá trị. Chỉ mở lại khi số
liệu cho thấy user đòi. Thiết kế P2/P3/P5 đã nghiên cứu giữ lại bên dưới để dùng khi đó.

**Scope làm (W3):**

- **P1** audience (`public|friends|only_me`) + profile timeline + idempotency createPost.
- **Stories = entity riêng** (`stories` + `story_views` unique seen-state), audience
  `public|friends`, `expires_at` snapshot lúc tạo. **Hết hạn = filter lúc đọc là nguồn sự thật**;
  sweeper (pattern party-room) chỉ dọn rác. Self-view không đếm. Seen-list chỉ tác giả, lọc block
  hiện tại lúc đọc.
- **Reply story → DM** qua `FriendService.sendMessage` + `attachment` (snapshot media URL vì story
  chết sau 24h, message sống mãi) — đi trọn pipeline idempotency/block/realtime/notification sẵn có.
- Oracle-safe: vi phạm audience/block/hết hạn đều trả cùng 404 với không-tồn-tại.

**Backlog (thiết kế giữ lại, KHÔNG code cho tới khi có quyết định mở lại):**

- P2: reactions 6 loại (unique giữ nguyên, đổi loại = UPDATE) + comment threading 1 cấp
  (reply-của-reply flatten) + comment reactions.
- P3: share (chỉ post public, luôn trỏ post gốc, gốc xoá thì share render null) + edit history
  (`post_edits` append-only snapshot-trước-khi-sửa) + pin (partial unique 1 pin/user).
- P5 ranking: `score = affinity × weight × decay`, read-time trên candidate window, KHÔNG fanout
  (không đụng mục CQRS-Feed GĐ7); pagination "ranked head, chronological tail"; cờ
  `FEED_RANKING_MODE=chrono|edge_rank` bật/tắt không cần deploy. Chronological đủ tốt ở scale
  hiện tại — với dating, feed là nơi phát hiện người để bắt chuyện, không phải nơi giữ chân xem
  content.

### 3.4 Streak trò chuyện (trong module `friend`)

- Entity `conversation_streaks` 1:1 với conversation (current/longest, lastActiveDate mỗi bên,
  `lastConfirmedDate`, `graceUsedForDate` — 1 gap chỉ cứu 1 lần).
- **Chốt: UTC calendar day, server clock** — không dùng timezone local (không có định nghĩa đối
  xứng cho 2 user khác múi giờ + client spoof được tz). FE hiển thị countdown theo giờ local
  (chỉ là format, không phải business logic).
- **Tính on-write** trong transaction `sendMessage` (`SELECT ... FOR UPDATE` trên row streak —
  serialize race 2 bên gửi cùng lúc); cron chỉ gửi cảnh báo "sắp mất" (best-effort, idempotent
  theo `lastWarningSentAt`), **không bao giờ ghi streak**. Read-path derive "đã hết" nếu quá hạn
  mà chưa có message mới (triết lý VIP downgrade).
- Streak đủ điều kiện tăng chỉ khi **cả 2 chiều** nhắn trong cùng ngày UTC (chống "chat rỗng 1 chiều"
  — đúng khuyến nghị sản phẩm). Block chặn sendMessage sẵn → streak tự ngừng, không cần logic riêng.
- Milestone chỉ là hook: realtime event `streak.increased` + notification; **thưởng diamond (nếu
  làm sau) bắt buộc qua LedgerEntry double-entry** — ngoài phạm vi plan này. Streak Freeze mua bằng
  diamond là hạng mục kế tiếp có case kinh doanh mạnh (xem § 1) — khi làm phải thiết kế qua economy.
- Config: `STREAK_GRACE_HOURS`, `STREAK_WARNING_HOURS`, `STREAK_MILESTONE_DAYS` (CSV)…

### 3.5 Mood status (module mới `mood`)

- `mood_presets` catalog data-driven (seed migration, pattern AvatarAsset) + `mood_status_events`
  **append-only** (set/clear = dòng mới; "mood hiện tại" = dòng mới nhất chưa hết hạn/chưa clear/
  đã approve — derive khi đọc). Idempotency-Key bắt buộc trên set.
- TTL config `MOOD_STATUS_TTL_HOURS` (default 24), snapshot vào `expiresAt` lúc set.
- Preset → auto-approve; **free text → PendingReview**. Gap thật: repo **chưa có** hệ moderation
  text — dựng `ModerationPort` (pattern PushPort), MVP = blocklist qua config + admin
  review queue; vendor thật là quyết định mở cần trust-safety chốt trước khi ship free text.
- Hiển thị bằng **composition** (`MoodService.getPublicMood`), không sửa `PublicProfileDto`;
  block ẩn mood 2 chiều; **không đưa mood lên card ẩn danh trước-match** (giữ invariant ẩn danh).
- Khuyến nghị sản phẩm: v1 chỉ preset (né mood gạ gẫm/seeding), free text mở sau khi có moderation;
  cơ chế "ai đang cùng mood quanh đây" (học WeChat Status) là điểm nối tương lai với discovery.

---

## 4. Lộ trình thực thi đề xuất (ghép § 1 sản phẩm × § 3 kỹ thuật)

Mỗi đợt: `review-module plan` trước khi code → test song song → `pnpm agent:check` +
integration test → `openapi:sync` → `review-module verify` → cập nhật docs 02/06/07 + services spec.

Lộ trình đã tái cấu trúc theo lăng kính dating-first (phiên 3): W3 gọn lại còn phần phục vụ vòng
match, Nearby đôn lên W4 (kèm CTA mời match), video thành W5.

| Đợt    | Nội dung                                                                                                                                                                                                                                                                                                                                                   | Ước lượng BE       |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| **W1** | Module `discovery` phần **browse-only** + module `mood` **preset-only**. _HOÀN TẤT 2026-07-14 — cả 2 đã `review-module verify` PASS + commit (d48a161 discovery, mood cùng ngày)._                                                                                                                                                                         | ~4–6 ngày          |
| **W2** | **Streak** trong friend. _HOÀN TẤT 2026-07-14 — review-module verify PASS + commit._                                                                                                                                                                                                                                                                       | ~2–3 ngày          |
| **W3** | **Feed P1** (audience) + **Stories P4** (entity, ring, seen, reply→DM). _HOÀN TẤT 2026-07-14 — review-module verify PASS + commit._                                                                                                                                                                                                                        | ~5–6 ngày          |
| **W4** | **Nearby** (location + quantize/jitter + nearby endpoint + safety guard) + **CTA "mời Voice/Soul Match"** trên profile browse/nearby (§ 3.1). _HOÀN TẤT 2026-07-14 — review-module verify PASS + commit; Voice invite KHÔNG tạo Friendship (giữ đúng scope code hiện tại, sửa gap tài liệu docs/02), rate-limit mời đối xứng không phân biệt giới tính._   | ~5–7 ngày          |
| **W5** | **Video ngắn V1** hướng Momo (lifecycle + Dev ports + like/comment + view counting + report/admin). _HOÀN TẤT 2026-07-14 — review-module verify PASS + commit; scope thu hẹp thêm 1 lần nữa (hỏi lại user): bỏ profile/party-room integration khỏi V1 (đôn sang "Sau"), chỉ giữ nền tảng video cốt lõi để giảm rủi ro đụng 3 module cùng lúc trong 1 đợt._ | ~2–3 tuần          |
| Sau    | **Feed P2/P3/P5 (chỉ mở lại khi số liệu đòi)**, mood free-text (sau khi chốt moderation), video V2/V3 (**pin-profile, share-vào-chat icebreaker**, vendor ADR, auto-scan), streak freeze qua economy, `feed_affinity` incremental                                                                                                                          | theo quyết định mở |

Frontend track đi song song theo từng đợt (màn hình browse/filter, mood picker, streak badge +
hourglass, story ring/viewer, nearby map-less list, video player) — frontend không chứa business
logic (docs/12).

---

## 5. Rủi ro xuyên suốt

1. **Graph bạn bè sparse** (bạn chỉ đến từ match) → audience `friends` của stories/feed và
   streak đều phụ thuộc số lượng friendship. Mitigation chính đã chốt (phiên 3): CTA "mời
   Voice/Soul Match" từ discovery (§ 3.1, W4) — mời match có chủ đích → nhiều match hơn →
   nhiều friendship hơn → supply cho stories/streak. Theo dõi số liệu friendship sau W4; nếu
   vẫn thiếu, friend-request flow là quyết định riêng sau.
2. **Moderation debt**: mood free-text, video UGC, stories media đều cần moderation; repo hiện
   chưa có nền text/media moderation. Age gate trong bản plan cũ đã bị quyết định sản phẩm
   2026-07-24 thay thế; hướng hiện tại là report/moderation không chặn core flow theo tuổi.
3. **Nearby safety**: mọi mitigation (quantize/jitter/bucket) giảm mạnh nhưng không triệt tiêu
   trilateration bởi attacker kiên nhẫn — ghi rõ trong docs/06 là mitigation, không phải guarantee;
   kèm guard metric tắt theo khu vực.
4. **Counter mới nhiều nơi** (share/reply/reaction/view) — mọi increment phải cùng transaction
   với dòng nguồn (pattern feed sẵn có); cân nhắc job đối soát read-only kiểu Economy sau.
5. **Hot-row** `viewCount`/`totalWatchMs` video viral — chấp nhận v1, bucket hoá khi có số liệu.

---

## 6. Quyết định mở — đã chốt / còn mở (cập nhật 2026-07-14)

**Đã chốt (user quyết định 2026-07-14):**

1. ~~**CTA sau khi thấy user trong browse/nearby: (a) chỉ xem profile — MVP.**~~ **ĐÃ THAY THẾ
   bởi phiên 3 mục 1 bên dưới.** Bản browse-only đã code vẫn đúng scope "chỉ xem profile" — CTA
   mời match là hạng mục bổ sung ở W4, không sửa lại cái đã làm.
2. **Card discovery hiện tuổi dạng `ageBucket`** (mở rộng `PublicProfileDto`) — chốt: có.
3. **Report ẩn khỏi discovery vĩnh viễn** (không theo cooldown 30 ngày như matching) — chốt.
4. **Reciprocity "muốn thấy phải cho thấy"** (chưa opt-in `nearbyVisible` thì không xem được
   nearby) — chốt: có.
5. **Ghost mode: HOÃN lại, không làm ở W5.** `discovery_settings.ghostMode` **không scaffold ở
   MVP** — bỏ khỏi entity `DiscoverySetting` cho tới khi có quyết định làm; nearby dùng thuần
   reciprocity (mục 4) làm cơ chế ẩn/hiện duy nhất. Khi cần làm lại, đọc lại đề xuất gốc ở luồng
   nghiên cứu discovery (VIP-gate qua config `DISCOVERY_GHOST_MODE_VIP_ONLY`) — không thiết kế
   lại từ đầu, chỉ bổ sung cột + gate khi đó.

**Đã chốt thêm (2026-07-14, phiên 2 — rẻ/đảo ngược được qua config, không cam kết chi phí bên thứ 3):**

1. **Ring stories: chỉ bạn bè + mình.** Đúng model FB (friend-based), khớp graph bạn bè hiện có;
   mở rộng thêm public người lạ sau chỉ là đổi điều kiện query, không đổi schema.
2. **Edit history: chỉ tác giả xem** (không công khai như FB). Mở công khai sau là bỏ 1 check quyền.
3. **Video: đi hướng Momo — gắn gift economy** (highlight profile/party-room, tặng diamond),
   KHÔNG clone TikTok feed toàn cục thuần. Ảnh hưởng scope kỹ thuật V1 của module `short-video`
   (feed ranked hẹp lại thành profile/party-room integration là trọng tâm, không phải feed
   toàn cục cạnh tranh trực tiếp TikTok) — chốt sớm để tránh thiết kế sai hướng ở W6.
4. **`VIDEO_MODERATION_MODE` mặc định `pre`** (duyệt trước khi public) — dating app VN + tiền sử
   an toàn của Litmatch thật; chuyển `post` sau khi có số liệu ổn định chỉ là đổi config.

**Đã chốt thêm (2026-07-14, phiên 3 — lăng kính dating-first, user duyệt đề xuất review):**

1. **CTA discovery: bổ sung nút "mời Voice/Soul Match" trên profile browse/nearby** (thay quyết
   định phiên 1 mục 1). Tái dùng matching engine sẵn có làm lối vào có chủ đích — KHÔNG build
   friend-request flow mới. Làm ở **W4 cùng đợt Nearby** (nearby không có CTA là dead-end với
   dating app). Chi tiết kỹ thuật § 3.1; đây cũng là mitigation chính cho rủi ro § 5.1.
2. **Cắt Feed P2 (reactions đa loại + threading), P3 (share/edit history/pin), P5 (EdgeRank)
   xuống backlog vô thời hạn** — cơ chế mạng-xã-hội-gắn-bó không phục vụ mục đích dating; chỉ
   mở lại khi số liệu cho thấy user đòi. W3 gọn lại còn **Feed P1 + Stories P4** (opener phục
   vụ vòng match). Lộ trình tái cấu trúc: Nearby → W4, Video → W5 (§ 4).

**Còn mở — cần bạn duyệt khi tới đúng lúc (cam kết chi phí/gửi dữ liệu bên thứ 3, không tự chốt):**

1. **Vendor moderation text/media** (mood free-text + video UGC). Hướng kỹ thuật đã chốt: MVP dùng
   blocklist config + admin review queue (không tốn tiền, đủ cho mood v1); vendor trả phí (vd
   OpenAI Moderation endpoint — ứng viên rẻ/nhanh nhất nếu cần) chỉ xét khi blocklist không đủ tải.
   Hỏi lại đúng lúc cần (mood free-text hoặc video V1), không chặn W1–W4.
2. **Vendor media storage/transcode** (video). Hướng kỹ thuật đã chốt: ưu tiên 1 vendor gộp
   (Cloudflare Stream/Mux — ít glue code, ra mắt nhanh) hơn tự ráp S3+transcoder riêng ở giai đoạn
   đầu; đổi sang tự ráp khi scale đủ lớn để tối ưu chi phí là quyết định ADR riêng. Hỏi cụ thể kèm
   bảng giá khi vào W5.

**Không chặn (default hợp lý, chốt sau bằng config):** ngưỡng số cụ thể (`STREAK_GRACE_HOURS`,
`MOOD_STATUS_TTL_HOURS`, buckets khoảng cách, trọng số ranking…) — tất cả đã là env config.

**W1–W4 giờ không còn quyết định mở nào chặn** — chỉ W5 (video) còn 2 câu hỏi vendor cần hỏi lại
đúng lúc. Browse-only (W1) đã code xong 2026-07-14 (chờ verify + commit); việc kế tiếp theo lộ
trình: mood preset-only (phần còn lại của W1) → streak (W2).
