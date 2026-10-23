# 0014. Vòng đời dữ liệu và mô hình tăng trưởng theo năm

- **Ngày**: 2026-10-19
- **Trạng thái**: Accepted (cơ chế đã làm). Mọi mục đánh dấu **CẦN QUYẾT ĐỊNH** mặc định TẮT trong mã (số ngày `0`) hoặc chưa có cơ chế
- **Liên quan**: [ADR 0013](./0013-scale-readiness-policies.md),
  docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 7a / § 9,
  `pnpm capacity:row-sizes`, `pnpm capacity:data`, `scripts/capacity/row-sizes.json`

## Bối cảnh

Các cải tiến C1–C18 giảm số truy vấn, số lần ghi và tranh chấp, nhưng không quản lý **dữ liệu tích lũy nhiều năm**. Câu hỏi là:
với 10 triệu người dùng đồng thời, Postgres lớn lên bao nhiêu mỗi năm, bảng nào quyết định chi phí, và cái gì phải xoá, giữ,
hay lưu trữ lạnh. Trước đây chỉ có `bytesPerMessageRow: 400` (giả định) trong mô hình tải; không có số đo kích thước hàng.

## Số đo và mô hình

- **Byte/hàng ĐO** (`pnpm capacity:row-sizes`): tạo DB tạm từ schema đã migrate ĐẦY ĐỦ (index và ràng buộc thật, gồm migration
  `1758800000000`), nạp 200.000 hàng tổng hợp mỗi bảng, `VACUUM`, đọc `pg_relation_size` + `pg_indexes_size`. Postgres 16.15, đo 2026-10-19.
  Ví dụ: `refresh_tokens` 434 byte (heap 174 + index 260, 5 index), `messages` 466, `match_tickets` 507, `notifications` 415,
  `transactions` 603, `ledger_entries` 234, `video_views` 225. **Index thường lớn hơn heap** — idempotency key và hash 64 ký tự
  nằm trong các index UNIQUE (126–138 byte mỗi hàng). B-tree thời gian của migration `1758800000000` thêm ≈ 21 byte/hàng
  (`refresh_tokens` 413 → 434, `video_views` 203 → 225, `phone_otps` 240 → 261, `mood_status_events` 314 → 338; các bảng khác lệch ≤ 7 byte giữa hai lần đo: `match_daily_quotas` +7 do B-tree mới, còn lại là nhiễu của phép đo).
- **Số hàng/ngày** (`pnpm capacity:data`): suy từ đề bài (10 triệu CCU, 10.000 người chat, 10 triệu lượt ghép/ngày) và các giả định hành vi
  ghi rõ trong `SCENARIO` (DAU ≈ 48 triệu, mỗi người mở app 1,5 giờ/ngày, access token 15 phút, một họ refresh token sống 30 ngày...).
  **Đây là giả định**: thay bằng `pg_stat_user_tables.n_tup_ins` của hệ thống thật trước khi dùng để mua đĩa. Mọi knob của `SCENARIO` đều
  có test chứng minh nó làm đổi kết quả (không có tham số chết).
- **Hai loại số, đừng so lẫn**: _tăng trưởng mỗi năm_ (flow, TB/năm) và _dung lượng bảng tại năm N_ (stock, TB sau N năm). Báo cáo
  tách các cột vòng đời: **không dọn**; **mặc định** (cái mã làm khi `RETENTION_MODE=delete` và KHÔNG đổi biến nào, gồm cả backlog khi
  công suất xoá mặc định nhỏ hơn hàng vào); **mặc định + `RETENTION_*` đã tăng đủ** (cùng vòng đời, job xoá theo kịp); **khuyến nghị**
  (chấp nhận MỌI mục CẦN QUYẾT ĐỊNH, giả định `RETENTION_*` đã tăng đủ). TB = 2^40 byte.

Kết quả mặc định (chưa gồm WAL, replica, backup, bloat, ảnh/video), 3 năm:

| Bảng                                          | Hàng/ngày             | TB/năm (không dọn) | Giữ (ngày): mặc định → khuyến nghị      | TB sau 3 năm: mặc định (RETENTION_* mặc định) | TB sau 3 năm: khuyến nghị (RETENTION_* đã tăng) |
| --------------------------------------------- | --------------------- | ------------------ | --------------------------------------- | --------------------------------------------- | ----------------------------------------------- |
| `refresh_tokens`                              | 290 triệu             | **41,7**           | 37 (TTL 30 + 7) → ≈ 14 **[QUYẾT ĐỊNH]** | 4,2                                           | 1,6                                             |
| `video_views`                                 | 144 triệu             | 10,8               | ∞ → 180 **[QUYẾT ĐỊNH]**                | 32,3                                          | 5,3                                             |
| `messages` (chat bạn bè)                      | 43 triệu              | 6,7                | ∞ → 180 + archive **[QUYẾT ĐỊNH]**      | 20,1                                          | 3,3                                             |
| `story_views`                                 | 96 triệu              | 6,1                | 2 (sweeper, cascade theo story)         | 0,03                                          | 0,03                                            |
| `soul_chat_messages`                          | 43 triệu              | 5,4                | ∞ → 90 **[QUYẾT ĐỊNH]**                 | 16,2                                          | 1,3                                             |
| `notifications`                               | 32 triệu              | 4,4                | ≈ 200 (đọc 90 / chưa đọc 365, C10)      | 2,4                                           | 2,4                                             |
| `match_tickets` / `match_sessions`            | 24 / 10 triệu         | 4,0 / 0,8          | ∞ → 30 / 90 **[QUYẾT ĐỊNH, phân vùng]** | 12,1 / 2,5                                    | 0,3 / 0,2                                       |
| `outbox_events` (relay tắt ở mọi profile)     | 4,8 triệu             | 0,7                | ∞ → 7 **[QUYẾT ĐỊNH]**                  | 2,1                                           | 0,01                                            |
| `reactions`, `transactions`, `ledger_entries` | 36 / 4,8 / 10,6 triệu | 2,3 / 1,0 / 0,8    | ∞ (trạng thái / sổ cái append-only)     | 7,0 / 2,9 / 2,5                               | 7,0 / 2,9 / 2,5                                 |
| **Tổng (cả 25 bảng)**                         |                       | **89,1**           |                                         | **113,9** (còn +35,8/năm)                     | **30,8** (còn +5,2/năm)                         |

Không dọn gì: 89,1 TB/năm → **267,4 TB sau 3 năm**. Với vòng đời mặc định của mã và `RETENTION_*` mặc định (60 lô × 5.000 = 432 triệu hàng/ngày/quy tắc, `refresh_tokens` vào 290 triệu/ngày = 0,67×): **113,9 TB** sau 3 năm.
Với mặc định CŨ (20 lô = 144 triệu/ngày, 2,0×) con số là ≈ 175 TB vì ≈ 61 TB là backlog của `refresh_tokens` (≈ 21 TB/năm) — đó là lý do đã nâng mặc định lên 60. VẪN tăng ≈ 36 TB/năm vì các mục CẦN QUYẾT ĐỊNH chưa bật. Chấp nhận mọi khuyến nghị: 30,8 TB sau 3 năm và còn tăng ≈ 5 TB/năm (sổ cái, lượt thích, bình luận,
`gift_events` — phần "giữ vĩnh viễn", cần kế hoạch archive riêng, không xoá).

Ba phát hiện đổi thứ tự ưu tiên:

1. **`refresh_tokens` là bảng tăng nhanh nhất** (47% tổng tăng trưởng) và cũng là tải GHI lớn nhất của auth: mỗi lần xoay token (≈ mỗi
   15 phút khi đang mở app) là một INSERT + một UPDATE trên bảng có 5 index (khoá chính, hash UNIQUE, user, họ, `expires_at`),
   ≈ 3.350 hàng/giây trung bình ở quy mô đề bài (≈ 3.330 lần xoay + ≈ 19 đăng nhập mới). Trước ADR này không hàng nào bị xoá.
   Mặc định của mã giữ MỌI hàng đủ `TTL + GRACE` = 37 ngày (≈ 4,2 TB ở trạng thái ổn định NẾU job xoá theo kịp; ở `RETENTION_*` mặc định
   với mặc định cũ 20 lô job chỉ xoá được 144 triệu hàng/ngày nên bảng không bao giờ ổn định; mặc định mới 60 lô xoá được 432 triệu/ngày); chỉ khi chấp nhận
   dọn-lúc-xoay (mục bên dưới) mới xuống ≈ 1,6 TB, và con số đó phụ thuộc họ token sống bao lâu.
2. Chat không phải bảng lớn nhất: với đề bài (10.000 người chat, ~86 triệu tin/ngày chia đôi chat bạn bè / ẩn danh) `messages` + `soul_chat_messages` ≈ 12 TB/năm.
3. **`outbox_events` tăng vô hạn khi relay tắt** — relay tắt ở MỌI profile (env mặc định, K8s, compose production, hosted-free): sự kiện không
   bao giờ được publish nên không bao giờ đủ điều kiện xoá.

## Quyết định

1. **Mọi bảng tăng theo hoạt động phải có vòng đời ghi rõ** (bảng trên, và `tableDefinitions` trong `data-growth.mjs`). Sổ cái
   (`transactions`, `ledger_entries`), `gift_events`, `admin_audit_logs` và nội dung người dùng đang hiển thị **không bao giờ bị xoá để giảm dung lượng**.
   Điều này được ép bằng cấu trúc, không chỉ bằng tin vào từng job: `buildDeleteSql`/`buildCountSql` ném lỗi với mọi quy tắc trỏ vào
   `transactions`, `ledger_entries`, `ledger_accounts`, `wallets`, `iap_receipts`, `payos_payment_orders`, `gift_events`, `admin_audit_logs`
   (kể cả ở chế độ dry-run), và quy tắc chọn theo `ctid` luôn kèm `tableoid` (ctid chỉ định danh hàng trong MỘT bảng con, nên bảng
   phân vùng sẽ xoá nhầm nếu thiếu).
2. **Cơ chế theo khối lượng ghi**:
   - Bảng ≤ vài trăm hàng/giây xoá: retention theo lô của `common/retention` (đã có), mỗi module một job. Đã làm ở lô này:
     `refresh_tokens` (theo `expires_at`, không theo `created_at`, để hạ `AUTH_REFRESH_TTL_DAYS` không xoá nhầm token còn hạn), `phone_otps`,
     `match_daily_quotas`, `guest_match_quotas`, `outbox_events` (đã publish; dead-letter mặc định giữ vì cần người xử lý), `video_views`
     (mặc định TẮT), `video_comments` đã xoá mềm, `mood_status_events` (hạn giữ không bao giờ ngắn hơn `MOOD_STATUS_TTL_HOURS`; không xoá `set` còn hạn và không xoá sự kiện đang che một `set` còn hạn cũ hơn, vì xoá nó làm mood cũ hiện lại), kèm story
     sweeper xoá hết backlog trong ngân sách mỗi tick (trước đây tối đa 500 story/giờ).
   - Bảng có token xoay: **dọn cơ hội lúc ghi** (mặc định TẮT, xem "Đánh đổi bảo mật" bên dưới) — mỗi lần xoay xoá token ĐÃ XOAY cũ hơn
     `AUTH_REFRESH_ROTATED_RETENTION_DAYS` của CÙNG họ (dùng `idx_refresh_tokens_family_id`, không index mới, `FOR UPDATE SKIP LOCKED`
     để không bao giờ chờ khoá hàng — nếu chờ sẽ tạo vòng chờ với `revokeFamily`/`revokeForUser`).
   - Bảng ≥ vài nghìn hàng/giây xoá (`video_views`, `story_views`, về sau `messages`, `match_*`): xoá từng hàng vẫn chạy được
     (đo lại được bằng `scripts/capacity/bench/retention-delete.mjs`: ≈ 184.500 hàng/giây một kết nối trong cache — một lần đo trước đó ra ≈ 39.800 — và 288 byte WAL/hàng) nhưng tạo dead tuple và việc vacuum; hướng đích là **phân vùng theo thời gian rồi `DROP`/detach** partition hết hạn.
3. **Chọn index theo cách bảng bị xoá**: B-tree trên cột thời gian cho mọi bảng bị retention xoá (`refresh_tokens.expires_at`,
   `phone_otps/video_views/mood_status_events.created_at`, `*_quotas.quota_date`); B-tree một phần khi hàng chỉ đủ điều kiện sau một UPDATE
   (`published_at`, `dead_lettered_at`, `deleted_at`) — hàng chưa đủ điều kiện không tốn gì ở index lúc INSERT. **BRIN chỉ cho bảng
   append-only không bao giờ xoá** (`transactions.created_at`, phục vụ đối soát sổ cái). Lý do (migration `1758800000000` thay sáu BRIN của
   `1758500000000` bằng năm B-tree; `guest_match_quotas` không cần index mới vì khoá chính `(quota_date, key_hash)` đã dẫn đầu bằng `quota_date`): BRIN chỉ chọn lọc khi vị trí vật lý tương quan với thời gian, và retention tự phá điều đó — VACUUM trả
   trang đầu bảng cho free-space map, hàng mới lấp vào, còn summary của BRIN chỉ nở ra, không bao giờ co lại. **ĐO** (`scripts/capacity/bench/brin-churn.mjs`: 3 triệu hàng
   `refresh_tokens`, 4 vòng xoá 20% cũ nhất rồi chèn lại, kích thước bảng không đổi 499 MB): chọn lô 5.000 hàng bằng BRIN ≈ 430–540 ms và đọc ≈ 51.000 buffer
   (Seq Scan hoặc Bitmap Index Scan); B-tree ≈ 0,6 ms / 124 buffer (≈ 3,3 ms khi kèm `FOR UPDATE SKIP LOCKED`). Con số "1,7 ms" trước đây của BRIN chỉ đúng trên bảng
   MỚI nạp, chưa từng bị xoá-rồi-chèn-lại, nên không dùng. **Không** thêm index lên cột bị UPDATE nóng (vd `refresh_tokens.rotated_at`,
   `wallets.updated_at`): làm UPDATE mất HOT và ghi thêm vào mọi index. Các cột đã chọn (`created_at`, `expires_at`, `quota_date`) không bao giờ
   bị UPDATE nên B-tree không làm mất khả năng HOT của các UPDATE hiện có — nhưng đó là suy luận từ mã: **chưa đo `n_tup_hot_upd`** và
   migration không đặt `fillfactor`, nên coi là chưa chứng minh.
4. **Một công tắc, mặc định an toàn**: `RETENTION_MODE=off` trong mã; profile triển khai đặt `dry-run` (chỉ đếm, gauge
   `retention_eligible_rows{rule}`). Đổi sang `delete` bật CÙNG LÚC mọi quy tắc có số ngày > 0 — không có công tắc riêng từng job; muốn
   hoãn một quy tắc thì đặt số ngày của nó về `0` trước. Vì vậy mọi mục CẦN QUYẾT ĐỊNH mặc định `0`: `VIDEO_VIEW_RETENTION_DAYS`,
   `AUTH_REFRESH_ROTATED_RETENTION_DAYS`, `OUTBOX_DEAD_LETTER_RETENTION_DAYS`. Story sweeper không chịu `RETENTION_MODE`. Các job
   retention bắt đầu lệch nhau một khoảng tất định theo hash của tên job (0 – 1 chu kỳ) để sáu job singleton ít khi chiếm kết nối cùng
   lúc (mỗi job giữ 1 kết nối cho advisory lock + 1 cho task; xem `k8s/README.md` § Ngân sách kết nối). Đây là GIẢM XÁC SUẤT, không loại trừ:
   ở chu kỳ 60 giây các độ lệch là 4 / 33 / 48 / 51 / 54 / 54 giây (bốn job trong vòng 6 giây). Chốt chặn thật là ngân sách đồng thời dùng chung
   `RETENTION_MAX_CONCURRENT_JOBS` (mặc định 2): tick thứ ba chạy chồng bị bỏ, nên dù mỗi tick dùng hết ngân sách 30 giây retention cũng chỉ giữ ≤ 4 kết nối pool. Lần chạy đầu của mỗi job đến sau
   `độ lệch + 1 chu kỳ`.
5. **Công suất xoá phải cấu hình theo tải**:
   - Job retention: mặc định 5.000 hàng × 60 lô / 60 giây = 5.000 hàng/giây (432 triệu/ngày) mỗi quy tắc — nhu cầu `refresh_tokens` ~3.350/giây (0,67×) và `video_views` ~1.670/giây (0,33×) ở quy mô đề bài, còn biên nhưng chưa tới 2× của giờ cao điểm cho `refresh_tokens`. Mặc định CŨ 20 lô (1.667/giây) không theo kịp `refresh_tokens` (2,0×). Tick vẫn bị chặn bởi ngân sách 30 giây, và toàn process chỉ chạy tối đa `RETENTION_MAX_CONCURRENT_JOBS` (mặc định 2) tick retention cùng lúc (ngân sách đồng thời dùng chung: tick vượt ngân sách bị BỎ trước khi lấy kết nối, thử lại chu kỳ sau — retention không bao giờ chiếm quá 2 × 2 kết nối pool). `pnpm capacity:data` in cảnh báo; tăng `RETENTION_MAX_BATCHES_PER_TICK` (tối đa 1.000)
     hoặc `RETENTION_BATCH_SIZE` (tối đa 50.000) và theo dõi autovacuum.
   - Story sweeper: lô 500 story, ngân sách 30 giây/tick, nghỉ 50 ms là HẰNG SỐ trong mã — `RETENTION_*` không điều chỉnh được, chỉ
     `STORY_SWEEPER_INTERVAL_MS` (mặc định 1 giờ). **ĐO** (`scripts/capacity/bench/story-sweeper.mjs`: 12.000 story × 100 lượt xem = 1,2 triệu hàng cascade, hàng xen kẽ ngẫu nhiên, dữ liệu
     nằm trong cache): một lô p50 88 ms / p95 158 ms (≈ 530.000 `story_views`/giây, 59 byte WAL/hàng; lần chạy trước trên máy ít tải ra 67 ms). Mô hình
     cần 1.920 lô/ngày ≈ 80 lô/tick ở chu kỳ 1 giờ, tức đủ khi một lô ≤ 325 ms: lab có biên ≈ 3,7×. Nhưng đó là cận trên (bảng ~220 MB trong
     bộ nhớ); nếu lô chậm hơn lab 5× / 10× thì chu kỳ tối đa còn ≈ 46 / 24 phút — **cần đo lại ở staging và hạ `STORY_SWEEPER_INTERVAL_MS` trước khi tin chu kỳ mặc định**.

## Đánh đổi bảo mật của dọn-lúc-xoay refresh token (mặc định TẮT, cần review bảo mật)

Phát hiện tái dùng token (reuse detection) dựa vào việc token ĐÃ XOAY vẫn nằm trong bảng: khi bị phát lại, `rotated_at` có giá trị nên cả họ
bị thu hồi. Dọn-lúc-xoay xoá chính những hàng đó sau `N` ngày (`AUTH_REFRESH_ROTATED_RETENTION_DAYS`), nên:

- Cửa sổ phát hiện giảm từ ≈ TTL (30 ngày) xuống ≈ `N` ngày (mặc định khuyến nghị 7). Kịch bản: kẻ trộm lấy `T0`, dùng trước và tiếp
  tục xoay; mỗi lần xoay của kẻ trộm xoá các hàng đã xoay quá `N` ngày của họ, kể cả `T0`. Người dùng thật quay lại sau `N` ngày với `T0`
  nhận `invalid` (401 thường) chứ KHÔNG còn `reused`; họ KHÔNG bị thu hồi và phiên của kẻ trộm sống tiếp (mỗi lần xoay gia hạn TTL).
- Test `lifecycle-retention.integration.spec.ts` khoá hành vi này (phát lại sau khi dọn → `invalid`, họ không bị thu hồi) để không ai
  "sửa" nó thành thay đổi âm thầm.
- Không xem trước được: dọn-lúc-xoay không phải một `PurgeStep` nên dry-run không đếm, và kết quả DELETE không có metric/log. Xem tác động
  bằng `n_tup_del` của `refresh_tokens` ở staging trước khi bật.
- Chỉ có tác dụng với họ còn đang xoay. Họ bị bỏ rơi giữ `N` ngày hoạt động cuối tới `expires_at + GRACE`, nên mức giảm dung lượng phụ thuộc
  họ sống bao lâu: mô hình cho 37 ngày nếu họ chỉ sống 1 ngày, ≈ 14 ngày nếu 30 ngày, ≈ 7,6 ngày nếu 365 ngày.

Quyết định mặc định: **không bật**. Bật chỉ sau khi chủ bảo mật chấp nhận cửa sổ phát hiện ngắn hơn (hoặc chọn hướng (B)/(C) bên dưới thay thế).

## Việc CẦN QUYẾT ĐỊNH (chưa bật xoá thật / chưa làm)

| Hạng mục                                                    | Lựa chọn                                                                                                                                                                                                                                                                                                                                                                                                                                 | Đề xuất                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tần suất xoay refresh token** (tải ghi lớn nhất của auth) | (A) giữ xoay mỗi lần refresh + job xoá theo `expires_at` (đã làm, ≈ 4,2 TB ổn định nếu `RETENTION_*` được tăng; ở mặc định job chỉ theo kịp một nửa); (B) chỉ xoay khi token cũ hơn N giờ (giảm ~6× hàng và ghi, đổi lại token bị đánh cắp dùng được tối đa N giờ trước khi bị phát hiện); (C) xoay tại chỗ: một hàng mỗi họ + `prev_token_hash` (bảng bị chặn bởi số phiên, không còn retention, nhưng chỉ phát hiện tái dùng 1 thế hệ) | A ngay (đã có), cân nhắc B hoặc C trước khi chạm quy mô triệu DAU; cần review bảo mật                                                                                                                          |
| **Dọn-lúc-xoay** (`AUTH_REFRESH_ROTATED_RETENTION_DAYS`)    | tắt (`0`, mặc định) / bật N ngày: giảm ≈ 4,2 → 1,6 TB nhưng cửa sổ phát hiện tái dùng từ ≈ 30 xuống ≈ N ngày (mục trên)                                                                                                                                                                                                                                                                                                                  | tắt cho tới khi có review bảo mật; ưu tiên (B)/(C) nếu mục tiêu là giảm tải ghi                                                                                                                                |
| **Chat bạn bè (`messages`)**                                | giữ vĩnh viễn trong Postgres / nóng N ngày + archive lạnh có đường đọc lại / xoá                                                                                                                                                                                                                                                                                                                                                         | nóng 180 ngày + archive; phân vùng theo tháng; **idempotency key** UNIQUE toàn cục không còn đảm bảo khi chia theo thời gian → tách bảng khoá idempotency ngắn hạn hoặc khoá chứa mốc thời gian (xem ADR 0013) |
| **Chat ẩn danh (`soul_chat_messages`) và phiên ghép**       | giữ bằng chứng report; xoá phiên chưa thành bạn và không còn report sau N ngày                                                                                                                                                                                                                                                                                                                                                           | 90 ngày cho phiên không thành bạn/không report; phòng đã thành bạn giữ cùng vòng đời chat bạn bè                                                                                                               |
| **`match_tickets` / `match_sessions`**                      | FK vòng ticket↔session + bảng con; cần nới FK (`SET NULL`) hoặc phân vùng theo ngày                                                                                                                                                                                                                                                                                                                                                      | phân vùng theo ngày + `DROP` sau 30/90 ngày; giữ session có report/đã thành bạn                                                                                                                                |
| **`video_views`** (`VIDEO_VIEW_RETENTION_DAYS`, mặc định 0) | giữ (≈ 32 TB sau 3 năm) / 180 ngày (sau đó người xem lại có thể được đếm thêm một lần) / thay bằng cấu trúc xác suất (HyperLogLog/Bloom trên Redis)                                                                                                                                                                                                                                                                                      | 180 ngày (≈ 5,3 TB); xét HyperLogLog nếu số cặp (video, người xem) vượt khả năng                                                                                                                               |
| **`outbox_events` khi relay tắt** (mặc định mọi profile)    | bật relay (cần consumer) / ngừng ghi outbox khi không có consumer / xoá theo tuổi. Job retention chỉ xoá dòng ĐÃ publish nên không giải quyết relay tắt                                                                                                                                                                                                                                                                                  | quyết định cùng việc có Kafka hay không; hiện chỉ cảnh báo                                                                                                                                                     |
| **Story sweeper ở quy mô lớn**                              | giữ chu kỳ 1 giờ / hạ `STORY_SWEEPER_INTERVAL_MS` / đưa lô và ngân sách thành biến cấu hình                                                                                                                                                                                                                                                                                                                                              | đo lô cascade ở staging; hạ chu kỳ xuống ≤ 30 phút nếu lô > ~300 ms                                                                                                                                            |
| **Đối soát sổ cái**                                         | dựng lại toàn bộ lịch sử mỗi 24 giờ đắt dần theo lịch sử (ở 3 năm ≈ 11 tỷ entry ≈ 2,7 TB đọc)                                                                                                                                                                                                                                                                                                                                            | điểm kiểm Redis dùng chung (tổng theo lát + kiểm lát xoay vòng) hoặc chạy trên replica và kéo giãn chu kỳ; xem plan § 9                                                                                        |

## Bằng chứng và giới hạn

| Con số                                                             | Cách có được                                                                                                                                                                                    | Giới hạn                                                                                                            |
| ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------- |
| Byte/hàng (heap + index)                                           | `pnpm capacity:row-sizes`, 200.000 hàng/bảng, schema migrate đầy đủ                                                                                                                             | index sâu hơn ở hàng tỷ hàng thường +5–10%; hàng tổng hợp, độ dài chuỗi là giả định ghi trong từng spec             |
| Xoá ≈ 184.500 hàng/giây, 288 byte WAL/hàng, VACUUM 5,1 s           | `scripts/capacity/bench/retention-delete.mjs` (3 triệu hàng `refresh_tokens`, một kết nối, container cục bộ); một lần đo trước đó ra ≈ 39.800 hàng/giây                                         | trong cache, một kết nối, chưa có tải ghi đồng thời/replica; chênh 4,6× giữa hai lần chạy → KHÔNG phải số công suất |
| BRIN ≈ 430–540 ms vs B-tree ≈ 0,6 ms mỗi lô                        | `scripts/capacity/bench/brin-churn.mjs`, sau 4 vòng xoá 20% rồi chèn lại                                                                                                                        | một kích thước bảng; cơ chế (summary BRIN chỉ nở ra) là tính chất của Postgres nên kết luận vững hơn con số         |
| Story sweeper p50 88 ms/lô, ≈ 530.000 hàng cascade/giây            | `scripts/capacity/bench/story-sweeper.mjs` (12.000 story × 100 lượt xem)                                                                                                                        | bảng ~220 MB nằm trong bộ nhớ → cận trên; dao động ±30% giữa các lần chạy                                           |
| Câu xoá `ctid` + `tableoid` dùng Nested Loop + Tid Scan có tham số | `scripts/capacity/bench/ctid-delete-plan.mjs`: `EXPLAIN (ANALYZE)` trên 2 triệu hàng `match_daily_quotas` và 1 triệu hàng `guest_match_quotas` (script tự fail nếu thấy hash join/quét cả bảng) | dữ liệu tổng hợp, một lô 5.000 hàng; `guest_match_quotas` chọn lô bằng khoá chính                                   |
| Index được dùng cho từng quy tắc                                   | `lifecycle-retention.integration.spec.ts`: `EXPLAIN` câu xoá lô của 9 quy tắc với `enable_seqscan = off`                                                                                        | chứng minh predicate + `ORDER BY` khớp index, KHÔNG chứng minh planner chọn index ở quy mô thật                     |
| Tổng dung lượng 3 năm                                              | `pnpm capacity:data` trên số đo và giả định ở trên                                                                                                                                              | chưa gồm WAL, replica, backup, bloat; chưa có benchmark trên dữ liệu 1–3 năm thật                                   |

## Hệ quả

- Với 10 triệu CCU: không dọn → 89 TB/năm và 267 TB sau 3 năm; mã mặc định (khi bật `delete`) → 114 TB sau 3 năm (≈ 175 TB với mặc định cũ 20 lô) và còn tăng 36 TB/năm;
  chấp nhận mọi khuyến nghị → 31 TB sau 3 năm, còn tăng ≈ 5 TB/năm — phần "giữ vĩnh viễn" (sổ cái, lượt thích, bình luận, `gift_events`)
  cần kế hoạch archive riêng, không xoá. (Các con số là dung lượng bảng tại năm 3, không so với tốc độ tăng mỗi năm.)
- Xoá theo lô tạo tải ghi thêm (WAL, vacuum): phải theo dõi `n_dead_tup`, độ trễ replica và thời gian autovacuum trên môi trường thật.
- Chưa có benchmark trên dữ liệu 1–3 năm: mô hình dùng số đo ở 200.000 hàng/bảng và giả định hành vi; cần chạy lại bằng dữ liệu thật
  và thử khôi phục backup ở dung lượng tương đương trước khi chốt.
- Đổi sang `delete` là hành động một lần bật nhiều quy tắc: xem gauge TỪNG quy tắc ở dry-run, và đặt số ngày về `0` cho quy tắc cần hoãn.

## Phương án đã loại

- **Xoá để giảm dung lượng sổ cái** — vi phạm append-only (docs/03 § 3.8.C); giảm chi phí bằng phân vùng theo tháng + lưu trữ lạnh có kiểm soát.
- **Index B-tree trên `refresh_tokens.rotated_at` để xoá token đã xoay** — mỗi lần xoay UPDATE cột này, nên UPDATE mất HOT và ghi thêm vào cả năm index; thay
  bằng dọn cơ hội theo họ (dùng index sẵn có) và B-tree `expires_at` (không bao giờ bị UPDATE) cho phần hết hạn.
- **BRIN trên cột thời gian của bảng bị retention xoá** — đã làm ở migration `1758500000000` rồi gỡ ở `1758800000000` sau khi đo: mất chọn lọc khi bảng bị xoá-rồi-chèn-lại.
- **Lưu refresh token trên Redis** — 336 triệu token/ngày × 7–30 ngày ≈ hàng trăm GB RAM; giảm tần suất xoay hiệu quả hơn.
