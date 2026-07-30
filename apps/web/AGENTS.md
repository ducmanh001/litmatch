# apps/web — hướng dẫn theo scope

Đọc `../../AGENTS.md` + `../../docs/12-frontend-architecture.md` +
`../../docs/13-frontend-coding-standards.md` trước. File này CHỈ chứa delta riêng của web
(docs/12 § 12.10) — không lặp lại luật chung.

## Chạy

```bash
pnpm nx dev web          # dev server http://localhost:4300 (cần core-api local đang chạy)
pnpm nx test web         # Vitest + Testing Library
pnpm nx build web        # next build (NODE_ENV=production ép trong project.json —
                         #   .env gốc repo có NODE_ENV=development, không được để lọt vào build)
pnpm nx lint web
```

Env: copy `.env.example` → `.env.local` (đã có sẵn cho local). Đọc env chỉ qua
`src/shared/env.ts`; Next inline `NEXT_PUBLIC_*` theo tên literal — không đọc động.

## Route map hiện có

| Route                                                                    | Nhóm       | Ghi chú                                                    |
| ------------------------------------------------------------------------ | ---------- | ---------------------------------------------------------- |
| `/`                                                                      | `(public)` | Landing SSR/SEO — header + footer marketing                |
| `/login`                                                                 | —          | OTP 2 bước, redirect `/home` sau login                     |
| `/home`                                                                  | `(app)`    | Sau `AuthGate`; layout connect realtime khi mount          |
| `/feed`, `/feed/[postId]`                                                | `(app)`    | Bảng tin: đăng bài, like, comment (module Feed)            |
| `/matching`, `/matching/soul/[sessionId]`, `/matching/voice/[sessionId]` | `(app)`    | Ghép đôi Soul/Voice Match                                  |
| `/friends`, `/chat/[friendUserId]`                                       | `(app)`    | Danh sách bạn bè + chat 1-1                                |
| `/party`, `/party/[roomId]`                                              | `(app)`    | Party Room                                                 |
| `/discovery`                                                             | `(app)`    | Browse/Nearby + direct match invite                        |
| `/movie-match`, `/movie-match/[sessionId]`                               | `(app)`    | Movie session giữa hai user đã là bạn                      |
| `/palm-match`                                                            | `(app)`    | Palm entertainment flow                                    |
| `/video`                                                                 | `(app)`    | Short-video reel                                           |
| `/wallet`                                                                | `(app)`    | Số dư Diamond + payOS khi runtime capability bật + mua VIP |
| `/profile`, `/profile/edit`, `/users/[id]`                               | `(app)`    | Hồ sơ của mình/chỉnh sửa/public profile                    |
| `/more`                                                                  | `(app)`    | Entry point cho settings/support surface                   |
| `/help`, `/privacy`                                                      | `(public)` | Trang thông tin công khai                                  |

`(public)` = SSR/SEO; `(app)` = client-heavy sau login. Route handler bị cấm
(docs/12 § 12.5) — thư mục `app/api/` không được tồn tại.

## Delta riêng web

- Realtime: 1 socket duy nhất qua `shared/realtime/socket.ts`
  (`connectRealtime`/`subscribeRealtime`/`onReconnected`) — component không tự `io()`.
  Sau reconnect PHẢI invalidate query liên quan (socket là kênh delta).
- Media: LiveKit chỉ qua `shared/media/livekit.ts`; token mint từ core-api.
- Analytics privacy/cost: `shared/analytics/product-analytics.ts` chỉ được khởi tạo sau
  cookie consent hợp lệ; autocapture và Session Replay phải giữ tắt, không được bật
  `opt_in_capturing()` sớm, và mọi thay đổi kiểu này phải cập nhật runbook PostHog.
- Capability: login/top-up/provider readiness lấy từ `GET /api/v1/capabilities`; CTA unavailable
  vẫn hiện và chỉ trình bày message server, không gọi action API.
- `AuthGate` chờ mount mới quyết định (server snapshot luôn unauthenticated) — component
  trong `(app)` phải chịu được first render chưa có session.
- Feature mới: thư mục `src/features/<tên>/` + route trong `(app)/` gọi vào — đúng bảng
  vị trí docs/13 § 13.3.
