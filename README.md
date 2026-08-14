# Litmatch social-entertainment platform

Litmatch là monorepo cho matching text/voice ẩn danh, social/feed, Party Room, content, Trust &
Safety và Economy Diamond/VIP. Hệ thống dùng modular monolith cho business logic, tách realtime
fanout và media theo quy luật scale khác.

“Có implementation trong repo” không đồng nghĩa “đã launch production”. Trạng thái code-backed và
test source nằm ở [`docs/feature-registry.json`](./docs/feature-registry.json); bản đọc được được
sinh ở [product evidence report](./docs/generated/product-spec-evidence-report.md). Chạy
`pnpm docs:check` trước khi dựa vào report.

## Kiến trúc đọc nhanh

| Thành phần                                                     | Vai trò                                                                    | Boundary                                                             |
| -------------------------------------------------------------- | -------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| [`apps/core-api`](./apps/core-api/README.md)                   | NestJS modular monolith, sở hữu toàn bộ business logic và PostgreSQL state | Domain gọi nhau qua public API/DI; Economy ledger là source of truth |
| [`apps/signaling-gateway`](./apps/signaling-gateway/README.md) | Socket.IO JWT handshake, Redis fanout/adapter và connection quota          | Không quyết định matching, billing hoặc media permission             |
| [`apps/media-server`](./apps/media-server/README.md)           | LiveKit SFU config/deployment                                              | Không business logic hoặc DB                                         |
| [`apps/web`](./apps/web/README.md)                             | Next.js client cho end user                                                | Không business logic; REST qua generated client                      |
| [`apps/admin`](./apps/admin/README.md)                         | Vite/React operations console                                              | Backend guard/permission mới là authority                            |

Baseline có đúng **ba backend deployable**: Core API, Signaling Gateway và Media Server. Admin/Web
là client; các project E2E không phải runtime. Deployable backend thứ tư cần số liệu, ADR và cập
nhật guard theo [architecture § 3.4](./docs/03-architecture.md).

## Bắt đầu

Yêu cầu: Node.js 22, pnpm 11.9, Docker/Compose.

### Full local stack bằng Compose

```bash
cp .env.example .env
cp apps/admin/.env.example apps/admin/.env.local
cp apps/web/.env.example apps/web/.env.local
pnpm dev:up
```

Web chạy ở `http://localhost:4300`, Admin `:4200`, Core API/Swagger `:3000/docs`, Signaling `:3001`
và LiveKit `:7880`. Xem log/health bằng `pnpm dev:logs` và `pnpm dev:ps`.

### Host-native development

```bash
pnpm bootstrap
```

`bootstrap` cài dependency từ lockfile, bật PostgreSQL/Redis/Kafka, chạy migration và `doctor`.
Những lần sau dùng `pnpm infra:up`, `pnpm db:migrate` và target Nx của app đang làm.

Runbook đầy đủ về env ownership, dependency/migration changes, daily workflow và reset data:
[Local development](./docs/runbooks/local-development.md).

## Lệnh thường dùng

| Mục đích                                         | Lệnh                                                                 |
| ------------------------------------------------ | -------------------------------------------------------------------- |
| Xem Nx projects/target thật                      | `pnpm nx show projects`; `pnpm nx show project <name> --json`        |
| Build/test/lint một project                      | `pnpm nx build <name>`; `pnpm nx test <name>`; `pnpm nx lint <name>` |
| Route context cho agent                          | `pnpm agent:context <scope>`                                         |
| Kiểm tra contract/guard repository               | `pnpm agent:check`                                                   |
| Sinh/kiểm tra docs và contract artifacts         | `pnpm docs:generate`; `pnpm docs:check`                              |
| Đồng bộ OpenAPI + generated client               | `pnpm openapi:sync`; kiểm tra bằng `pnpm openapi:check`              |
| Kiểm tra format không ghi file                   | `pnpm format:check`                                                  |
| Xem local CI plan                                | `pnpm ci:local:plan`                                                 |
| Full quality/test/build/E2E preflight trước push | `pnpm ci:preflight`                                                  |

`pnpm ci:local:quick` và `pnpm ci:preflight` không tự sửa source. Không chạy full preflight trong shared
dirty worktree khi chưa phối hợp ownership; dùng target check theo scope trước. Chi tiết:
[Quality gates](./docs/runbooks/quality-gates.md).

## Bản đồ repository

| Path                                       | Nội dung                                                                   |
| ------------------------------------------ | -------------------------------------------------------------------------- |
| [`docs/`](./docs/00-overview-and-index.md) | Product, architecture, domain, engineering, roadmap, lifecycle và evidence |
| [`openapi/`](./openapi/README.md)          | REST contract được emit từ Core API                                        |
| [`specs/`](./specs/README.md)              | Arazzo critical workflows và AsyncAPI realtime companion contract          |
| [`libs/`](./libs/README.md)                | Shared libraries có boundary/tag Nx                                        |
| [`deploy/`](./deploy/README.md)            | Hosted và single-node production artifacts                                 |
| [`k8s/`](./k8s/README.md)                  | Kubernetes base/overlays và media networking                               |
| [`loadtest/`](./loadtest/README.md)        | k6/Artillery/LiveKit workload và SLO scaffold                              |
| [`scripts/`](./scripts/README.md)          | Agent, CI, docs, release, reliability và dev automation                    |
| [`layouts/`](./layouts/README.md)          | Visual reference HTML; không phải product/API contract                     |

## Đọc tài liệu theo nhu cầu

- Newcomer: [`AGENTS.md`](./AGENTS.md) →
  [docs overview](./docs/00-overview-and-index.md) →
  [project lifecycle](./docs/19-project-lifecycle-and-learning.md).
- Product/domain: [capability map](./docs/01-product-features.md) →
  [domain model](./docs/02-domain-model.md) →
  [service catalog](./docs/services/README.md).
- Backend: [architecture](./docs/03-architecture.md) →
  [coding standards](./docs/05-coding-standards.md) →
  [module blueprint](./docs/16-module-blueprint.md).
- Frontend: [frontend architecture](./docs/12-frontend-architecture.md) →
  [frontend standards](./docs/13-frontend-coding-standards.md).
- Release/operations: [runbook index](./docs/runbooks/README.md) và ADR của profile.

## Invariant cốt lõi

- Business domain mới là module trong `core-api`, không tự tạo backend app/service.
- `LedgerEntry` double-entry append-only là nguồn sự thật; `Wallet` chỉ là snapshot; transaction
  idempotency unique ở DB; correction bằng reversal.
- Business flow nhạy cảm cần assumption table, guard `file:line`, test thật và
  `review-module verify`. Docs/tooling-only vẫn chạy checks theo scope và ghi lý do N/A.

Chi tiết bắt buộc thuộc [`AGENTS.md`](./AGENTS.md); README này chỉ là landing page.
