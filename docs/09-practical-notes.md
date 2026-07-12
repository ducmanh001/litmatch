[← 08 · Working with Claude Code](./08-working-with-claude-code.md) · **09 · Practical Notes** · [10 · Code Review Checklist →](./10-code-review-checklist.md)

# 9. Lưu ý thực tế (để không vỡ trận giữa đường)

- **Đừng tự viết SFU** — dùng mediasoup/LiveKit.
- **Economy module là xương sống** — build kỹ nhất, test kỹ nhất, vì gần như mọi feature (speed-up, gift, VIP, party room) đều gọi vào đây.
- **Matching lúc đầu không cần AI phức tạp** — đây là 2 trục khác nhau: hạ tầng (ticket/shard, [03-architecture.md § 3.8.B](./03-architecture.md)) nên đúng ngay từ đầu vì đổi sau tốn kém, nhưng _thuật toán_ chọn ai ghép với ai thì random trong pool đã lọc tiêu chí cơ bản (tuổi/giới tính/region) là đủ để khởi động — mô hình ghép cặp phức tạp hơn (dựa trên hành vi, mức độ tương thích...) nên để sau khi có dữ liệu thật, không đoán trước.
- **IAP (Apple/Google) mất thời gian duyệt và có quy tắc riêng** — nên làm sandbox và tìm hiểu chính sách store sớm.
- Nếu lên iOS, nhớ Apple giới hạn tính năng random live call/group — kiểm tra chính sách App Store review guideline trước khi build Party Room cho iOS để tránh bị từ chối duyệt app.
- **Chỉ 3 thành phần deploy riêng biệt xuyên suốt dự án**: `core-api`, Signaling Gateway, Media Server (đúng [03-architecture.md § 3.2](./03-architecture.md)) — Auth/User/Economy/Matching/Calling/Social/Content/Moderation/Notification/Gift đều là **module bên trong `core-api`**, không phải service riêng.

---

[← 08 · Working with Claude Code](./08-working-with-claude-code.md) · [10 · Code Review Checklist →](./10-code-review-checklist.md)
