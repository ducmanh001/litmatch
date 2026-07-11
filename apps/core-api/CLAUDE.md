<!-- Claude Code đọc file này CÙNG VỚI CLAUDE.md ở root khi làm việc trong apps/core-api (Claude Code duyệt cây thư mục từ nơi đang làm việc lên tới root, gộp tất cả CLAUDE.md tìm thấy). -->

# apps/core-api — ghi chú riêng

`core-api` là **modular monolith duy nhất** chứa toàn bộ business logic: `auth/ user/ matching/ economy/ social/ content/ moderation/ notification/ gift/` (và các module khác theo `../../docs/07-roadmap.md`). Xem `../../docs/03-architecture.md § 3.2` cho sơ đồ đầy đủ.

## Riêng cho app này

- **Giữa các module trong `core-api`**: gọi thẳng qua NestJS Dependency Injection (function call cùng process). KHÔNG dựng REST/gRPC nội bộ giữa các module ở đây — đó là việc dành cho khi 1 module thực sự tách ra service riêng (`../../docs/03-architecture.md § 3.4`).
- **Module hoá nghiêm ngặt**: mỗi module chỉ export qua interface rõ ràng, không import chéo trực tiếp vào file nội bộ của module khác. Có ArchUnit-style test chặn import chéo trái phép (xem `../../docs/03-architecture.md § 3.2`).
- **Cấu trúc 1 module**: theo đúng khung ở `../../docs/05-coding-standards.md § 5.3` (`*.controller.ts / *.service.ts / *.module.ts / dto/ / entities/ / events/`).
- **Economy module là module nhạy cảm nhất trong app này** — mọi thay đổi liên quan `ledger.service.ts` bắt buộc tự review theo `../../docs/10-code-review-checklist.md § Economy/Wallet/Ledger` trước khi báo xong.
- **Giao tiếp ra ngoài `core-api`** (tới Signaling Gateway / Media Server): qua internal API (REST/gRPC nội bộ), không public ra internet. Xem `../../docs/03-architecture.md § 3.7`.
