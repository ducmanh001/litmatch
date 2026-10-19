# 0014. Vòng đời dữ liệu và mô hình tăng trưởng theo năm

- **Ngày**: 2026-10-19
- **Trạng thái**: Accepted (cơ chế đã làm); các mục đánh dấu **CẦN QUYẾT ĐỊNH** chưa bật xoá thật
- **Liên quan**: [ADR 0013](./0013-scale-readiness-policies.md),
  docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 7a / § 9,
  `pnpm capacity:row-sizes`, `pnpm capacity:data`, `scripts/capacity/row-sizes.json`

## Bối cảnh

Các cải tiến C1–C18 giảm số truy vấn, số lần ghi và tranh chấp, nhưng không quản lý **dữ liệu tích lũy nhiều năm**. Câu hỏi là:
với 10 triệu người dùng đồng thời, Postgres lớn lên bao nhiêu mỗi năm, bảng nào quyết định chi phí, và cái gì phải xoá, giữ,
hay lưu trữ lạnh. Trước đây chỉ có `bytesPerMessageRow: 400` (giả định) trong mô hình tải; không có số đo kích thước hàng.

## Số đo và mô hình

- **Byte/hàng ĐO** (`pnpm capacity:row-sizes`): tạo DB tạm từ schema đã migrate (index và ràng buộc thật), nạp 200.000 hàng
  tổng hợp mỗi bảng, `VACUUM`, đọc `pg_relation_size` + `pg_indexes_size`. Postgres 16.15. Kết quả ở `scripts/capacity/row-sizes.json`.
  Ví dụ: `refresh_tokens` 413 byte (heap 174 + index 239), `messages` 467, `match_tickets` 505, `notifications` 416,
  `transactions` 604, `ledger_entries` 238, `video_views` 202. **Index thường lớn hơn heap** — idempotency key và hash 64 ký tự
  nằm trong các index UNIQUE (126–138 byte mỗi hàng).
- **Số hàng/ngày** (`pnpm capacity:data`): suy từ đề bài (10 triệu CCU, 10.000 người chat, 10 triệu lượt ghép/ngày) và các giả định hành vi
  ghi rõ trong `SCENARIO` (DAU ≈ 48 triệu, mỗi người mở app 1,5 giờ/ngày, access token 15 phút...). **Đây là giả định**: thay bằng
  `pg_stat_user_tables.n_tup_ins` của hệ thống thật trước khi dùng để mua đĩa.

Kết quả mặc định (chưa gồm WAL, replica, backup, bloat, ảnh/video):

| Bảng                                          | Hàng/ngày     | TB/năm (không dọn) | Vòng đời khuyến nghị                             | TB ổn định |
| --------------------------------------------- | ------------- | ------------------ | ------------------------------------------------ | ---------- |
| `refresh_tokens`                              | 336 triệu     | **46,1**           | token đã xoay 7 ngày; tạo quá 37 ngày            | 0,9        |
| `video_views`                                 | 144 triệu     | 9,7                | 180 ngày **[CẦN QUYẾT ĐỊNH]**                    | 4,8        |
| `messages` (chat bạn bè)                      | 43 triệu      | 6,7                | nóng 180 ngày + archive **[CẦN QUYẾT ĐỊNH]**     | 3,3        |
| `story_views`                                 | 96 triệu      | 6,2                | cascade theo story (24 giờ)                      | 0,03       |
| `soul_chat_messages`                          | 43 triệu      | 5,3                | 90 ngày, giữ phòng đã thành bạn / còn report     | 1,3        |
| `notifications`                               | 32 triệu      | 4,4                | đã có (C10)                                      | 2,4        |
| `match_tickets` / `match_sessions`            | 24 / 10 triệu | 4,0 / 0,8          | 30 / 90 ngày **[CẦN QUYẾT ĐỊNH, cần phân vùng]** | 0,3 / 0,2  |
| `reactions`, `transactions`, `ledger_entries` | —             | 2,3 / 1,0 / 0,8    | giữ (trạng thái / sổ cái append-only)            | tăng mãi   |
| **Tổng**                                      |               | **92**             |                                                  | **~30**    |

Ba phát hiện đổi thứ tự ưu tiên:

1. **`refresh_tokens` là bảng tăng nhanh nhất** (50% tổng tăng trưởng) và cũng là tải GHI lớn nhất của auth: mỗi lần xoay token (≈ mỗi
   15 phút khi đang mở app) là một INSERT + một UPDATE trên bảng có 4 index (khoá chính, hash UNIQUE, user, họ), ≈ 3.900 lần xoay/giây trung bình ở quy mô đề bài. Trước ADR này không hàng nào bị xoá.
2. Chat không phải bảng lớn nhất: với đề bài (10.000 người chat, ~86 triệu tin/ngày chia đôi chat bạn bè / ẩn danh) `messages` + `soul_chat_messages` ≈ 12 TB/năm.
3. **`outbox_events` tăng vô hạn khi relay tắt** (mặc định ở K8s): sự kiện không bao giờ được publish nên không bao giờ đủ điều kiện xoá.

## Quyết định

1. **Mọi bảng tăng theo hoạt động phải có vòng đời ghi rõ** (bảng trên, và `tableDefinitions` trong `data-growth.mjs`). Sổ cái
   (`transactions`, `ledger_entries`), `gift_events`, `admin_audit_logs` và nội dung người dùng đang hiển thị **không bao giờ bị xoá để giảm dung lượng**.
2. **Cơ chế theo khối lượng ghi**:
   - Bảng ≤ vài trăm hàng/giây xoá: retention theo lô của `common/retention` (đã có), mỗi module một job. Đã làm ở lô này:
     `refresh_tokens`, `phone_otps`, `match_daily_quotas`, `guest_match_quotas`, `outbox_events` (đã publish; dead-letter mặc định giữ vì cần người xử lý), `video_views`, `video_comments` đã xoá mềm,
     `mood_status_events`, kèm story sweeper xoá hết backlog mỗi tick (trước đây tối đa 500 story/giờ).
   - Bảng có token xoay: **dọn cơ hội lúc ghi** — mỗi lần xoay xoá token ĐÃ XOAY cũ hơn `AUTH_REFRESH_RETENTION_GRACE_DAYS` của CÙNG họ
     (dùng `idx_refresh_tokens_family_id`, không index mới, chi phí tỉ lệ với hoạt động). Chỉ khi `RETENTION_MODE=delete`.
   - Bảng ≥ vài nghìn hàng/giây xoá (`video_views`, `story_views`, về sau `messages`, `match_*`): xoá từng hàng vẫn chạy được
     (đo: ~39.800 hàng/giây một kết nối, 288 byte WAL/hàng) nhưng tạo dead tuple và việc vacuum; hướng đích là **phân vùng theo thời gian rồi `DROP`/detach** partition hết hạn.
3. **Chọn index theo chi phí ghi**: BRIN trên cột thời gian chèn khi MỌI hàng đủ tuổi đều xoá được (không có hàng "sống sót" xen kẽ nên không
   quét lặp) — `refresh_tokens`, `phone_otps`, `video_views`, `mood_status_events`, quota. Index B-tree một phần khi hàng chỉ đủ điều kiện sau
   một UPDATE (`published_at`, `deleted_at`) — hàng chưa đủ điều kiện không tốn gì ở index lúc INSERT. **Không** thêm index lên cột bị UPDATE nóng
   (vd `refresh_tokens.rotated_at`, `wallets.updated_at`): làm UPDATE mất HOT và ghi thêm vào mọi index.
   Đo (3 triệu hàng `refresh_tokens`): chọn một lô 5.000 hàng qua BRIN mất 1,7 ms; xoá 533.500 hàng trong 13,4 giây; VACUUM sau đó 14 giây.
4. **Mặc định an toàn**: `RETENTION_MODE=off`; profile triển khai đặt `dry-run` (gauge `retention_eligible_rows{rule}` cho biết bao nhiêu hàng sẽ bị xoá).
   Số ngày 0 = giữ vĩnh viễn. Chuyển sang `delete` là quyết định của chủ hệ thống sau khi xem số.
5. **Công suất xoá phải cấu hình theo tải**: mặc định 5.000 hàng × 20 lô / 60 giây ≈ 1.667 hàng/giây mỗi quy tắc — thấp hơn nhu cầu
   `refresh_tokens` (~3.900/giây) và `video_views`/`story_views` ở quy mô đề bài. `pnpm capacity:data` in cảnh báo; tăng
   `RETENTION_MAX_BATCHES_PER_TICK` (tối đa 1.000) hoặc `RETENTION_BATCH_SIZE` (tối đa 50.000) và theo dõi autovacuum.

## Việc CẦN QUYẾT ĐỊNH (chưa bật xoá thật / chưa làm)

| Hạng mục                                                    | Lựa chọn                                                                                                                                                                                                                                                                                                                              | Đề xuất                                                                                                                                                                                                        |
| ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Tần suất xoay refresh token** (tải ghi lớn nhất của auth) | (A) giữ xoay mỗi lần refresh + retention (đã làm); (B) chỉ xoay khi token cũ hơn N giờ (giảm ~6× hàng và ghi, đổi lại token bị đánh cắp dùng được tối đa N giờ trước khi bị phát hiện); (C) xoay tại chỗ: một hàng mỗi họ + `prev_token_hash` (bảng bị chặn bởi số phiên, không còn retention, nhưng chỉ phát hiện tái dùng 1 thế hệ) | A ngay (đã có), cân nhắc B hoặc C trước khi chạm quy mô triệu DAU; cần review bảo mật                                                                                                                          |
| **Chat bạn bè (`messages`)**                                | giữ vĩnh viễn trong Postgres / nóng N ngày + archive lạnh có đường đọc lại / xoá                                                                                                                                                                                                                                                      | nóng 180 ngày + archive; phân vùng theo tháng; **idempotency key** UNIQUE toàn cục không còn đảm bảo khi chia theo thời gian → tách bảng khoá idempotency ngắn hạn hoặc khoá chứa mốc thời gian (xem ADR 0013) |
| **Chat ẩn danh (`soul_chat_messages`) và phiên ghép**       | giữ bằng chứng report; xoá phiên chưa thành bạn và không còn report sau N ngày                                                                                                                                                                                                                                                        | 90 ngày cho phiên không thành bạn/không report; phòng đã thành bạn giữ cùng vòng đời chat bạn bè                                                                                                               |
| **`match_tickets` / `match_sessions`**                      | FK vòng ticket↔session + bảng con; cần nới FK (`SET NULL`) hoặc phân vùng theo ngày                                                                                                                                                                                                                                                   | phân vùng theo ngày + `DROP` sau 30/90 ngày; giữ session có report/đã thành bạn                                                                                                                                |
| **`video_views`**                                           | 180 ngày (sau đó người xem lại có thể được đếm thêm một lần) / thay bằng cấu trúc xác suất (HyperLogLog/Bloom trên Redis)                                                                                                                                                                                                             | 180 ngày; xét HyperLogLog nếu số cặp (video, người xem) vượt khả năng                                                                                                                                          |
| **`outbox_events` khi relay tắt**                           | bật relay (cần consumer) / ngừng ghi outbox khi không có consumer / xoá theo tuổi                                                                                                                                                                                                                                                     | quyết định cùng việc có Kafka hay không; hiện chỉ cảnh báo                                                                                                                                                     |
| **Đối soát sổ cái**                                         | dựng lại toàn bộ lịch sử mỗi 24 giờ đắt dần theo lịch sử (ở 3 năm ≈ 11 tỷ entry ≈ 2,7 TB đọc)                                                                                                                                                                                                                                         | điểm kiểm Redis dùng chung (tổng theo lát + kiểm lát xoay vòng) hoặc chạy trên replica và kéo giãn chu kỳ; xem plan § 9                                                                                        |

## Hệ quả

- Dung lượng ổn định giảm từ ~92 TB/năm (và tăng mãi) về ~30 TB ổn định với vòng đời khuyến nghị, trong đó phần "giữ vĩnh viễn" (sổ cái, lượt thích,
  bình luận, `gift_events`) vẫn tăng tuyến tính ~5 TB/năm — cần kế hoạch archive riêng, không xoá.
- Xoá theo lô tạo tải ghi thêm (WAL, vacuum): phải theo dõi `n_dead_tup`, độ trễ replica và thời gian autovacuum trên môi trường thật.
- Chưa có benchmark trên dữ liệu 1–3 năm: mô hình dùng số đo ở 200.000 hàng/bảng (index sâu hơn ở hàng tỷ hàng thường +5–10%) và giả định hành vi;
  cần chạy lại bằng dữ liệu thật và thử khôi phục backup ở dung lượng tương đương trước khi chốt.

## Phương án đã loại

- **Xoá để giảm dung lượng sổ cái** — vi phạm append-only (docs/03 § 3.8.C); giảm chi phí bằng phân vùng theo tháng + lưu trữ lạnh có kiểm soát.
- **Index B-tree trên `refresh_tokens.rotated_at` để xoá token đã xoay** — mỗi lần xoay UPDATE cột này, nên UPDATE mất HOT và ghi thêm vào cả bốn index; thay
  bằng dọn cơ hội theo họ (dùng index sẵn có) và BRIN `created_at` cho phần quá hạn.
- **Lưu refresh token trên Redis** — 336 triệu token/ngày × 7–30 ngày ≈ hàng trăm GB RAM; giảm tần suất xoay hiệu quả hơn.
