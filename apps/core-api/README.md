# Core API

NestJS modular monolith duy nhất sở hữu business logic, PostgreSQL entities/migrations và REST
contract. Domain mới bắt đầu là module tại `src/modules/<domain>`; không tạo app/backend riêng.

## Boundary

- Module giao tiếp qua public API/NestJS DI; không import entity/repository nội bộ của module khác.
- Signaling chỉ nhận delta sau decision/commit; media control đi qua LiveKit port trong Core.
- Economy giữ ledger double-entry append-only và transaction idempotency.

Danh sách 21 module và spec/test evidence: [service/module catalog](../../docs/services/README.md).
Kiến trúc: [docs/03](../../docs/03-architecture.md). Quy tắc cục bộ bắt buộc:
[AGENTS.md](./AGENTS.md).

## Commands

```bash
pnpm nx serve core-api
pnpm nx test core-api
pnpm nx lint core-api
pnpm nx build core-api
pnpm nx show project core-api --json
```

Database/contract:

```bash
pnpm db:status
pnpm db:migrate
pnpm openapi:emit
pnpm openapi:check
```

Không dùng `synchronize: true`; migration đã commit không được sửa. Business flow nhạy cảm chạy
`pnpm agent:verify <scope>` và `review-module verify` theo root contract.
