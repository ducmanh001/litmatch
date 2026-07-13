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

| Route         | Ghi chú                                                                        |
| ------------- | ------------------------------------------------------------------------------ |
| `/login`      | OTP 2 bước (phone → code), redirect về trang trước đó sau login                |
| `/`           | Dashboard placeholder trong `AppShell` (sidebar) — sau `RequireAuth`           |
| `/users`      | Danh sách user — lọc status/nickname, ban/unban (`features/users/`)            |
| `/moderation` | Moderation queue — lọc status report, resolve/dismiss (`features/moderation/`) |

Nav sidebar khai tại `src/app/app-shell.tsx` (`NAV_ITEMS`); economy/gifts vẫn là placeholder —
thêm route thật vào `src/app/router.tsx` khi làm feature.

## Delta riêng admin

- Error state BẮT BUỘC hiện `code` + `traceId` (ops tra log) — dùng `ErrorState` của
  `shared/ui/states.tsx`, không tự chế.
- UI primitives kiểu shadcn đặt tại `shared/ui/` (button, input, field, card, states) —
  generate/sửa tại chỗ, không tạo lib chung với web.
- Task 0 backend đã xong (docs/12 § 12.7): `RequireAuth` (`shared/auth/require-auth.tsx`) đọc
  role từ JWT qua `shared/auth/use-role.ts` (`decode-access-token.ts` giải mã payload thuần,
  KHÔNG gọi backend). Chỉ chặn khi role đọc được rõ ràng là `user` (hiện `NotStaffState`) — token
  không giải mã được thì cho qua, vì guard này chỉ là UX, chốt bảo mật thật là `RolesGuard` ở
  core-api.
