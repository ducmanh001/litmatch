# Short-video Service (module trong `core-api`) — đặc tả V1

> W5 của [docs/plans/2026-07-14-plan-6-tinh-nang-social-discovery.md](../plans/2026-07-14-plan-6-tinh-nang-social-discovery.md)
> ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/short-video`.
>
> **Scope V1 đã chốt (2026-07-14, thu hẹp có chủ đích so với roadmap gốc):** lifecycle upload +
> view + like/comment + report/admin moderation + ranking v1. **KHÔNG làm pin-trên-profile / chia
> sẻ vào chat làm icebreaker ở đợt này** — đôn sang đợt sau khi nền tảng video đã ổn định (tránh
> đụng chạm cùng lúc vào `user`/`friend` module lẫn nền tảng video hoàn toàn mới, chưa có tiền lệ
> production nào để dựa vào). Hướng Momo (gắn gift economy) — KHÔNG phải feed toàn cục cạnh tranh
> trực tiếp TikTok.

## 1. State machine `Video`

```text
uploading ──(finalizeUpload)──▶ processing ──(transcode xong)──▶ pending_review (mode=pre)
    │                               │                                   │
    │ (sweeper: quá                 │ (transcode lỗi)                   ├──(admin approve)──▶ published
    │  VIDEO_UPLOAD_TIMEOUT_SECONDS)│                                   └──(admin reject)───▶ rejected
    ▼                               ▼
  failed                          failed                          processing ──(mode=post)──▶ published

published ──(report vượt ngưỡng HOẶC admin gỡ thủ công)──▶ removed
```

Mọi transition thi hành bằng **1 câu `UPDATE ... WHERE status = 'từ'`** (conditional UPDATE, thua
race = 0 rows = no-op) — **KHÔNG** dùng `SELECT ... FOR UPDATE` như `MatchTicket`. Video không
tranh chấp gay gắt như matching ticket (không có 2 phía cùng ghép 1 lúc), nên pessimistic lock là
thừa; conditional UPDATE đủ an toàn và đơn giản hơn nhiều — cùng pattern
`TicketSweeperService`/`InviteSweeperService` đã dùng cho các sweeper trước đó.

## 2. Upload — presigned URL, body video không chạm NestJS

- `POST /videos/upload-intent` (Idempotency-Key bắt buộc): tạo `Video{status: uploading}` +
  `VideoStoragePort.issueUploadUrl(storageKey)`. `storageKey` sinh TRƯỚC (pure,
  `generateStorageKey`), tách khỏi bước có I/O (`issueUploadUrl`) — cho phép replay idempotent
  reissue ĐÚNG URL cho storageKey đã tạo, không phải bịa storageKey mới không ai đọc.
- `POST /videos/:id/finalize`: client báo đã upload xong lên storage → `uploading→processing` →
  gọi `VideoTranscodePort.transcode()` → `processing→pending_review|published` tuỳ
  `VIDEO_MODERATION_MODE`. Dev port đồng bộ (trả kết quả ngay) nên toàn bộ chuỗi chạy trong 1 lần
  gọi — vendor thật (Cloudflare Stream/Mux, ADR sau) là bất đồng bộ (webhook), sẽ tách bước
  transcode thành handler webhook riêng mà KHÔNG đổi state machine.
- 2 port `VideoStoragePort`/`VideoTranscodePort` + `Dev*Provider`. Khi
  `VIDEO_UPLOAD_ENABLED=false`, service chặn create/finalize trước DB/storage side effect và
  production được boot với capability tắt. Nếu flag bật dưới `NODE_ENV=production`, dev provider
  fail-fast lúc bootstrap; mỗi method port cũng tự chặn phòng bypass — cùng pattern
  `DevSmsProvider`/`DevIapVerifier`. Vendor thật là quyết định ADR riêng (đã hỏi lại người dùng 2026-07-14: ưu
  tiên vendor gộp Cloudflare Stream/Mux hơn tự ráp S3+transcoder).

## 3. View counting — chống đếm đôi, self-view không tính

`video_views` unique `(video_id, viewer_id)` — cùng pattern `story_views`. `qualified` (đã xem đủ
`VIDEO_QUALIFIED_VIEW_MIN_MS`) chỉ chuyển `false→true` **đúng 1 lần**, `Video.viewCount` cộng
ATOMIC đúng lúc đó (cùng transaction với update `VideoView.qualified`) — các lần cập nhật
watch-time sau (video xem tiếp) không cộng lại. Self-view (tác giả tự xem video mình) không bao
giờ ghi `VideoView`.

## 3b. Feed "Đang theo dõi" (video.html)

`GET /videos?feed=following` chỉ trả video published của **bạn bè** caller
(`FriendService.listFriendIds` — graph bạn là nguồn follow duy nhất hiện có, KHÔNG có bảng
follow riêng). Chưa có bạn nào → trang rỗng ngay, không query videos. Mặc định
`feed=for_you` = mọi video published (hành vi cũ, không đổi). Tặng quà cho tác giả video: xem
[gift-service.md § 3](./gift-service.md).

## 3c. Tác giả trong response video/comment

Mỗi `VideoDto` và `VideoCommentDto` trả thêm `author: PublicProfileDto` (`id`, nickname, avatar,
gender, interests) bên cạnh `authorUserId`. Controller batch-load tác giả theo một trang qua User
module để web không gọi riêng `GET /users/:id` cho từng video/comment. DTO chỉ dùng dữ liệu profile
đã công khai, không lộ ngày sinh, region, seeking preference, status hay trust score.

## 4. Ranking v1 — derived, có fallback

`rankScore = (viewCount·W_view + likeCount·W_like + commentCount·W_comment) / (1 +
giờ_kể_từ_tạo/VIDEO_RANK_TIME_DECAY_HOURS)`, tính lại toàn bộ video `published` mỗi tick
(`VideoRankingService`, đơn giản cho quy mô V1 — nâng cấp thành incremental/watch-time-weighted
sau không đổi schema, `rankScore` vẫn 1 cột `double precision`). `rankScore IS NULL` (video mới,
job chưa kịp chạy) → `listPublished` fallback `sort=recent`. Job derive, KHÔNG phải nguồn sự
thật — lỗi job không làm sai correctness, chỉ tạm thời không có ranking mới.

## 5. Report + moderation — mở rộng `Report` của Safety, KHÔNG đụng trust score cá nhân

`Report` (Safety module) thêm `targetType ('user'|'video', mặc định 'user')` +
`targetVideoId (nullable)` — **hành vi report-user cũ giữ nguyên 100%** (đã chạy lại toàn bộ 12
integration suite dùng chung migration `Safety1752800000000` để xác nhận, không chỉ suy đoán).
`SafetyService.reportVideo()` là method RIÊNG, KHÔNG gọi `adjustTrustScore` (video không có "chủ
tài khoản" để trừ điểm vì bị report nội dung, khác report-user). Unique
`(reporter_user_id, target_video_id) WHERE target_type='video'` chặn 1 người report lặp lại cùng
video nhiều lần.

`short-video` tự validate video tồn tại TRƯỚC khi gọi Safety (Safety trung lập, không biết bảng
`videos` — không có FK cross-module). Vượt `VIDEO_REPORT_AUTOHIDE_THRESHOLD` distinct reporter →
tự động `published→removed` (`ShortVideoService.autoHideIfPublished`, conditional UPDATE,
idempotent). Admin có thêm `GET /admin/videos/pending` (`VIDEO_MODERATION_MODE=pre`) +
`POST /admin/videos/:id/approve|reject|remove` — atomic với audit log trong CÙNG transaction
(cùng pattern `AdminService.banUser`).

**Cảnh báo kỹ thuật đã bắt qua test thật**: `SafetyService.reportVideo()` insert Report rồi (nếu
unique violation) đọc lại — 2 bước này **KHÔNG được bọc trong 1 `dataSource.transaction` explicit**
nếu bước đọc lại chỉ chạy khi bước insert đã LỖI: Postgres abort toàn bộ transaction ngay khi 1
statement lỗi, câu SELECT sau đó nhận `"current transaction is aborted"` thay vì trả về dữ liệu.
Khác `SafetyService.report()` (insert + trừ trust score) THẬT SỰ cần transaction vì có 2 side-effect
phải atomic cùng nhau — `reportVideo()` không có side-effect thứ 2 nên không cần transaction.

## 6. Cấm video ở phase ẩn danh Soul Match

Cùng bất biến với Mood (docs/06): Video KHÔNG được wire vào bất kỳ DTO/luồng nào của Soul Match
trước khi cả 2 `like` — giữ tinh thần "ẩn danh tới khi unlock".

## 7. Config

`VIDEO_CAPTION_MAX_LENGTH`, `VIDEO_MODERATION_MODE` (`pre`|`post`, mặc định `pre` — dating app
VN + tiền sử an toàn của Litmatch thật), `VIDEO_QUALIFIED_VIEW_MIN_MS`,
`VIDEO_UPLOAD_TIMEOUT_SECONDS`, `VIDEO_SWEEPER_INTERVAL_MS`, `VIDEO_REPORT_AUTOHIDE_THRESHOLD`,
`VIDEO_RANK_WEIGHT_VIEW/LIKE/COMMENT`, `VIDEO_RANK_TIME_DECAY_HOURS`,
`VIDEO_RANKING_JOB_INTERVAL_MS`.

## 8. Ngoài scope V1 (đã chốt, không phải thiếu sót)

- Pin video trên profile (tối đa N) — đôn sang đợt sau.
- Share video vào chat làm icebreaker (`Message.attachment`, cùng pattern Stories reply) — đôn
  sang đợt sau.
- Highlight video trong Party Room.
- Vendor moderation trả phí cho nội dung video (OpenAI Moderation hoặc tương đương) — V1 dùng
  blocklist + admin review queue (không tốn chi phí bên thứ 3); xét vendor khi có số liệu tải
  thật vượt khả năng blocklist.
- Vendor storage/transcode thật (Cloudflare Stream/Mux) — V1 chỉ có Dev port; tích hợp vendor là
  ADR riêng kèm bảng giá cụ thể.
