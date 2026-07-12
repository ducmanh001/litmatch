[← 11 · Engineering Principles](./11-engineering-principles.md) · **12 · Frontend Architecture** · [13 · Frontend Coding Standards →](./13-frontend-coding-standards.md)

# 12 · Kiến trúc Frontend — admin (Vite + React) và web (Next.js)

Tài liệu này mô tả **kiến trúc hiện hành và boundary lâu dài** của hai app frontend. Trạng
thái triển khai nằm ở [07-roadmap.md](./07-roadmap.md); route/current limitation của từng app
nằm trong `apps/<app>/AGENTS.md`. Thứ tự ưu tiên nguồn theo `AGENTS.md` gốc; phát hiện xung
đột thì sửa nguồn canonical, không tự chọn một bản.

## 12.1 Phạm vi và quan hệ với Luật 1

Luật 1 trong `AGENTS.md` ("chỉ 3 thành phần deploy riêng") nói về **backend domain service** —
không tự tạo app NestJS thứ tư. `apps/admin` và `apps/web` là **client** gọi API, không sở hữu
domain logic hay dữ liệu, nên không vi phạm luật đó. Hệ quả bắt buộc:

- Frontend không chứa business logic quyết định tiền, matching hoặc trust. Enforcement thật
  nằm ở core-api; UI chỉ validate format, điều phối intent và phản ánh kết quả server.
- Next.js server code chỉ render/SEO và gọi contract công khai của core-api khi thật cần cho
  render. Không gọi DB, không giữ secret nghiệp vụ và không làm BFF tổng hợp dữ liệu.
- Deep link, client tự viết hoặc UI bị sửa không được làm thay đổi quyền; backend luôn kiểm
  tra authentication, authorization, ownership và state transition.

## 12.2 Vị trí trong monorepo

```text
apps/
  core-api/            NestJS — nguồn sự thật REST/business
  signaling-gateway/   Socket.IO — realtime delta
  media-server/        LiveKit integration
  admin/               Vite + React SPA — tool nội bộ
  web/                 Next.js App Router — end-user browser
libs/
  common-dtos/         contract thuần dùng chung khi OpenAPI/event không đủ
  api-client/          typed REST client generate từ OpenAPI
openapi/
  core-api.json        spec emit từ Swagger, commit vào repo
```

Frontend không import source từ `apps/*` khác. Contract REST đi qua `api-client`; event đi
qua entry browser-safe của `common-dtos`.

## 12.3 Hợp đồng API — một nguồn sự thật

Luồng canonical là `pnpm openapi:sync`:

1. Bootstrap Nest app và emit `openapi/core-api.json` đã phản ánh global prefix/envelope.
2. Generate `libs/api-client/src/generated/core-api.ts` bằng `openapi-typescript`.
3. Format cả hai output theo chuẩn repo.

Hai lệnh thấp hơn `openapi:emit` và `openapi:gen` chỉ phục vụ debug; thay đổi API phải chạy
`openapi:sync` trong cùng PR. `openapi:check` sinh vào thư mục tạm và chỉ so sánh byte, nên
verify/CI không được làm bẩn worktree. CI kiểm cả spec lẫn generated client để không có trạng
thái một đầu mới, một đầu stale. File trong `generated/` không sửa tay.

`libs/api-client` là wrapper framework-agnostic trên `openapi-fetch`; nó sở hữu base URL,
Authorization, refresh rotation và chuẩn hóa `ApiError`. Mọi REST call từ frontend đi qua
client này, không gọi `fetch`/`axios` trực tiếp cho core-api.

`@litmatch/common-dtos/pure` là entry browser-safe cho response primitives, auth payload và
realtime events. Entry chính của `common-dtos` dành cho backend và có thể kéo decorator/runtime
backend vào bundle.

## 12.4 apps/admin — Vite + React SPA

Admin là tool nội bộ CRUD-heavy, không cần SSR/SEO.

**Stack chốt**: React Router data router, TanStack Query, React Hook Form + Zod cho form nhập
dữ liệu, shadcn/ui + Tailwind; Zustand chỉ khi client state vượt quá component/context nhỏ.

```text
apps/admin/src/
  app/                    router, providers, shell
  features/<domain>/      api, pages, components, hooks của domain
  shared/
    auth/                 session và route UX guard
    ui/                   primitives riêng admin
    lib/                  helper trung lập cấp app
    env.ts                public build-time env đã validate
```

Feature không import feature khác. Khái niệm thật sự cấp app mới đi vào `shared/`. Route guard
theo role chỉ phục vụ UX; `/admin/*` ở core-api phải có guard tương ứng.

Current route map và backend capability còn thiếu xem `apps/admin/AGENTS.md`.

## 12.5 apps/web — Next.js App Router

**Stack chốt**: Next.js App Router, TanStack Query cho server state tương tác,
`socket.io-client`, `livekit-client` và Tailwind.

```text
apps/web/src/
  app/
    (public)/             SSR/SSG/SEO
    (app)/                route sau login; vẫn là Server Component theo mặc định của Next
  features/<domain>/      client feature được route gọi vào
  shared/
    auth/                 session lifecycle
    realtime/             một Socket.IO instance
    media/                lifecycle LiveKit
    env.ts                NEXT_PUBLIC env đã validate
```

`page.tsx`/`layout.tsx` giữ Server Component khi không cần browser API. Chỉ đặt `'use client'`
tại boundary nhỏ nhất cần hook, event hoặc browser state; component client dùng TanStack Query
để lấy server state. Route handler bị cấm, ngoại trừ adapter auth mỏng nếu ADR mới chuyển sang
cookie mode.

## 12.6 Auth — lifecycle và quyết định lưu token

Cả hai app dùng đúng JWT flow của core-api, không dựng hệ auth riêng. V1 giữ access token trong
memory và refresh token trong `localStorage` theo ADR lịch sử
[0002](./adr/0002-browser-refresh-token-local-storage.md) và production gate hiện hành
[0003](./adr/0003-browser-auth-production-gate.md). Cách này chỉ hợp lệ cho scaffold/dev, chưa
được phép public production trước khi đóng security gate trong ADR 0003.

Session lifecycle bắt buộc:

```text
bootstrapping
  → không có refresh token → unauthenticated
  → có refresh token → restoring (single-flight refresh)
      → thành công → authenticated
      → thất bại/reuse/ban → clear local session → unauthenticated
authenticated
  → API 401 → refreshing một lần → retry request một lần
  → logout/session-expired/storage event → clear token + query cache + realtime → unauthenticated
```

- Protected UI và realtime **không** khởi động trước khi `restoring` kết thúc.
- Refresh rotation phải single-flight trong một tab và phối hợp giữa tab để không dùng lại cùng
  refresh token; logout/rotation ở tab khác phải làm snapshot UI hiện tại cập nhật.
- Nâng cấp sang httpOnly cookie là quyết định kiến trúc mới: thêm ADR, backend cookie mode và
  migration/rollback plan; không tiện tay đổi trong feature PR.

## 12.7 Backend capabilities frontend được phép phụ thuộc

Frontend không tự bổ sung endpoint khi task không cho phép sửa backend. Capability còn thiếu
được ghi thành task backend trong roadmap. Admin feature thật chỉ bắt đầu khi core-api có:

1. Role `user | moderator | admin` trong access-token contract và `RolesGuard`.
2. `/admin/*` endpoints tối thiểu, deny-by-default và audit hành động nhạy cảm.
3. CORS allow-list từ `CORS_ORIGINS`, có validation, không dùng `origin: true`.
4. OpenAPI response/error contract đủ để generate client, cập nhật qua `openapi:sync`.

## 12.8 Realtime và media lifecycle

Socket là kênh delta, REST/core-api là nguồn sự thật. Lifecycle chuẩn:

```text
session authenticated
  → đăng ký listener có cleanup
  → connect bằng access token hiện hành
  → nhận delta và invalidate query phù hợp
disconnect
  → giữ listener cần thiết, đánh dấu state cần resync
reconnect authenticated
  → refetch/invalidate REST ngay lập tức
  → reconcile response nền với delta đến trong lúc resync
logout/session expired
  → disconnect + remove listener + clear user-scoped cache
```

Không tháo listener trong lúc resync rồi mới nghe lại vì có thể mất delta mới. Reconnect do token
hết hạn phải đi qua session refresh một lần trước khi connect lại. LiveKit token luôn mint từ
core-api; wrapper `shared/media/` sở hữu connect/disconnect và cleanup track/room.

## 12.9 Quy tắc bắt buộc cho task frontend

1. Không sửa backend ngoài file/scope task đã liệt kê. Thiếu contract thì dừng và tạo dependency
   backend, không tự thêm endpoint.
2. Không import source `apps/core-api/**` hoặc app khác. Internal library browser chỉ dùng
   `@litmatch/api-client` và `@litmatch/common-dtos/pure`.
3. REST qua api-client; realtime event qua constants/types canonical.
4. URL/port/threshold theo môi trường đi qua env module đã validate và `.env.example`.
5. Server state dùng TanStack Query; client state đi theo ladder ở docs 13.
6. Không tạo `libs/ui` hay abstraction để dành. Lib mới cần cập nhật architecture trước.
7. Next server code tuân boundary 12.5; secret không bao giờ dùng prefix public.
8. Form nhập dữ liệu validate bằng Zod; backend vẫn validate và quyết định nghiệp vụ.
9. Trước khi báo xong chạy `pnpm agent:verify frontend`; command PASS mới là bằng chứng máy.
10. Phát hiện docs/spec sai thì sửa nguồn canonical trong cùng thay đổi.

## 12.10 Phân tầng tài liệu FE

- File này giữ architecture/boundary evergreen; docs 13 giữ coding rule.
- `apps/<app>/AGENTS.md` chỉ giữ dev commands, current route/capability và delta chặt hơn. Nó
  không được sao chép hoặc nới core rule.
- `docs/07-roadmap.md` giữ dependency và trạng thái hoàn thành; không dùng roadmap để giải thích
  kiến trúc.
- Quyết định có trade-off dài hạn đi vào ADR. Thay quyết định bằng ADR mới, không sửa lịch sử.

## 12.11 Verification contract

Nguồn duy nhất cho frontend DoD bằng máy là:

```bash
pnpm agent:verify frontend
```

Command phải fail khi project thiếu lint/test/build target, OpenAPI/generated drift, format sai
hoặc guard vi phạm. Manual smoke/E2E của flow vừa đổi vẫn phải ghi bằng chứng trong review;
command tự động không thay thế acceptance criteria nghiệp vụ.

Trong vòng lặp phát triển có thể chạy `pnpm agent:verify frontend --tier=fast` (guard, contract,
lint và test, có dùng Nx cache). Không truyền tier là `full`: thêm format toàn repo, build sạch
không cache và bundle audit; chỉ tier này là bằng chứng DoD.
