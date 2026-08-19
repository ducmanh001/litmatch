[← 05 · Coding Standards](./05-coding-standards.md) · **06 · Domain Rules** · [07 · Roadmap →](./07-roadmap.md)

# 6. Domain Rules quan trọng (ghi rõ, đừng tự đoán)

- 1 user chỉ ở trong **1 queue matching tại 1 thời điểm** (dù là Soul hay Voice).
- **Matching phải phục hồi được sau reload bằng state server**: active ticket của chính user chỉ
  gồm `queued|matched`, tra bằng `userId` từ auth và trả nullable; client không được giữ ticketId
  local như nguồn sự thật. Giá speed-up hiển thị phải lấy từ `TicketDto.speedupPriceDiamond`,
  cùng config server dùng để debit, không hard-code ở web/mobile.
- Không match lại người vừa report/block trong X ngày gần nhất.
- Voice Match có giới hạn cứng **7 phút cho mọi tài khoản** (regular/VIP/SVIP) — hết giờ server tự
  kết thúc. Không có gia hạn, gói phút hoặc trừ Diamond theo phút.
- Nếu mutual-like trong Voice Match, server tạo Friendship + Conversation bền vững; hai người được
  gọi lại không giới hạn thời lượng qua Friend call. Không mutual-like thì không có quyền gọi lại.
- Trust score giảm khi bị report nhiều → giảm priority trong matching.
- VIP tier ảnh hưởng: quota matching, giá speed-up (regular 50, VIP 40, SVIP 30 DIA), badge hiển thị.
- Speed-up không giới hạn số lần theo giờ/ngày; mỗi lần vẫn cần đủ Diamond và ticket còn queued.
- Quota miễn phí/ngày: Regular = Soul 10 + Voice 10; VIP = Soul 30 + Voice 20; SVIP = Soul 60 +
  Voice 40. Guest giữ quota tổng 3 lượt/ngày theo device/IP HMAC. Hết quota, có thể mua riêng
  một lượt: Soul 20 DIA hoặc Voice 40 DIA.
- Party Room: chỉ host mới có quyền cấp/thu quyền speaker; số lượng speaker tối đa phải config được.
- Mọi giao dịch diamond là **append-only ledger** (`LedgerEntry`, double-entry — xem [03-architecture.md § 3.8.C](./03-architecture.md)) — không update/xoá dòng cũ; muốn "sửa" thì tạo **bút toán đảo (reversal entry)** mới trỏ ngược về bút toán gốc, không ghi đè.
- Mọi hành động nhạy cảm (block, report, giao dịch) phải log audit riêng, không xoá được.
- **Gift — người nhận KHÔNG nhận diamond 1:1**: nhận **điểm quy đổi (earnings/exp)** theo tỉ lệ config được (mặc định đề xuất 30-50% giá trị quà). Lý do: nhận diamond 1:1 biến gift thành kênh chuyển tiền ngang hàng → rửa diamond, farm bằng multi-account. Điểm quy đổi đổi ngược được ra gì là quyết định vận hành — mặc định giai đoạn đầu: chỉ hiển thị + xếp hạng, chưa cho quy đổi ngược.
- **3 bất biến chống gian lận của diamond**: không hết hạn, **không rút được ra tiền thật**, **không chuyển trực tiếp** giữa 2 user (mọi luồng diamond user→user chỉ đi qua gift với tỉ lệ quy đổi ở trên).
- **Rớt kết nối giữa call**: có **reconnect window** (config, mặc định 30 giây) — trong window
  timer tạm dừng; quá window thì call kết thúc.
- **Đăng ký/đăng nhập**: phone OTP hoặc social login (Google/Apple/Facebook) + **guest account** dùng thử. Guest bị giới hạn: không nạp diamond, không nhận điểm quy đổi từ gift, giới hạn match/ngày chặt hơn — cho tới khi gắn số điện thoại/social.
- **Nâng cấp guest → tài khoản thật**: giữ **nguyên `userId`** (cùng `Wallet`, cùng lịch sử ledger, không tạo user mới) — nâng cấp là _gắn thêm_ phone/social vào user đang có, không migrate dữ liệu sang user khác. Nếu số điện thoại/social đã gắn với 1 user thật khác → không cho merge tự động (tránh gộp nhầm ledger 2 người), báo lỗi để user đăng nhập vào tài khoản cũ.
- **Chống farm guest khi matching**: guest phải gửi `X-Guest-Device-Token` đã được Auth ký cho
  chính user. Quota ngày UTC được consume atomically theo ba key HMAC ổn định
  `(user, device token identity, normalized network IP)` với pepper server; tạo user mới không
  được phép chỉ reset một trong ba trục. Không lưu device token/IP thô trong bảng quota. Retry
  idempotent được nhận diện trước khi consume và nâng cấp guest phải khóa/read `User.isGuest` từ
  DB, không tin claim JWT cũ.
- **Refund/chargeback IAP**: user hoàn tiền qua Apple/Google sau khi đã nạp (và có thể đã tiêu) diamond → hệ thống ghi **bút toán đảo**, `Wallet.balance` có thể **âm** (user nợ diamond), bị chặn tiêu tiếp tới khi nạp bù; refund-sau-tiêu lặp lại nhiều lần là tín hiệu gian lận → hạ trust score/khoá nạp. Chi tiết [services/economy-service.md § 5](./services/economy-service.md).
- **Ngày sinh không phải access gate**: người dùng có thể bỏ trống hoặc lưu một ngày hợp lệ
  không nằm trong tương lai; core flow không chặn truy cập/matching theo tuổi hay trạng thái
  xác minh tuổi. Bộ lọc tuổi là preference tự chọn, server chỉ dùng để lọc khi người dùng yêu cầu.
- **VIP mua bằng diamond** (qua ledger như mọi giao dịch khác); đang active mà mua tiếp thì **gia hạn cộng dồn** (expiry = max(now, expiry hiện tại) + số ngày gói); hết hạn tự downgrade bằng cách **derive khi đọc**, không chờ cron. Chi tiết: [services/economy-service.md](./services/economy-service.md).
- **Quota match/ngày** tách Soul/Voice cho Regular/VIP/SVIP theo bảng ở trên; guest vẫn dùng quota
  tổng chống farm. Lượt trả Diamond được ghi ledger cùng transaction tạo ticket và không phải gói
  voice/phút.
- **Discovery (browse/nearby) loại trừ report vĩnh viễn, KHÁC cooldown của matching**: 1 cặp
  user từng report nhau (theo bất kỳ chiều nào) không bao giờ thấy nhau lại qua Discovery —
  `reports` là append-only, không có "unreport" nên không có cơ sở để hết hạn loại trừ này. Đây
  là quyết định chặt hơn `SAFETY_REMATCH_COOLDOWN_DAYS` (matching) có chủ đích: Discovery là màn
  duyệt chủ động lặp lại nhiều lần/ngày, không giống ghép cặp 1 lần. Chi tiết:
  [services/discovery-service.md](./services/discovery-service.md).
- **Card Discovery không trả ngày sinh thô**: nếu user đã tự khai ngày sinh thì trả `ageBucket`
  (khoảng rộng theo config, không phải ngày sinh); nếu bỏ trống thì bucket là `unknown`.
  **Không sửa `PublicProfileDto`** dùng chung ở Soul Match reveal + Friend list — Discovery
  compose DTO riêng đè lên `PublicProfileDto`.
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
  tự chế luật riêng). Chi tiết:
  [services/discovery-service.md § 8](./services/discovery-service.md#8-nearby-w4).
- **Privacy visibility settings là server-side**: `showOnlineStatus`, `showDistance`,
  `searchableByPhone` và `hideProfile` mặc định lần lượt là `true`, `true`, `false`, `false`.
  `hideProfile=true` phải loại user khỏi Discovery và Feed ngay ở query/guard server; không
  được chỉ ẩn card ở web. `showDistance=false` trả `distanceBucket=null` cho Nearby, không
  trả số km thay thế. Presence chỉ được trả khi chủ hồ sơ bật `showOnlineStatus`; presence là
  lease Redis dẫn xuất từ socket realtime và fail-closed khi Redis lỗi. Tìm bằng phone phải
  trả cùng `null` cho số không tồn tại và user chưa bật `searchableByPhone` để tránh oracle.
- **CTA "mời Voice/Soul Match" (W4) — directed invite, KHÔNG phải friend-request flow mới**:
  accept tạo trực tiếp `MatchTicket`/`MatchSession` bỏ qua hàng đợi shard, tái dùng nguyên
  `canPair`/invariant 1-user-1-queue của auto-match; KHÔNG check gender preference (đây là
  consent trực tiếp, khác anonymous auto-pairing). `canPair` phải re-check TẠI THỜI ĐIỂM accept
  (block có thể phát sinh sau khi mời) — chuyển invite sang `declined` và COMMIT trước khi throw
  lỗi (throw trong cùng transaction sẽ rollback luôn phần ghi `declined`, đã bắt qua test thật).
  Rate limit chống spam mời ĐỐI XỨNG cho mọi user, không hard-code phân biệt giới tính trong
  logic. Inbox re-check hidden-set ở mỗi lần đọc và DTO chỉ compose `PublicProfileDto` tối thiểu
  của inviter để invitee có đủ thông tin đồng ý; không lộ ngày sinh/region/trust/status. Chi tiết:
  [services/matching-service.md § 9](./services/matching-service.md#9-invite-cta-mời-voicesoul-match-w4).
- **Profile social actions**: public profile luôn có CTA `follow` và mở chat trực tiếp; không cần
  gửi Match Invite rồi chờ đối phương chấp nhận. Server lưu `ProfileFollow` độc lập với chat.
  Server chỉ ghi `ProfileChatContact` khi một cặp lần đầu mở chat trực tiếp; số người có
  `firstContactDate` là ngày UTC hiện tại mới được dùng làm popularity gate. Từ người thứ
  `PROFILE_DIRECT_MESSAGE_DAILY_FIRST_CHAT_THRESHOLD` + 1 (mặc định 10 người đầu được miễn),
  lần mở chat đầu tiên phải tặng một món quà; Gift được ghi qua Economy, `GiftEvent`,
  `Conversation` và `ProfileChatContact` trong cùng transaction. Conversation đã tồn tại thì
  không thu lại quà cho các tin nhắn sau; block 2 chiều vẫn chặn tại thời điểm action.
- **Voice Match có thể tạo Friendship bằng "Yêu thích" ngay trong hoặc sau cuộc gọi**: mỗi bên có
  đúng một lượt immutable; chỉ khi **cả hai** đã thích thì server tạo `Friendship` và
  `Conversation` trong cùng transaction. Danh tính chỉ được reveal qua chat sau mutual like; khi
  user kết thúc call, client mở thẳng conversation bền vững. Invite Voice dùng đúng quy tắc này. Chi tiết:
  [services/calling-service.md § 5](./services/calling-service.md).
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
