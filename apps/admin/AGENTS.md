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

| Route          | Ghi chú                                                                                                                             |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `/login`       | OTP 2 bước (phone → code), redirect về trang trước đó sau login                                                                     |
| `/`            | Dashboard — stat card + chart + "Phòng đang live" + audit log gần đây, toàn bộ `GET /admin/dashboard` thật (`features/dashboard/`)  |
| `/users`       | Danh sách user — lọc status/nickname, ban/unban, modal hồ sơ (`features/users/`)                                                    |
| `/moderation`  | Report/support + video pending/published; approve/reject/remove qua admin API (`features/moderation/`)                              |
| `/gifts`       | Gift catalog — tạo quà mới, sửa giá, bật/tắt (`features/gifts/`)                                                                    |
| `/economy`     | Tra ví + lịch sử giao dịch theo user ID, hoàn tiền thủ công (`features/economy/`)                                                   |
| `/rooms`       | Party Room active + member count qua `GET /admin/rooms`; force-close có audit qua `POST /admin/rooms/:id/close` (`features/rooms/`) |
| `/config`      | Catalog Diamond/VIP (bật/tắt) + soạn thông báo broadcast — `/admin/config/*`, `/admin/notifications/broadcast` (`features/config/`) |
| `/permissions` | Ma trận quyền theo role + danh sách staff (đổi role) — `/admin/permissions/*`, `/admin/staff/*` (`features/permissions/`)           |

Nav sidebar khai tại `src/app/app-shell.tsx` (`NAV_ITEMS`). HTML
`layouts/admins/litmatch-admin-dashboard (2).html` chỉ là visual reference theo
`../../layouts/README.md`; route source/OpenAPI/docs/12 thắng khi mockup mâu thuẫn. Backlog có
trigger hiện hành nằm ở `../../docs/07-roadmap.md`, không copy vào file này.

## Delta riêng admin

- Error state BẮT BUỘC hiện `code` + `traceId` (ops tra log) — dùng `ErrorState` của
  `shared/ui/states.tsx`, không tự chế.
- UI primitives kiểu shadcn đặt tại `shared/ui/` (button, input, field, card, states, modal,
  toast-stack, tabs, pill, stat-card, donut-chart, line-chart, toggle-switch, theme-slider) —
  generate/sửa tại chỗ, không tạo lib chung với web.
- Theme: 4 tổ hợp Cyan/Ấm × Tối/Sáng bằng 2 class độc lập `.theme-warm`/`.light` trên `<html>`
  (token khai ở `src/styles.css`), state singleton ở `shared/lib/theme-store.ts` (cùng idiom
  `tokenStore`/`useSyncExternalStore`, không phải React context). Chặn flash bằng inline script
  trong `index.html` (đọc cùng key localStorage `litmatch-admin-theme` trước khi React mount —
  Vite không có head-injection point như Next `theme-script.ts` của `apps/web`).
- Toast: `shared/lib/toast-store.ts` (cùng idiom singleton) + `showToast()` gọi từ bất kỳ đâu,
  `<ToastStack/>` mount 1 lần ở `app-shell.tsx`. Dùng cho phản hồi mutation (ban/unban, resolve/
  dismiss, refund, toggle gift...) thay vì chỉ inline error.
- Login provider readiness lấy từ `GET /api/v1/capabilities`; nút unavailable vẫn hiện, khi bấm
  chỉ toast message server và không gọi action API. Build env auth chỉ là rolling-deploy fallback.
- `config`/`permissions` từng là demo tĩnh lúc mới redesign; nay đã nối backend thật (catalog
  toggle, broadcast, permission matrix, staff role) — không còn `DemoPill`/state cục bộ giả lập.
- Task 0 backend đã xong (docs/12 § 12.7): `RequireAuth` (`shared/auth/require-auth.tsx`) đọc
  role từ JWT qua `shared/auth/use-role.ts` (`decode-access-token.ts` giải mã payload thuần,
  KHÔNG gọi backend). Chỉ chặn khi role đọc được rõ ràng là `user` (hiện `NotStaffState`) — token
  không giải mã được thì cho qua, vì guard này chỉ là UX, chốt bảo mật thật là `RolesGuard` ở
  core-api.
