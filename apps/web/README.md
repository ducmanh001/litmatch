# Web

Next.js client cho end user: auth, feed, matching, friend chat, Party Room, wallet, profile,
discovery và content flows. Frontend không sở hữu business logic, price, permission, quota hoặc
state machine.

```bash
pnpm nx dev web
pnpm nx test web
pnpm nx lint web
pnpm nx build web
pnpm nx e2e web
pnpm nx show project web --json
```

Copy `.env.example` thành `.env.local` khi chạy trực tiếp trên host. REST đi qua generated
`@litmatch/api-client`; một realtime socket và một LiveKit adapter được sở hữu ở `src/shared`.
Runtime availability lấy từ `/api/v1/capabilities`, không suy từ build env.

Route map và delta bắt buộc: [AGENTS.md](./AGENTS.md). Kiến trúc/standard:
[docs/12](../../docs/12-frontend-architecture.md), [docs/13](../../docs/13-frontend-coding-standards.md).
HTML trong [`layouts/`](../../layouts/README.md) chỉ là visual reference.
