# 0013. Chính sách vận hành cho scale: gộp thông báo chat, retention, giao OTP

- **Ngày**: 2026-10-19
- **Trạng thái**: Accepted
- **Liên quan**: docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 7,
  [ADR 0008](./0008-zero-cost-single-node-release-profile.md),
  [ADR 0012](./0012-postgres-persistence-boundaries.md), docs/services/friend-service.md,
  docs/services/notification-service.md, docs/runbooks/zero-cost-production.md

## Bối cảnh

Kế hoạch scale (10 triệu đồng thời, 10.000 người chat, 10 triệu lượt ghép/ngày) còn ba việc cần chính
sách chứ không chỉ mã: mỗi tin nhắn bạn bè tạo một notification và một push (≈3.000 insert/giây ở tải đề
bài), các bảng vận hành tăng vô hạn, và mã OTP đăng nhập nằm trong response HTTP. Chủ hệ thống giao phần
chọn chính sách cho agent; ADR này ghi lại lựa chọn, vì sao, và điều kiện xem xét lại.

## Quyết định

1. **Gộp thông báo tin nhắn bạn bè theo cửa sổ.** Trong mỗi cửa sổ
   `FRIEND_MESSAGE_NOTIFY_WINDOW_SECONDS` (mặc định 60 s; 0 = tắt) chỉ tin đầu tiên của
   (người nhận, hội thoại) tạo notification + push; tin sau vẫn lưu, publish realtime và tính unread.
   Cổng là khoá Redis `SET NX EX`, fail-open khi Redis lỗi, mở lại cổng khi mute hoặc khi tạo notification
   lỗi. Mô hình ở tải đề bài: 1.500 → 83 insert notification/giây (−94%).
2. **Retention theo lô thay cho partition thời gian.** Job `RETENTION_MODE=off|dry-run|delete` (mặc định
   `off`) xoá theo lô ngắn, `SKIP LOCKED`, cluster-singleton. Áp dụng cho `notifications` (đã đọc 90 ngày,
   chưa đọc 365 ngày). Job nằm trong module sở hữu bảng; khung chung ở `common/retention` (trần lô và trần
   30 s mỗi tick, dừng khi shutdown, xoay vòng quy tắc để backlog lớn không bỏ đói quy tắc sau). Migration thêm
   hai index một phần và autovacuum riêng cho `notifications`. Metric `retention_rows_total{rule}` (hàng đã
   xoá) và gauge `retention_eligible_rows{rule}` (hàng đủ điều kiện ở lần dry-run gần nhất — gauge vì counter
   sẽ cộng dồn cùng một backlog mỗi tick). K8s base đặt `dry-run` để xem tác động trước khi xoá.
3. **OTP có ba cách giao, chọn tường minh.** `AUTH_OTP_DELIVERY=response|sms-http|disabled`.
   `sms-http` gửi qua cổng SMS HTTP trung lập nhà cung cấp (`POST { to, message, reference }`, Bearer token,
   https bắt buộc ở production, timeout, không redirect, lỗi không lộ số/mã), response không có mã. Mã mới
   được lưu trước, mã cũ chỉ bị vô hiệu SAU khi giao thành công (và chỉ các mã cũ hơn); giao lỗi thì vô hiệu
   đúng mã mới, mã cũ vẫn dùng được, trả 503 và đếm `auth_otp_delivery_total{outcome}`. Mặc định giữ
   `response` để không khoá đăng nhập của deployment đang chạy, nhưng production log lỗi mỗi lần khởi động;
   K8s base đặt `disabled` (cần Google client ID cho admin).
4. **Giữ nguyên các mặc định realtime** đã chọn ở plan: lease 90 s (kéo lên 300 s là đánh đổi đã mô tả ở
   plan § 7 B, cần chủ hệ thống chấp nhận slot ma tối đa 5 phút), số Redis shard theo công thức của
   `pnpm capacity:model` (12 shard ở 10 triệu CCU với lease 90 s, 4 với lease 300 s) rồi đo lại.

## Phương án đã loại & lý do

- **Gộp theo "người nhận đang online"** — presence trễ tới một lease (90 s) nên nuốt push của app nền.
- **Gộp theo "còn notification chưa đọc"** — đọc hội thoại không đánh dấu notification đã đọc nên người
  dùng im lặng vĩnh viễn với hội thoại đó.
- **Partition theo thời gian cho `messages`/`soul_chat_messages`/`notifications`** — PostgreSQL buộc mọi
  ràng buộc unique chứa khoá partition; `messages.idempotency_key` và `soul_chat_messages.idempotency_key`
  là UNIQUE toàn cục (idempotency replay) nên không còn đảm bảo nếu chia theo `created_at`. Cần thiết kế lại
  idempotency (bảng khoá riêng hoặc khoá chứa mốc thời gian) trước khi partition — chưa làm.
- **Retention `soul_chat_messages` theo tuổi** — phòng của cặp đã là bạn không bao giờ đóng (`matched` giữ phase
  `chatting`, vẫn đọc/gửi được), `rate()` chỉ import lịch sử sang chat bạn bè một lần nên tin gửi sau đó chỉ nằm ở
  bảng này, và entity quy định "KHÔNG xoá dữ liệu — giữ bằng chứng cho Report/T&S". Một bản đã viết và gỡ sau review
  độc lập vì sẽ xoá lịch sử phòng đang dùng và bằng chứng của report đang mở. Chỉ an toàn khi giới hạn ở phòng
  đã đóng, không còn report mở, đã import xong — cần quy tắc của Soul Match + Safety. Chưa làm.
- **Retention `match_tickets`/`match_sessions`** — đồ thị FK vòng (ticket ↔ session) và các bảng con
  (`soul_chat_messages`, `soul_match_ratings`, `calls`) cần thứ tự xoá riêng và quyết định về bằng chứng
  cuộc gọi/đánh giá; cột FK của session chưa có index nên mỗi lần xoá ticket sẽ quét session. Chưa làm.
- **Retention tin nhắn bạn bè (`messages`)** — nội dung người dùng, có yếu tố pháp lý; cần chính sách lưu
  trữ của chủ sản phẩm và index/partition riêng cho bảng ghi nhiều nhất. Chưa làm.
- **Đổi mặc định OTP production thành `disabled`** — runbook zero-cost-production và plan 2026-07-18 ghi
  OTP-trả-trong-response là quyết định có chủ đích của alpha chi phí 0; đổi âm thầm có thể khoá đăng nhập
  của deployment đang chạy mà repo không kiểm chứng được môi trường thật.
- **Chọn một nhà cung cấp SMS cụ thể** — hợp đồng và chi phí là quyết định kinh doanh; cổng HTTP trung lập
  cho phép nối Twilio/eSMS/SpeedSMS qua relay mỏng hoặc thêm adapter cùng `OtpSenderPort`.

## Hệ quả

- Người nhận có thể không thấy push của tin thứ hai trong cùng cửa sổ; tin vẫn tới qua realtime, unread và
  danh sách hội thoại. Theo dõi `friend_message_notifications_total{outcome}`; `gate_error` tăng nghĩa là
  Redis lỗi và hệ thống đang fail-open.
- Retention xoá dữ liệu không hoàn tác: luôn bật `dry-run` trước, đọc gauge `retention_eligible_rows{rule}`,
  rồi mới `delete`. Thông lượng mặc định 5.000 hàng/giây/quy tắc (ADR 0014; trước đây ≈1.600) (tối đa 30 s mỗi tick); tăng
  `RETENTION_BATCH_SIZE`/`RETENTION_MAX_BATCHES_PER_TICK` nếu backlog còn (log "còn backlog"). Xoá đều đặn cần
  vacuum kịp: migration đặt `autovacuum_vacuum_scale_factor=0.02` cho `notifications`. `migration:revert` chỉ gỡ
  index không CONCURRENTLY (revert của TypeORM luôn chạy trong transaction).
- Production vẫn lộ mã OTP cho tới khi chủ hệ thống đặt `AUTH_OTP_DELIVERY=sms-http` hoặc `disabled`
  (chỉ Google/guest). Cổng SMS thật cần thêm trần chi phí (ngân sách/ngày, allowlist đầu số) để chống
  SMS pumping — chưa làm.
- Gộp thông báo là best-effort ở hai chỗ: tin 1 chiếm cổng rồi tạo notification lỗi thì tin 2 đồng thời đã bị gộp (cả
  hai không có thông báo tới tin 3), và `DEL` mở cổng không kiểm chủ nên với cửa sổ rất nhỏ có thể mở nhầm cổng của chủ
  mới (chỉ gây thừa thông báo). Người nhận đã mute tốn thêm SET + DEL Redis mỗi tin (số truy vấn DB không đổi).
- Cổng SMS thật: lượt giao lỗi vẫn tính vào hạn mức 5/giờ/số (cổng chập chờn có thể đã gửi SMS thật; không đếm sẽ
  mở đường bơm SMS tốn tiền), nên cổng lỗi ≥5 lần thì người dùng bị 429 tới 1 giờ.
- Xem xét lại khi: chính sách lưu trữ tin nhắn được chốt (retention `messages`, `soul_chat_messages`), idempotency được thiết kế lại
  (partition), hoặc có nhà cung cấp SMS (adapter riêng + trần chi phí).
