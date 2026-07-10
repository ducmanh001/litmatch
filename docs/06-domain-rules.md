[← 05 · Coding Standards](./05-coding-standards.md) · **06 · Domain Rules** · [07 · Roadmap →](./07-roadmap.md)

# 6. Domain Rules quan trọng (ghi rõ, đừng tự đoán)

- 1 user chỉ ở trong **1 queue matching tại 1 thời điểm** (dù là Soul hay Voice).
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
- **Tuổi tối thiểu 18** (config theo thị trường nếu luật địa phương khác), khai sinh nhật lúc đăng ký; tài khoản chưa xác minh bị giới hạn tính năng; report liên quan trẻ vị thành niên xử lý ưu tiên cao nhất (xem [10-code-review-checklist.md § Trust & Safety](./10-code-review-checklist.md)).
- **VIP mua bằng diamond** (qua ledger như mọi giao dịch khác); đang active mà mua tiếp thì **gia hạn cộng dồn** (expiry = max(now, expiry hiện tại) + số ngày gói); hết hạn tự downgrade bằng cách **derive khi đọc**, không chờ cron. Chi tiết: [services/economy-service.md](./services/economy-service.md).
- **Free match giới hạn số lần/ngày** (config, phân biệt guest / thường / VIP) — hết lượt thì trả diamond hoặc chờ reset ngày.

> Đây là danh sách tối thiểu, không đầy đủ. Khi phát hiện thêm 1 domain rule quan trọng trong lúc build, bổ sung vào file này ngay (không để trôi mất trong lịch sử chat).

---
[← 05 · Coding Standards](./05-coding-standards.md) · [07 · Roadmap →](./07-roadmap.md)
