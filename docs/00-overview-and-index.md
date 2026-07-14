# 00. Tổng quan & Mục lục

Đây là bộ tài liệu thiết kế cho hệ thống kiểu Litmatch — quy mô lớn thật (không phải MVP), dùng làm nguồn sự thật duy nhất khi con người hoặc agent triển khai. Bộ docs này được tách theo scope để mỗi task chỉ nạp đúng phần cần thiết thay vì cả nghìn dòng.

**Agent mới bắt đầu session** phải đọc `/AGENTS.md` ở root trước. Đây là hợp đồng hành vi bắt buộc; các file trong `docs/` là context chi tiết được nạp theo task.

## Mục lục — mục số ↔ file (giữ nguyên số mục cũ để mọi tham chiếu "mục X.Y" ở bất kỳ đâu vẫn tìm đúng)

| Mục | File                                                                   | Nội dung                                                                                                                                                           |
| --- | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | [01-product-features.md](./01-product-features.md)                     | Danh sách tính năng thật của Litmatch                                                                                                                              |
| 2   | [02-domain-model.md](./02-domain-model.md)                             | Domain Model tổng thể (entity chính)                                                                                                                               |
| 3   | [03-architecture.md](./03-architecture.md)                             | Kiến trúc: modular monolith, 3.1-3.7 nền tảng, **3.8 = quyết định thiết kế cho quy mô lớn (SFU, shard matching, ledger)**                                          |
| 4   | [04-tech-stack.md](./04-tech-stack.md)                                 | Tech stack đề xuất                                                                                                                                                 |
| 5   | [05-coding-standards.md](./05-coding-standards.md)                     | Coding standard NestJS + cấu trúc thư mục                                                                                                                          |
| 6   | [06-domain-rules.md](./06-domain-rules.md)                             | Domain rules bắt buộc (đừng để agent tự đoán)                                                                                                                      |
| 7   | [07-roadmap.md](./07-roadmap.md)                                       | Checklist triển khai theo giai đoạn (Giai đoạn 0-7)                                                                                                                |
| 8   | [08-working-with-agents.md](./08-working-with-agents.md)               | Quy trình làm việc dùng chung cho mọi agent                                                                                                                        |
| 9   | [09-practical-notes.md](./09-practical-notes.md)                       | Lưu ý thực tế, tránh vỡ trận giữa đường                                                                                                                            |
| 10  | [10-code-review-checklist.md](./10-code-review-checklist.md)           | **Checklist review code — 10.0 phương pháp luận lỗi logic nghiệp vụ, 10.1 lỗi chung, 10.2 lỗi đặc thù từng domain, 10.3 cách áp dụng**                             |
| 11  | [11-engineering-principles.md](./11-engineering-principles.md)         | **La bàn thiết kế: ownership, boundary, coupling, abstraction, correctness, security, vận hành và tiêu chí tách service**                                          |
| 12  | [12-frontend-architecture.md](./12-frontend-architecture.md)           | **Khung 2 app frontend (admin Vite+React, web Next.js)**: hợp đồng OpenAPI → api-client, quy tắc bắt buộc cho agent frontend, Task 0 backend                       |
| 13  | [13-frontend-coding-standards.md](./13-frontend-coding-standards.md)   | **Coding standard FE dùng chung cho admin + web**: TypeScript/lint, feature folder, TanStack Query, form, error/UX states, realtime, env, testing                  |
| 14  | [14-rule-enforcement-matrix.md](./14-rule-enforcement-matrix.md)       | **Bản đồ rule → enforcement → test → owner**; phân biệt gate máy với mục bắt buộc review tay                                                                       |
| 15  | [15-commit-guidelines.md](./15-commit-guidelines.md)                   | **Chuẩn commit dùng chung**: Conventional Commits, scope, atomicity, verification và ví dụ                                                                         |
| 16  | [16-module-blueprint.md](./16-module-blueprint.md)                     | **Bản thiết kế xây module NestJS**: cây folder/file, public API, ownership, naming, trình tự tạo và Definition of Done                                             |
| 17  | [17-naming-conventions.md](./17-naming-conventions.md)                 | **Quy ước đặt tên dùng chung**: mọi identifier từ code, API, DB, event, config tới metric/test                                                                     |
| —   | [services/economy-service.md](./services/economy-service.md)           | **Đặc tả chi tiết Economy module**: schema ledger, loại tài khoản, bất biến, luồng IAP/VIP, quy tắc concurrency                                                    |
| —   | [services/matching-service.md](./services/matching-service.md)         | **Đặc tả slice M1 Matching**: state machine ticket, shard Redis, double-lock ghép cặp, speed-up qua Economy                                                        |
| —   | [services/party-room-service.md](./services/party-room-service.md)     | **Đặc tả Party Room**: role host/speaker/audience enforce ở SFU, cap speaker dưới lock, lifecycle phòng + sweeper backstop                                         |
| —   | [services/gift-service.md](./services/gift-service.md)                 | **Đặc tả Gift**: transaction 2 chân DIA+PTS, catalog giá server, guest không nhận PTS, realtime sau commit                                                         |
| —   | [services/safety-service.md](./services/safety-service.md)             | **Đặc tả Safety (Report/Block/trust score)**: log append-only, canPair matching, penalty chống lạm dụng report, wire vào Matching + Friend Chat                    |
| —   | [services/feed-service.md](./services/feed-service.md)                 | **Đặc tả Feed**: post/like/comment công khai toàn cục (không fanout), audience per-post (W3), Stories ephemeral ring bạn bè + reply→DM (W3), block cắt điểm chạm   |
| —   | [services/notification-service.md](./services/notification-service.md) | **Đặc tả Notification**: gọi trực tiếp qua DI (không Outbox/Kafka) cho match/message/gift/like-comment, push DevPushProvider (chưa FCM/APNs thật)                  |
| —   | [services/avatar-service.md](./services/avatar-service.md)             | **Đặc tả Avatar**: multi-layer ghép hình (base/tóc/trang phục/phụ kiện), mua item qua spendDiamond generic, chống IDOR lúc trang bị                                |
| —   | [services/discovery-service.md](./services/discovery-service.md)       | **Đặc tả Discovery (browse-only W1)**: filter gender/tuổi (khu vực dành cho Nearby W5), loại block+report vĩnh viễn, card composition không sửa `PublicProfileDto` |
| —   | [services/mood-service.md](./services/mood-service.md)                 | **Đặc tả Mood (preset-only W1)**: append-only set/clear, "mood hiện tại" derive khi đọc, composition qua `getPublicMood`, ẩn 2 chiều khi block                     |
| —   | [services/streak-service.md](./services/streak-service.md)             | **Đặc tả Streak (W2, mở rộng friend)**: on-write khoá row FOR UPDATE, ngày UTC calendar, grace 1 ngày lỡ, cron cảnh báo không ghi streak                           |
| —   | [adr/](./adr/README.md)                                                | Architecture Decision Records — lịch sử các quyết định đã chốt (bối cảnh, phương án loại, hệ quả); 03 là trạng thái đích, ADR là lý do lịch sử                     |
| —   | [sources.md](./sources.md)                                             | Nguồn tham khảo đã dùng để nghiên cứu bộ docs này                                                                                                                  |

## Đường dẫn đọc gợi ý theo tình huống

- **Mới vào dự án / chưa code gì**: đọc 1 → 11 để hiểu sản phẩm/backend; làm frontend đọc thêm
  12–13; sửa rule/CI đọc thêm 14; trước khi commit đọc 15.
- **Bắt đầu 1 giai đoạn mới trong roadmap**: đọc `07-roadmap.md` (mục đang làm) + file mục tương ứng nếu giai đoạn đó động tới kiến trúc/domain rule mới.
- **Sắp merge 1 PR / vừa viết xong 1 module**: bắt buộc đọc `10-code-review-checklist.md`, chạy qua § 10.0 trước khi đọc lại code.
- **Không chắc 1 quyết định kiến trúc có đúng không**: đọc `03-architecture.md`, đặc biệt § 3.8 nếu liên quan tới SFU/matching scale/ledger.
- **Không chắc code nên nằm ở đâu hoặc có nên tách không**: đọc `11-engineering-principles.md`, sau đó đối chiếu `03-architecture.md`, `05-coding-standards.md` và `16-module-blueprint.md`.
- **Đặt tên bất kỳ identifier mới nào**: đọc `17-naming-conventions.md`, sau đó áp dụng quy tắc boundary cụ thể trong coding standard liên quan.

## Quy ước khi sửa bộ docs này

- Giữ nguyên số mục đã có khi có thể — nhiều chỗ trong code/comment/PR description có thể đã tham chiếu "mục 3.8.A", "mục 10.2"... đổi số mục sẽ làm các tham chiếu đó sai. Mục mới được thêm tiếp theo số hiện tại, không đánh lại số cũ.
- Khi 1 file phình quá dài (>250-300 dòng) hoặc 1 service đủ phức tạp để cần spec riêng, tách thêm file mới trong `docs/services/` (ví dụ `docs/services/economy-service.md`) và thêm dòng vào bảng mục lục trên — không nhét thêm vào file mục số đang có.
- Đây là tài liệu sống — khi phát hiện sai/thiếu trong lúc code thật, sửa trực tiếp vào file tương ứng, không chỉ sửa trong hội thoại chat rồi để trôi mất.

---

[Tiếp: 01 · Product Features →](./01-product-features.md)
