[← 07 · Roadmap](./07-roadmap.md) · **08 · Working with Claude Code** · [09 · Practical Notes →](./09-practical-notes.md)

# 8. Cách làm việc với Claude Code trên repo này

> Cập nhật so với bản spec gốc 1-file: giờ repo có `/CLAUDE.md` ở root — Claude Code tự đọc file đó ở đầu mỗi session, không cần dán lại toàn bộ spec mỗi lần. File này chỉ ghi thêm quy trình làm việc, không lặp lại nội dung đã có trong CLAUDE.md.

## 8.1 Prompt mở đầu gợi ý (Giai đoạn 0)

> "Đọc `/CLAUDE.md` ở root và toàn bộ `docs/`. Bắt đầu Giai đoạn 0 theo `07-roadmap.md`: khởi tạo monorepo Nx với 3 app (`core-api`, `signaling-gateway`, `media-server`) đúng `03-architecture.md` § 3.2, setup docker-compose cho Postgres/Redis/Kafka, tạo shared library `common-exceptions`, `logger`, `config-validator` theo đúng `05-coding-standards.md`. Sau khi xong, dừng lại để tôi review trước khi sang bước tiếp theo."

## 8.2 Nguyên tắc làm việc cho dự án dài hơi này

- Giao **từng giai đoạn nhỏ** theo đúng thứ tự ở `07-roadmap.md`, review xong mới sang tiếp — không để agent tự ý nhảy cóc nhiều giai đoạn trong 1 lần.
- Yêu cầu viết test song song với feature, không dồn cuối.
- Sau khi xong 1 module, yêu cầu agent tự chấm lại theo `10-code-review-checklist.md` (đặc biệt mục 10.0 — phương pháp luận review logic nghiệp vụ) **trước khi** báo "xong" — đây là bước bắt buộc, ghi rõ trong `/CLAUDE.md`. Bước này đã được script hoá thành skill **`/review-module`** (`.claude/skills/review-module/`) với output template cố định: chạy `/review-module plan <module>` **trước khi code** (liệt kê luồng + giả định) và `/review-module verify <module>` trước khi báo xong; output verify dán thẳng vào PR template (`.github/PULL_REQUEST_TEMPLATE.md`).
- Các luật phải chặn tuyệt đối (app thứ 4, `synchronize: true`, sửa migration đã commit, UPDATE/DELETE `ledger_entries`) đã có **hook chặn cứng** tại `.claude/hooks/pre-tool-guard.mjs` (đăng ký trong `.claude/settings.json`) — hook chặn theo pattern chắc chắn vi phạm; bị chặn oan thì báo user, không tìm cách lách.
- Bắt đầu module/domain mới: dùng skill **`/new-module`** — thứ tự sinh file cố định theo `05-coding-standards.md § 5.3` + các mảnh khung dùng chung (BaseAppEntity, `@IdempotencyKey()`, cursor pagination). Hook **SessionStart** (`.claude/hooks/session-start.mjs`) tự in vị trí roadmap hiện tại đầu mỗi phiên — không cần dò lại "đang ở đâu".
- Khi bắt đầu 1 giai đoạn/module mới, nhắc agent đọc đúng file `xx-....md` liên quan thay vì dựa vào trí nhớ từ session trước (mỗi session Claude Code bắt đầu với context rỗng, chỉ có `/CLAUDE.md` + auto-memory được nạp sẵn).
- Khi 1 service đã đủ phức tạp để cần spec riêng (ví dụ đi sâu API contract của Economy hay Matching), tạo thêm file `services/economy-service.md`, `services/matching-service.md`... — chưa cần viết trước vì chưa có đủ quyết định chi tiết (schema, API contract) để đặc tả chính xác; viết khi thực sự bắt đầu code sâu phần đó, để tránh đặc tả sai rồi phải sửa.
- Tick `[x]` trong `07-roadmap.md` khi xong 1 mục, commit cùng code — để phiên làm việc sau (con người hoặc agent) biết chính xác đang ở đâu mà không cần hỏi lại.

---
[← 07 · Roadmap](./07-roadmap.md) · [09 · Practical Notes →](./09-practical-notes.md)
