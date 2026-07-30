# Admin

Vite + React operations console cho dashboard, user, moderation, Economy, gift, room, config và
permission workflows. Backend guard và DB permission là security authority; frontend role check chỉ
hỗ trợ UX.

```bash
pnpm nx dev admin
pnpm nx test admin
pnpm nx lint admin
pnpm nx build admin
pnpm nx show project admin --json
```

Copy `.env.example` thành `.env.local` khi chạy trực tiếp trên host. REST phải đi qua
`@litmatch/api-client`; provider readiness lấy từ `/api/v1/capabilities`.

Route map và delta bắt buộc nằm ở [AGENTS.md](./AGENTS.md). Đọc thêm
[frontend architecture](../../docs/12-frontend-architecture.md),
[frontend standards](../../docs/13-frontend-coding-standards.md) và
[visual reference policy](../../layouts/README.md).
