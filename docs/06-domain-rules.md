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

> Đây là danh sách tối thiểu, không đầy đủ. Khi phát hiện thêm 1 domain rule quan trọng trong lúc build, bổ sung vào file này ngay (không để trôi mất trong lịch sử chat).

---
[← 05 · Coding Standards](./05-coding-standards.md) · [07 · Roadmap →](./07-roadmap.md)
