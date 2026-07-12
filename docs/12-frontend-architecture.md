[← 11 · Engineering Principles](./11-engineering-principles.md) · **12 · Frontend Architecture** · [13 · Frontend Coding Standards →](./13-frontend-coding-standards.md)

# 12 · Kiến trúc Frontend — admin (Vite + React) và web (Next.js)

Tài liệu này là **khung triển khai + quy tắc bắt buộc** cho hai app frontend. Mọi agent nhận
task frontend phải đọc hết file này trước khi scaffold. Quy tắc ở đây có hiệu lực ngang
`AGENTS.md`; xung đột thì `AGENTS.md` thắng.

## 12.1 Phạm vi và quan hệ với Luật 1

Luật 1 trong `AGENTS.md` ("chỉ 3 thành phần deploy riêng") nói về **backend domain service** —
không tự tạo app NestJS thứ 4. `apps/admin` và `apps/web` là **client** gọi API, không sở hữu
domain logic hay dữ liệu, nên không vi phạm luật đó. Hệ quả bắt buộc:

- Frontend **không bao giờ** chứa business logic quyết định tiền/matching/trust. Mọi enforcement
  thật nằm ở core-api; UI chỉ phản ánh kết quả.
- Next.js server code (RSC, route handler) **chỉ để render/SEO**. Không gọi DB, không giữ secret
  nghiệp vụ, không làm BFF tổng hợp dữ liệu. Nguồn dữ liệu duy nhất là core-api.

## 12.2 Vị trí trong monorepo

```text
apps/
  core-api/            (đã có — NestJS)
  signaling-gateway/   (đã có — Socket.IO)
  media-server/        (đã có — LiveKit)
  admin/               (MỚI — Vite + React SPA, tool nội bộ)
  web/                 (MỚI — Next.js App Router, end-user)
libs/
  common-dtos/         (đã có — hợp đồng chung)
  api-client/          (MỚI — typed client generate từ OpenAPI)
openapi/
  core-api.json        (MỚI — spec emit từ Swagger, commit vào repo)
```

Nx plugin cần thêm (cùng major 23 với plugin hiện có): `@nx/react`, `@nx/vite`, `@nx/next`.

## 12.3 Hợp đồng API — một nguồn sự thật

core-api đã có `SwaggerModule`. Luồng hợp đồng:

1. `pnpm openapi:emit` — bootstrap Nest app rồi ghi spec ra `openapi/core-api.json`
   (cần hạ tầng local `docker compose` đang chạy vì AppModule kết nối lúc init). Spec được
   **bọc envelope `{ data, meta? }` cho mọi response 2xx** ngay lúc emit
   (`apps/core-api/src/app/openapi.ts`) — mirror `ResponseEnvelopeInterceptor` để spec và
   type codegen nói đúng hình dạng body thật.
2. `pnpm openapi:gen` — chạy `openapi-typescript` sinh type vào
   `libs/api-client/src/generated/` (file generate, **cấm sửa tay**).
3. `libs/api-client/src/index.ts` — wrapper mỏng trên `openapi-fetch`:
   `createApiClient({ baseUrl, tokenStore, onSessionExpired })` + `createTokenStore`.
   Framework-agnostic, không import React/Next.

Quy tắc:

- **Mọi REST call từ frontend đi qua `libs/api-client`.** Không viết `fetch`/`axios` tay cho
  endpoint của core-api.
- Đổi API ở backend → chạy emit + gen **trong cùng PR**; CI/reviewer coi diff `openapi/` và
  `generated/` là bằng chứng hợp đồng đổi.
- `libs/common-dtos`: frontend import qua entry **`@litmatch/common-dtos/pure`**
  (re-export `api-response.ts`, `auth-token.ts`, `realtime-events.ts` — thuần TypeScript).
  **Cấm import entry chính** — kéo `class-validator`/Nest vào bundle (guard + lint chặn).
  Cần type pagination thì lấy từ api-client generated.

## 12.4 apps/admin — Vite + React SPA

Tool nội bộ CRUD-heavy, không cần SSR/SEO.

**Stack chốt**: React Router (data router), TanStack Query (server state), React Hook Form +
Zod (form), shadcn/ui + Tailwind (UI), Zustand chỉ khi state client vượt quá component
(không Redux).

```text
apps/admin/
  index.html
  vite.config.ts
  project.json
  src/
    main.tsx
    app/
      router.tsx          # route tree, lazy() theo feature
      providers.tsx       # QueryClientProvider, AuthProvider, Toaster
    features/             # soi gương module backend, mỗi feature tự đóng gói
      users/              #   api.ts (hooks trên api-client) + components/ + pages/
      moderation/         #   queue Report/Block
      economy/            #   ops: refund, VIP plan — CHỈ gọi endpoint admin, không tính toán
      gifts/              #   catalog CRUD
    shared/
      auth/               # token store, login page, RequireRole route guard
      ui/                 # shadcn components (generate tại chỗ, không lib chung)
      lib/
```

- Route guard theo `role` trong `AccessTokenPayload`; **ẩn UI không phải bảo mật** — backend
  guard mới là chốt chặn, frontend chỉ đỡ UX.
- Feature mới = thư mục mới trong `features/`, không nhét chéo. Feature không import lẫn nhau;
  cần chung thì đưa xuống `shared/`.

## 12.5 apps/web — Next.js App Router

**Stack chốt**: Next.js App Router, TanStack Query cho phần sau login, `socket.io-client`
(realtime), `livekit-client` (Party Room/Calling), Tailwind.

```text
apps/web/
  next.config.js
  project.json
  src/
    app/
      (public)/           # landing, about — SSR/SSG, SEO
      (app)/              # sau login — client component là chính
        matching/
        chat/
        party/[roomId]/
      layout.tsx
    features/             # cùng triết lý với admin
    shared/
      auth/               # token store + refresh rotation, dùng chung logic với api-client
      realtime/           # socket wrapper: connect signaling-gateway, typed theo
                          #   realtime-events.ts của common-dtos — cấm string event tự chế
      media/              # livekit-client wrapper; token mint từ core-api y như mobile
```

Ranh giới server/client trong Next:

- `(public)` được SSR/SSG; `(app)` mặc định client component, data qua TanStack Query.
- Route handler duy nhất được phép: adapter auth mỏng (nhận token từ core-api, set cookie)
  **nếu** chọn nâng cấp cookie ở 12.6 — ngoài ra không có route handler nào khác.

## 12.6 Auth — quyết định chốt

- Cả 2 app dùng **đúng JWT flow của core-api** (phone OTP + social login), không hệ auth riêng.
- V1: access token giữ **in-memory**, refresh token trong `localStorage`, rotation y hệt
  mobile. Chấp nhận trade-off XSS để không phải sửa backend; ghi rõ đây là quyết định có chủ đích.
- Nâng cấp sau (khi có nhu cầu thật): refresh token sang httpOnly cookie — cần backend hỗ trợ
  cookie mode, làm thành task riêng qua `review-module`, không tiện tay làm trong PR scaffold.

## 12.7 Việc backend phải xong TRƯỚC (Task 0 — không giao cho agent frontend)

Làm trong core-api theo đúng quy trình `AGENTS.md` (đây là thay đổi Auth → bắt buộc
`review-module` plan/verify):

1. **Role**: enum `user | moderator | admin` trên `User` (migration, default `user`), đưa
   `role` vào `AccessTokenPayload` (cập nhật `libs/common-dtos/src/lib/auth-token.ts`),
   `@Roles()` decorator + `RolesGuard`. Seed admin đầu tiên bằng script/env, không hardcode.
2. **Admin endpoints**: prefix `/admin/*`, guard role, chỉ expose những gì admin panel V1 cần
   (users, report/block queue, refund, VIP plan, gift catalog).
3. **CORS**: config-driven qua env `CORS_ORIGINS` (danh sách origin, có validation), cập nhật
   `.env.example`. Không `origin: true`.
4. **`pnpm openapi:emit`** như 12.3, commit spec đầu tiên.

## 12.8 Thứ tự triển khai

| Bước | Việc                                                     | Ai                         |
| ---- | -------------------------------------------------------- | -------------------------- |
| 0    | Task 0 backend (12.7)                                    | agent backend, repo này    |
| 1    | `libs/api-client` + scripts openapi                      | agent backend hoặc FE lead |
| 2a   | Scaffold `apps/admin` + auth + users/moderation          | agent FE (song song 2b)    |
| 2b   | Scaffold `apps/web` + auth + (public) landing            | agent FE (song song 2a)    |
| 3    | admin: economy ops, gift catalog · web: realtime + media | agent FE                   |

Bước 2a/2b độc lập hoàn toàn (khác thư mục, khác app) — chạy song song được.

## 12.9 Quy tắc bắt buộc cho agent frontend

1. **Không sửa backend.** Ngoại lệ duy nhất: file được task liệt kê sẵn. Thiếu endpoint →
   dừng, báo lại, không tự thêm vào core-api.
2. Không import từ `apps/core-api/**`. Chỉ `libs/api-client` và 2 file thuần của
   `common-dtos` (12.3).
3. Mọi REST call qua api-client; mọi realtime event qua constants/types của
   `realtime-events.ts`.
4. Không hardcode URL/port/threshold — env (`VITE_*`, `NEXT_PUBLIC_*`), cập nhật
   `.env.example` của app.
5. Server state = TanStack Query; không tự viết cache/polling tay. Client state = component
   state trước, Zustand khi thật cần, không Redux.
6. Không tạo `libs/ui` dùng chung hay abstraction "để dành" — hai app tự giữ UI của mình.
   Mở lib dùng chung mới là quyết định kiến trúc: cập nhật doc này trước rồi mới code, không
   tự quyết trong PR feature.
7. Next server code: chỉ render/SEO (12.1, 12.5). Secret không bao giờ vào `NEXT_PUBLIC_*`.
8. Form phải validate bằng Zod schema; message lỗi từ backend hiển thị nguyên vẹn, không nuốt.
9. Trước khi báo xong: `pnpm format:check`, `pnpm lint`, `pnpm build` (affected) pass; app
   chạy được bằng lệnh serve của Nx và đăng nhập được với backend local.
10. Phát hiện docs/spec sai trong lúc làm → sửa docs trong cùng thay đổi, như luật chung.

## 12.10 Phân tầng tài liệu FE — chung 1 bộ core, mỗi app chỉ giữ delta

- **Bộ core dùng chung cho cả admin lẫn web**: file này (kiến trúc/boundary) +
  [13-frontend-coding-standards.md](./13-frontend-coding-standards.md) (convention). KHÔNG
  tách thành "chuẩn riêng của admin" và "chuẩn riêng của web" — 2 bộ chuẩn song song sẽ lệch
  nhau dần và agent không biết tin bản nào (đúng bệnh mà § 5.1 backend đã cấm).
- **Mỗi app có 1 file `apps/<app>/AGENTS.md`** (tạo trong PR scaffold), chỉ chứa **delta**
  riêng của app đó: lệnh chạy/dev/test, route map hiện có, quyết định chỉ áp cho app này
  (vd admin hiện traceId trong error state, web có nhóm route `(public)`/`(app)`). File này
  link về 12 + 13, **không copy lại luật chung** — copy là tạo bản thứ 2 để lệch.
- Chuẩn mới phát sinh khi code thật: mặc định thêm vào 13 (áp cả 2 app); chỉ khi thật sự
  đặc thù 1 app mới ghi vào `AGENTS.md` của app đó.

## 12.11 Definition of done cho scaffold V1

- `nx serve admin` / `nx serve web` chạy, login flow hoạt động với core-api local.
- admin: xem danh sách user + queue report (read trước, mutation sau).
- web: landing SSR + đăng nhập + màn hình matching gọi được API.
- Không có `fetch` tay, không có string event tự chế, không secret trong bundle
  (`grep` bundle output là bằng chứng).
