# core-api — hướng dẫn theo scope

Đọc `../../AGENTS.md` trước. `core-api` là modular monolith duy nhất chứa business logic.

- Module gọi nhau qua NestJS DI trong cùng process; không dựng REST/gRPC nội bộ.
- Module chỉ export public API qua `index.ts`; không import nội tạng module khác.
- Cấu trúc module theo `../../docs/05-coding-standards.md § 5.3`.
- Thay đổi Economy bắt buộc review theo `../../docs/10-code-review-checklist.md` và chạy
  integration test trên Postgres thật.
- Giao tiếp với Signaling Gateway/Media Server qua internal API theo
  `../../docs/03-architecture.md § 3.7`.
