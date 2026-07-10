# 00. Tổng quan & Mục lục

Đây là bộ tài liệu thiết kế cho hệ thống kiểu Litmatch — quy mô lớn thật (không phải MVP), dùng làm nguồn sự thật duy nhất khi build bằng Claude Code. Bộ docs này kế thừa và mở rộng từ 1 file spec gộp chung trước đó (không nằm trong repo này), tách ra để mỗi phiên làm việc chỉ nạp đúng phần cần thiết thay vì cả nghìn dòng.

**Nếu là agent (Claude Code) mới bắt đầu 1 session**: đã đọc `/CLAUDE.md` ở root trước rồi mới tới đây. Nếu chưa, đọc `/CLAUDE.md` trước — file đó là hợp đồng hành vi bắt buộc, ngắn gọn; các file trong `docs/` này là phần chi tiết mà `/CLAUDE.md` trỏ tới.

## Mục lục — mục số ↔ file (giữ nguyên số mục cũ để mọi tham chiếu "mục X.Y" ở bất kỳ đâu vẫn tìm đúng)

| Mục | File | Nội dung |
|---|---|---|
| 1 | [01-product-features.md](./01-product-features.md) | Danh sách tính năng thật của Litmatch |
| 2 | [02-domain-model.md](./02-domain-model.md) | Domain Model tổng thể (entity chính) |
| 3 | [03-architecture.md](./03-architecture.md) | Kiến trúc: modular monolith, 3.1-3.7 nền tảng, **3.8 = quyết định thiết kế cho quy mô lớn (SFU, shard matching, ledger)** |
| 4 | [04-tech-stack.md](./04-tech-stack.md) | Tech stack đề xuất |
| 5 | [05-coding-standards.md](./05-coding-standards.md) | Coding standard NestJS + cấu trúc thư mục |
| 6 | [06-domain-rules.md](./06-domain-rules.md) | Domain rules bắt buộc (đừng để agent tự đoán) |
| 7 | [07-roadmap.md](./07-roadmap.md) | Checklist triển khai theo giai đoạn (Giai đoạn 0-7) |
| 8 | [08-working-with-claude-code.md](./08-working-with-claude-code.md) | Quy trình làm việc với Claude Code trên repo này |
| 9 | [09-practical-notes.md](./09-practical-notes.md) | Lưu ý thực tế, tránh vỡ trận giữa đường |
| 10 | [10-code-review-checklist.md](./10-code-review-checklist.md) | **Checklist review code — 10.0 phương pháp luận lỗi logic nghiệp vụ, 10.1 lỗi chung, 10.2 lỗi đặc thù từng domain, 10.3 cách áp dụng** |
| — | [sources.md](./sources.md) | Nguồn tham khảo đã dùng để nghiên cứu bộ docs này |

## Đường dẫn đọc gợi ý theo tình huống

- **Mới vào dự án / chưa code gì**: đọc theo thứ tự 1 → 10 một lượt (khoảng 15-20 phút), đúng như file spec gốc dự định.
- **Bắt đầu 1 giai đoạn mới trong roadmap**: đọc `07-roadmap.md` (mục đang làm) + file mục tương ứng nếu giai đoạn đó động tới kiến trúc/domain rule mới.
- **Sắp merge 1 PR / vừa viết xong 1 module**: bắt buộc đọc `10-code-review-checklist.md`, chạy qua § 10.0 trước khi đọc lại code.
- **Không chắc 1 quyết định kiến trúc có đúng không**: đọc `03-architecture.md`, đặc biệt § 3.8 nếu liên quan tới SFU/matching scale/ledger.

## Quy ước khi sửa bộ docs này

- Giữ nguyên số mục (1-10) khi có thể — nhiều chỗ trong code/comment/PR description có thể đã tham chiếu "mục 3.8.A", "mục 10.2"... đổi số mục sẽ làm các tham chiếu đó sai.
- Khi 1 file phình quá dài (>250-300 dòng) hoặc 1 service đủ phức tạp để cần spec riêng, tách thêm file mới trong `docs/services/` (ví dụ `docs/services/economy-service.md`) và thêm dòng vào bảng mục lục trên — không nhét thêm vào file mục số đang có.
- Đây là tài liệu sống — khi phát hiện sai/thiếu trong lúc code thật, sửa trực tiếp vào file tương ứng, không chỉ sửa trong hội thoại chat rồi để trôi mất.

---
[Tiếp: 01 · Product Features →](./01-product-features.md)
