# Local development

Runbook này dành cho môi trường developer, không phải release profile. Chọn **một** trong hai
workflow chính cho một session: full Compose hoặc host-native. Trộn hai workflow mà không hiểu
port/process ownership dễ tạo hai app cùng chạy hoặc migration vào nhầm database.

## Prerequisites

- Node.js 22 và Corepack/pnpm theo `package.json`
- Docker Engine + Compose
- Git

Không commit `.env`, credential hoặc dữ liệu seed cá nhân.

## Full stack bằng Compose

Lần đầu:

```bash
cp .env.example .env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/web/.env.example apps/web/.env.local
pnpm dev:up
```

Compose development dựng dependency image/volume, PostgreSQL, Redis, Kafka, migration, Core API,
Signaling, Admin, Web và LiveKit. Lệnh trả terminal sau khi container được tạo.

| Surface            | Local URL                    |
| ------------------ | ---------------------------- |
| Web                | `http://localhost:4300`      |
| Admin              | `http://localhost:4200`      |
| Core API / Swagger | `http://localhost:3000/docs` |
| Signaling          | `http://localhost:3001`      |
| LiveKit            | `ws://localhost:7880`        |

Daily commands:

```bash
pnpm dev:up
pnpm dev:ps
pnpm dev:logs
pnpm dev:down
```

`dev:down` giữ volume dữ liệu và dependency cache.

## Host-native workflow

Lần đầu:

```bash
pnpm bootstrap
```

Lệnh này chạy install frozen lockfile, bật hạ tầng, migration và `doctor`. Sau đó:

```bash
pnpm infra:up
pnpm db:status
pnpm nx serve core-api
```

Chạy target app khác theo resolved Nx config (`pnpm nx show project <name> --json`); Media Server là
LiveKit config/deployment, không phải Nx TypeScript project.

## Khi source/config thay đổi

| Thay đổi               | Hành động                                                                          |
| ---------------------- | ---------------------------------------------------------------------------------- |
| Dependency + lockfile  | Compose: `pnpm dev:install && pnpm dev:up`; host: `pnpm install --frozen-lockfile` |
| `Dockerfile.dev`       | `pnpm dev:rebuild`                                                                 |
| Compose service/config | `pnpm dev:up`                                                                      |
| Migration mới          | `pnpm dev:up` hoặc `pnpm db:migrate` theo workflow đã chọn                         |
| Env key                | Cập nhật đúng `.env.example`, thêm local value, rồi `pnpm doctor`                  |
| OpenAPI DTO/controller | `pnpm openapi:sync` và commit spec/client projection nếu thay đổi                  |
| Feature registry/spec  | `pnpm docs:generate` rồi `pnpm docs:check`                                         |

Schema chỉ đổi bằng migration mới; không sửa migration đã commit và không bật
`synchronize: true`.

## Env ownership

Root `.env` là source local cho full Compose: database, ports, CORS, public URL, LiveKit và tunnel.
Không hard-code giá trị theo máy vào Compose/LiveKit/Next config.

`apps/admin/.env.local` và `apps/web/.env.local` chỉ phục vụ khi frontend chạy trực tiếp trên host.
Compose `environment` lấy từ root `.env` và có precedence cao hơn env file của frontend.

Runtime availability của auth/top-up/video/push do `GET /api/v1/capabilities` phản ánh từ config/
credential thật. Build env không được dùng để giả bật provider.

## Data và seed

Kiểm tra target trước thao tác phá hủy:

```bash
pnpm db:status
pnpm doctor
```

`pnpm infra:reset` chạy `docker compose down --volumes --remove-orphans` và **xóa toàn bộ local
PostgreSQL/Redis/Kafka volumes của project**. Chỉ dùng khi chủ động muốn mất dữ liệu local và đã
xác nhận không có process/session khác dùng stack đó.

Demo seed script nằm ở `scripts/dev/seed-demo-data.mjs`; đọc precondition trong file trước khi chạy.

## Smoke và handoff

1. `pnpm doctor`
2. `pnpm dev:ps` hoặc health endpoint của app host-native
3. Migration status
4. Targeted test/lint/build theo scope
5. Contract/docs checks nếu artifact liên quan đổi

Local boot/PASS không chứng minh production readiness. Release theo runbook profile tương ứng.

`review-module: N/A` — runbook này mô tả môi trường development, không thay business flow.
