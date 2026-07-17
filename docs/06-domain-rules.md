[← 05 · Coding Standards](./05-coding-standards.md) · **06 · Domain Rules** · [07 · Roadmap →](./07-roadmap.md)

# 6. Domain Rules quan trọng (ghi rõ, đừng tự đoán)

- 1 user chỉ ở trong **1 queue matching tại 1 thời điểm** (dù là Soul hay Voice).
- **Matching phải phục hồi được sau reload bằng state server**: active ticket của chính user chỉ
  gồm `queued|matched`, tra bằng `userId` từ auth và trả nullable; client không được giữ ticketId
  local như nguồn sự thật. Giá speed-up hiển thị phải lấy từ `TicketDto.speedupPriceDiamond`,
  cùng config server dùng để debit, không hard-code ở web/mobile.
- Không match lại người vừa report/block trong X ngày gần nhất.
- Free call có giới hạn thời gian (config được, mặc định giống Litmatch là ~7 phút cho voice, 2-3 phút cho Soul) — hết giờ free thì tự kết thúc hoặc chuyển sang tính phí nếu có cấu hình đó.
- Diamond bị trừ theo **chu kỳ nhỏ** nếu tính phí theo phút, có logic hoàn tiền nếu lỗi hệ thống (không do user).
- Trust score giảm khi bị report nhiều → giảm priority trong matching.
- VIP tier ảnh hưởng: priority matching, giới hạn số lần speed-up, badge hiển thị.
- Party Room: chỉ host mới có quyền cấp/thu quyền speaker; số lượng speaker tối đa phải config được.
- Mọi giao dịch diamond là **append-only ledger** (`LedgerEntry`, double-entry — xem [03-architecture.md § 3.8.C](./03-architecture.md)) — không update/xoá dòng cũ; muốn "sửa" thì tạo **bút toán đảo (reversal entry)** mới trỏ ngược về bút toán gốc, không ghi đè.
- Mọi hành động nhạy cảm (block, report, giao dịch) phải log audit riêng, không xoá được.
- **Gift — người nhận KHÔNG nhận diamond 1:1**: nhận **điểm quy đổi (earnings/exp)** theo tỉ lệ config được (mặc định đề xuất 30-50% giá trị quà). Lý do: nhận diamond 1:1 biến gift thành kênh chuyển tiền ngang hàng → rửa diamond, farm bằng multi-account. Điểm quy đổi đổi ngược được ra gì là quyết định vận hành — mặc định giai đoạn đầu: chỉ hiển thị + xếp hạng, chưa cho quy đổi ngược.
- **3 bất biến chống gian lận của diamond**: không hết hạn, **không rút được ra tiền thật**, **không chuyển trực tiếp** giữa 2 user (mọi luồng diamond user→user chỉ đi qua gift với tỉ lệ quy đổi ở trên).
- **Hết diamond giữa call đang tính phí**: cảnh báo trước khi hết (config, vd khi còn đủ 1 phút), hết thật thì **kết thúc call ngay ở tick kế tiếp** — không cho số dư âm, không grace period trừ khi config bật riêng.
- **Rớt kết nối giữa call**: có **reconnect window** (config, mặc định 30 giây) — trong window billing tạm dừng; quá window thì call kết thúc và settle theo thời gian đã dùng thật.
- **Đăng ký/đăng nhập**: phone OTP hoặc social login (Google/Apple/Facebook) + **guest account** dùng thử. Guest bị giới hạn: không nạp diamond, không nhận điểm quy đổi từ gift, giới hạn match/ngày chặt hơn — cho tới khi gắn số điện thoại/social.
- **Nâng cấp guest → tài khoản thật**: giữ **nguyên `userId`** (cùng `Wallet`, cùng lịch sử ledger, không tạo user mới) — nâng cấp là _gắn thêm_ phone/social vào user đang có, không migrate dữ liệu sang user khác. Nếu số điện thoại/social đã gắn với 1 user thật khác → không cho merge tự động (tránh gộp nhầm ledger 2 người), báo lỗi để user đăng nhập vào tài khoản cũ.
- **Chống farm guest**: guest tạo hàng loạt để cày free match/thưởng là vector lạm dụng — giới hạn số guest theo device fingerprint + IP (config), free match/thưởng của guest tính theo device chứ không chỉ theo userId (tạo user mới không reset được quota), xem [10 § Trust & Safety](./10-code-review-checklist.md).
- **Refund/chargeback IAP**: user hoàn tiền qua Apple/Google sau khi đã nạp (và có thể đã tiêu) diamond → hệ thống ghi **bút toán đảo**, `Wallet.balance` có thể **âm** (user nợ diamond), bị chặn tiêu tiếp tới khi nạp bù; refund-sau-tiêu lặp lại nhiều lần là tín hiệu gian lận → hạ trust score/khoá nạp. Chi tiết [services/economy-service.md § 5](./services/economy-service.md).
- **Tuổi tối thiểu 18** (config theo thị trường nếu luật địa phương khác), khai sinh nhật lúc đăng ký; tài khoản chưa xác minh bị giới hạn tính năng; report liên quan trẻ vị thành niên xử lý ưu tiên cao nhất (xem [10-code-review-checklist.md § Trust & Safety](./10-code-review-checklist.md)).
- **VIP mua bằng diamond** (qua ledger như mọi giao dịch khác); đang active mà mua tiếp thì **gia hạn cộng dồn** (expiry = max(now, expiry hiện tại) + số ngày gói); hết hạn tự downgrade bằng cách **derive khi đọc**, không chờ cron. Chi tiết: [services/economy-service.md](./services/economy-service.md).
- **Free match giới hạn số lần/ngày** (config, phân biệt guest / thường / VIP) — hết lượt thì trả diamond hoặc chờ reset ngày.
- **Discovery (browse/nearby) loại trừ report vĩnh viễn, KHÁC cooldown của matching**: 1 cặp
  user từng report nhau (theo bất kỳ chiều nào) không bao giờ thấy nhau lại qua Discovery —
  `reports` là append-only, không có "unreport" nên không có cơ sở để hết hạn loại trừ này. Đây
  là quyết định chặt hơn `SAFETY_REMATCH_COOLDOWN_DAYS` (matching) có chủ đích: Discovery là màn
  duyệt chủ động lặp lại nhiều lần/ngày, không giống ghép cặp 1 lần. Chi tiết:
  [services/discovery-service.md](./services/discovery-service.md).
- **Card Discovery không được lộ tuổi chính xác**: chỉ trả `ageBucket` (khoảng rộng theo config,
  không phải số tuổi/ngày sinh) và **không sửa `PublicProfileDto`** dùng chung ở Soul Match
  reveal + Friend list (2 nơi đó có bất biến "giữ ẩn danh, không tuổi chính xác" từ trước) —
  Discovery compose DTO riêng đè lên `PublicProfileDto`.
- **Mood không bao giờ hiện ở card ẩn danh trước-match Soul Match**: giữ invariant ẩn danh —
  `MoodService.getPublicMood` không được wire vào luồng reveal trước khi cả 2 `like`. Ẩn 2 chiều
  nếu có block active (khác Discovery — không xét report, xem
  [10-code-review-checklist.md § Mood](./10-code-review-checklist.md)). Chi tiết:
  [services/mood-service.md](./services/mood-service.md).
- **Streak chỉ tăng khi CẢ 2 CHIỀU nhắn trong cùng 1 ngày UTC (server clock)** — không dùng
  timezone local của client (chống spoof + tránh mơ hồ giữa 2 user khác múi giờ). 1 ngày lỡ được
  grace cứu tự động (không phải tài nguyên giới hạn dùng-hết); lỡ từ 2 ngày trở lên reset về 1.
  Block chặn `sendMessage` sẵn → streak tự ngừng, không cần logic riêng. Thưởng diamond theo
  milestone (nếu làm sau) bắt buộc qua `LedgerEntry`, không cộng thẳng. Chi tiết:
  [services/streak-service.md](./services/streak-service.md).
- **`Post.audience` (`public|friends|only_me`) enforce ở GUARD TRUNG TÂM (`getPostOrThrow`)**,
  không phải riêng lẻ từng endpoint — đi thẳng URL `GET /posts/:id` không phải cách né audience;
  vi phạm audience/block/không tồn tại trả CÙNG mã lỗi (oracle-safe). Feed toàn cục chỉ hiện
  `public` — `friends`/`only_me` chỉ qua profile timeline. Chi tiết:
  [services/feed-service.md § 7](./services/feed-service.md).
- **Story ephemeral — hết hạn = filter lúc đọc là nguồn sự thật, sweeper chỉ dọn rác**: KHÔNG
  soft-delete/audit như `Post` (hard-delete khi sweeper chạy, cascade `story_views`). Ring stories
  chỉ bạn bè + mình (quyết định chốt, không phân phối rộng hơn dù `audience=public` tồn tại trên
  schema). Reply story → DM qua `FriendService.sendMessage`, snapshot `mediaUrl` vào
  `Message.attachment` NGAY LÚC REPLY vì story chết sau TTL còn message sống mãi. Chi tiết:
  [services/feed-service.md § 8](./services/feed-service.md).
- **Nearby (W4) — reciprocity 2 chiều bắt buộc + KHÔNG BAO GIỜ trả toạ độ/khoảng cách chính
  xác**: chưa bật `nearbyVisible` (opt-in, mặc định tắt) thì không xem được nearby của người
  khác. Toạ độ quantize ~500m NGAY LÚC GHI (không lưu toạ độ thô) + jitter tất định theo
  cặp-theo-ngày trước khi tính bucket hiển thị — 3 lớp chống trilateration cộng với rate limit
  ghi/đọc. Loại trừ banned/guest/block/report dùng LẠI đúng bộ luật của Discovery browse (không
  tự chế luật riêng). Chi tiết: [services/discovery-service.md § 8](./services/discovery-service.md#nearby).
- **CTA "mời Voice/Soul Match" (W4) — directed invite, KHÔNG phải friend-request flow mới**:
  accept tạo trực tiếp `MatchTicket`/`MatchSession` bỏ qua hàng đợi shard, tái dùng nguyên
  `canPair`/invariant 1-user-1-queue của auto-match; KHÔNG check gender preference (đây là
  consent trực tiếp, khác anonymous auto-pairing). `canPair` phải re-check TẠI THỜI ĐIỂM accept
  (block có thể phát sinh sau khi mời) — chuyển invite sang `declined` và COMMIT trước khi throw
  lỗi (throw trong cùng transaction sẽ rollback luôn phần ghi `declined`, đã bắt qua test thật).
  Rate limit chống spam mời ĐỐI XỨNG cho mọi user, không hard-code phân biệt giới tính trong
  logic. Inbox re-check hidden-set ở mỗi lần đọc và DTO chỉ compose `PublicProfileDto` tối thiểu
  của inviter để invitee có đủ thông tin đồng ý; không lộ ngày sinh/region/trust/status. Chi tiết:
  [services/matching-service.md § 9](./services/matching-service.md#invite).
- **Voice Match KHÔNG tạo Friendship** — chỉ Soul Match có cơ chế like/reveal 2 chiều dẫn tới
  Friendship; mời Voice Match (kể cả qua CTA invite) chỉ vào cuộc gọi tính phí theo phút, không
  có đường nào khác tạo Friendship từ Voice. Chi tiết:
  [services/matching-service.md § 9.3](./services/matching-service.md#invite).
- **Video ngắn (W5) — conditional UPDATE thay vì SELECT FOR UPDATE cho state machine**: mọi
  transition `Video.status` thi hành bằng 1 câu `UPDATE ... WHERE status = 'từ'` (thua race = no-op),
  không pessimistic lock như `MatchTicket` — video không tranh chấp gay gắt như ghép cặp. Report
  video vượt `VIDEO_REPORT_AUTOHIDE_THRESHOLD` distinct reporter → tự động `published→removed`,
  KHÔNG đụng trust score cá nhân (khác report user). `VIDEO_MODERATION_MODE=pre` mặc định (duyệt
  trước khi public). Cấm video ở phase ẩn danh Soul Match — cùng bất biến với Mood. Chi tiết:
  [services/short-video-service.md](./services/short-video-service.md).
- **Insert-rồi-đọc-lại khi unique violation PHẢI KHÔNG nằm trong 1 transaction Postgres explicit**
  nếu bước đọc chỉ chạy khi bước insert đã LỖI: Postgres abort toàn bộ transaction ngay khi 1
  statement lỗi, câu đọc lại sau đó nhận `"current transaction is aborted"` thay vì dữ liệu — bắt
  được qua test thật ở `SafetyService.reportVideo` (2026-07-14). Chỉ bọc transaction khi có ÍT
  NHẤT 1 side-effect khác PHẢI atomic cùng insert đó (vd `report()` insert + trừ trust score);
  nếu không có side-effect thứ 2, để insert/catch/đọc-lại chạy như các statement độc lập (cùng
  pattern `FeedService.createPost`).

> Đây là danh sách tối thiểu, không đầy đủ. Khi phát hiện thêm 1 domain rule quan trọng trong lúc build, bổ sung vào file này ngay (không để trôi mất trong lịch sử chat).

---

[← 05 · Coding Standards](./05-coding-standards.md) · [07 · Roadmap →](./07-roadmap.md)
