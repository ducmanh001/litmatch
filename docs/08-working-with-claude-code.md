[← 07 · Roadmap](./07-roadmap.md) · **08 · Working with Claude Code** · [09 · Practical Notes →](./09-practical-notes.md)

# 8. Cách làm việc với Claude Code trên repo này

> Cập nhật so với bản spec gốc 1-file: giờ repo có `/CLAUDE.md` ở root — Claude Code tự đọc file đó ở đầu mỗi session, không cần dán lại toàn bộ spec mỗi lần. File này chỉ ghi thêm quy trình làm việc, không lặp lại nội dung đã có trong CLAUDE.md.

## 8.1 Prompt mở đầu gợi ý (trạng thái hiện tại)

> "Đọc `/CLAUDE.md`, `docs/07-roadmap.md`, `docs/11-nfr-and-production-readiness.md` và service spec liên quan. Chọn đúng 1 task mở R-004/R-005/R-006b/R-007/R-008, nêu acceptance/evidence trước khi sửa code, giữ nguyên boundary ở `docs/03-architecture.md`, rồi tự review theo docs/10 trước khi báo xong. Không gọi implementation là production-ready nếu provider/load/safety/DR gate chưa pass."

## 8.2 Nguyên tắc làm việc cho dự án dài hơi này

- Giao từng task ID/slice nhỏ theo dependency trong `07-roadmap.md`; review/evidence xong mới sang task phụ thuộc.
- Yêu cầu viết test song song với feature, không dồn cuối.
- Sau khi xong 1 module, yêu cầu agent tự chấm lại theo `10-code-review-checklist.md` (đặc biệt mục 10.0 — phương pháp luận review logic nghiệp vụ) **trước khi** báo "xong" — đây là bước bắt buộc, ghi rõ trong `/CLAUDE.md`.
- Khi bắt đầu 1 giai đoạn/module mới, nhắc agent đọc đúng file `xx-....md` liên quan thay vì dựa vào trí nhớ từ session trước (mỗi session Claude Code bắt đầu với context rỗng, chỉ có `/CLAUDE.md` + auto-memory được nạp sẵn).
- Domain high-risk (Economy/Matching/Calling/Media/Safety/Gift) phải có service spec + state/failure model **trước** slice code tiếp theo; cập nhật spec cùng code khi phát hiện khác biệt.
- Chỉ tick `[x]` cho acceptance ghi trên đúng dòng; gắn CI/provider/load/DR evidence theo `docs/11 § 11.8` thay vì ghi “đã test” bằng prose.

---
[← 07 · Roadmap](./07-roadmap.md) · [09 · Practical Notes →](./09-practical-notes.md)
