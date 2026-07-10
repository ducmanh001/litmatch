[← 00-overview-and-index](./00-overview-and-index.md) · **01 · Product Features** · [02 · Domain Model →](./02-domain-model.md)

# 1. Danh sách tính năng thật của Litmatch (đối chiếu thực tế, không đoán)

Đây là toàn bộ tính năng Litmatch đang có, để build đúng bản chất chứ không chỉ mỗi voice:

| # | Tính năng | Mô tả ngắn | Độ phức tạp kỹ thuật |
|---|---|---|---|
| 1 | **Soul Match** | Ghép ngẫu nhiên vào phòng chat text ẩn danh (2-3 phút). Sau đó 2 bên đánh giá "Thô lỗ / Nhàm chán / Thích". Cả 2 "Thích" → mở khoá profile, thành bạn thật | Trung bình — matchmaking + chat realtime + trạng thái ẩn danh |
| 2 | **Voice Match** | Ghép gọi thoại ngắn (~7 phút), nghe giọng để quyết định kết nối tiếp hay không | Cao — WebRTC/SFU + matchmaking + billing theo phút |
| 3 | **Party Chat (phòng nhóm)** | Voice room nhiều người, chia sẻ mic, chat, tặng quà trong phòng | Cao — multi-party audio (SFU bắt buộc), quản lý role trong phòng (host/speaker/audience) |
| 4 | **Movie Match / Movie Night** | 2 người xem chung 1 video (YouTube) đồng bộ, vừa xem vừa chat | Trung bình — đồng bộ playback state qua WebSocket, không cần xử lý stream video thật |
| 5 | **Palm Match (bói toán)** | Tính năng giải trí: "dự đoán" tình yêu/sức khỏe/công việc | Thấp — chỉ là random/template content, không cần AI thật |
| 6 | **Feed (bảng tin)** | Đăng bài viết/ảnh/trạng thái cảm xúc, người khác thả tim/bình luận | Trung bình — CRUD post + like/comment + fanout khi đông user |
| 7 | **Avatar tuỳ chỉnh** | Không cần ảnh thật, chọn/tạo avatar giữ ẩn danh | Thấp — quản lý asset (item, layer ghép hình) |
| 8 | **Diamond (tiền ảo) + VIP Membership** | Hệ kinh tế xuyên suốt: mua diamond, VIP subscription, mọi tính năng trả phí đều trừ diamond | Cao — xương sống tiền bạc, cần transaction chuẩn, chống gian lận, tích hợp IAP (Apple/Google) |
| 9 | **Speed-up matching** | Trả diamond để ưu tiên ghép nhanh hơn trong queue | Thấp-Trung bình |
| 10 | **Gift trong Party room / Voice call** | Tặng quà ảo, hiệu ứng, đối phương nhận diamond/exp | Trung bình — trừ/cộng diamond + trigger animation event realtime |
| 11 | **Mini game** (đua xe, giải đố) | Chơi game nhỏ trong lúc chat để tăng tương tác | Thấp (ưu tiên thấp nhất) |
| 12 | **Report / Block** | Tố cáo, chặn người dùng | Trung bình — trust & safety, ảnh hưởng matching |
| 13 | **Bộ lọc tuổi/giới tính khi match** | Filter cơ bản trước khi vào queue | Thấp |
| 14 | Giới hạn theo platform | Bản iOS Litmatch **chỉ có Soul Match + Voice Match** (Apple hạn chế tính năng live/random call kiểu group), Android có đủ | Cần lưu ý chính sách store khi lên production |

**Nhận xét quan trọng:** Litmatch không phải app "chỉ có voice call" — nó là **social-entertainment platform** với voice/text matching làm lõi, xoay quanh **1 hệ kinh tế diamond** để monetize toàn bộ. Nếu "bê nguyên" tính năng, thì **Diamond/Economy module** mới là phần phải thiết kế chắc nhất ngay từ đầu — không phải Voice Match.

---
[← 00-overview-and-index](./00-overview-and-index.md) · [02 · Domain Model →](./02-domain-model.md)
