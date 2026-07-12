# apps/admin — hướng dẫn theo scope

Đọc `../../AGENTS.md` + `../../docs/12-frontend-architecture.md` +
`../../docs/13-frontend-coding-standards.md` trước. File này CHỈ chứa delta riêng của admin
(docs/12 § 12.10) — không lặp lại luật chung.

## Chạy

```bash
pnpm nx dev admin        # dev server http://localhost:4200 (cần core-api local đang chạy)
pnpm nx test admin       # Vitest + Testing Library
pnpm nx build admin      # build production → dist/apps/admin
pnpm nx lint admin
```

Env: copy `.env.example` → `.env.local` (đã có sẵn cho local). Đọc env chỉ qua
`src/shared/env.ts` — guard chặn chỗ khác.

## Route map hiện có

| Route    | Ghi chú                                                              |
| -------- | -------------------------------------------------------------------- |
| `/login` | OTP 2 bước (phone → code), redirect về trang trước đó sau login      |
| `/`      | Dashboard placeholder trong `AppShell` (sidebar) — sau `RequireAuth` |

Nav sidebar khai tại `src/app/app-shell.tsx` (`NAV_ITEMS`); users/moderation/economy/gifts
là placeholder — thêm route thật vào `src/app/router.tsx` khi làm feature.

## Delta riêng admin

- Error state BẮT BUỘC hiện `code` + `traceId` (ops tra log) — dùng `ErrorState` của
  `shared/ui/states.tsx`, không tự chế.
- UI primitives kiểu shadcn đặt tại `shared/ui/` (button, input, field, card, states) —
  generate/sửa tại chỗ, không tạo lib chung với web.
- Chưa có role admin ở backend (docs/12 § 12.7 Task 0 chưa làm): `RequireAuth` mới chặn
  đăng nhập, CHƯA chặn role. Khi Task 0 xong: đọc role từ `AccessTokenPayload`
  (`@litmatch/common-dtos/pure`) trong guard này.
