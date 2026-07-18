# Review — config-and-reuse-refactor — verify — 2026-07-18

## 1. Phạm vi và kết quả audit

- Local configuration: `.env` → Compose interpolation → infrastructure/backend/frontend;
  không còn tunnel ID, IP LAN hoặc credential theo máy trong file config tracked.
- Media: LiveKit key/secret, webhook key và ICE node IP được inject bằng env native; YAML chỉ
  giữ topology/protocol config.
- Test infrastructure: core và signaling dùng chung một Node-only library để cấp port ngẫu
  nhiên, start app build, chia sẻ runtime state và teardown đúng process group.
- Dev tooling: seed/diagnostic dùng `DATABASE_URL`, public API env và một helper đọc Compose log
  theo service, không phụ thuộc container name sinh tự động.
- Web UI: formatter duration `m:ss` giống nhau ở Voice Match, Movie Match và Soul Match được
  gom về một pure function có test.
- Audit không gom các literal chỉ giống hình thức nhưng khác ownership/business meaning; không
  di chuyển domain rule sang `common/` và không sửa contract nghiệp vụ trong ticket refactor.

## 2. Assumption table và vị trí chặn

| Giả định                                                     | Bằng chứng / vị trí chặn                                                  | Kết quả |
| ------------------------------------------------------------ | ------------------------------------------------------------------------- | ------- |
| Root `.env` là nguồn local-stack duy nhất                    | `docker-compose.yml:9`, `docker-compose.dev.yml:14`, README local section | PASS    |
| Giá trị theo máy không được xuất hiện trong file tracked     | `scripts/agent/config-single-source.test.mjs:46`                          | PASS    |
| Frontend public URL/host port đổi mà không sửa Compose       | `docker-compose.dev.yml:124-194`                                          | PASS    |
| DB credential đổi trong env được truyền vào Postgres và app  | `docker-compose.yml:9-18`, `docker-compose.dev.yml:14-19`                 | PASS    |
| LiveKit secret không nằm trong YAML tracked                  | `docker-compose.dev.yml:53-58`, `apps/media-server/livekit*.yaml`         | PASS    |
| IP LAN cho Next và ICE dùng cùng một key                     | `DEV_LAN_IP` tại `.env.example`; Compose dòng 56/168                      | PASS    |
| Eruda boolean nhận cả cấu hình bật và tắt rõ ràng            | `apps/web/src/shared/env.ts:21`                                           | PASS    |
| E2E không dùng/dừng server Docker đang chạy                  | `libs/e2e-support/src/lib/isolated-node-server.ts:108-184`                | PASS    |
| Helper E2E chỉ nhận state name an toàn trong temp directory  | Name validation dòng 31-42 và unit test                                   | PASS    |
| Tool dev không phụ thuộc generated container name            | `scripts/dev/dev-compose.mjs:3-23`                                        | PASS    |
| Ba flow timer có cùng semantics `m:ss`, clamp/floor như nhau | `apps/web/src/shared/lib/format-minutes-seconds.ts:1-7`                   | PASS    |

## 3. Literal giữ lại có chủ đích

- Cổng nội bộ container `3000`, `3001`, `5432`, `6379`, `7880/7881` là network contract giữa
  service, healthcheck và config protocol. Host-facing port mới là phần cấu hình theo môi
  trường và đã đi qua `*_HOST_PORT`.
- Default localhost/dev credential trong `${VAR:-default}` và `.env.example` là bootstrap
  fallback an toàn cho local, không phải production secret; production/release bắt buộc
  override.
- Test fixture và CI database giữ literal cô lập theo test environment. Chúng không tham gia
  runtime configuration và không được import vào app.
- LiveKit image version/digest tiếp tục khai tường minh ở từng deployment manifest để review
  upgrade/rollback nhìn thấy rõ; không biến image production thành mutable env ngầm.

## 4. Checklist boundary/correctness

- [x] Không thêm backend deployable thứ tư; `e2e-support` chỉ là library Node test-time.
- [x] Không thay domain ownership, API contract, database schema hoặc economy ledger.
- [x] Mọi abstraction mới có ít nhất hai consumer thật hoặc ba call site cùng semantics.
- [x] Compose base/dev/observability và standalone media config parse thành công.
- [x] LiveKit chạy thật với `LIVEKIT_KEYS`, `LIVEKIT_WEBHOOK_API_KEY`, `NODE_IP` từ env.
- [x] PostgreSQL healthcheck dùng đúng user/database đã cấu hình.
- [x] Core/signaling E2E dùng port ngẫu nhiên và chạy song song được.
- [x] Regression test chặn machine-specific tunnel/IP/credential quay lại.
- [x] Tài liệu coding standard phân biệt app-runtime env với operator-only env.
- [x] README ghi rõ nguồn cấu hình và trường hợp frontend chạy host-native.
- [x] Stack Docker cuối cùng healthy sau recreate bằng config mới.

## 5. Bằng chứng test thật

| Lệnh / kiểm tra                                                                                                                   | Kết quả                                                                |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `node --test scripts/agent/config-single-source.test.mjs`                                                                         | PASS — 2 regression tests                                              |
| `pnpm nx test e2e-support --skip-nx-cache`                                                                                        | PASS — 2 tests start/read/stop + path safety                           |
| `pnpm nx build e2e-support --skip-nx-cache`                                                                                       | PASS                                                                   |
| `INTEGRATION_DB_URL=... REDIS_URL=... pnpm nx run-many -t e2e -p core-api-e2e signaling-gateway-e2e --skip-nx-cache --parallel=2` | PASS — core 12/12, signaling 2/2 trên hai isolated server              |
| `pnpm nx test web --skip-nx-cache`                                                                                                | PASS — 61 files, 224 tests                                             |
| `docker compose -f docker-compose.yml -f docker-compose.dev.yml config --quiet`                                                   | PASS                                                                   |
| Recreate `livekit core-api signaling-gateway admin web` bằng Compose mới                                                          | PASS — stack healthy                                                   |
| `pnpm agent:verify infra`                                                                                                         | PASS — guard, 46 agent/CI tests, doctor, format                        |
| `pnpm agent:verify media`                                                                                                         | PASS — standalone LiveKit Compose và format                            |
| `INTEGRATION_DB_URL=... REDIS_URL=... pnpm agent:verify signaling`                                                                | PASS — lint, 25 tests, build, 2 E2E                                    |
| `pnpm agent:verify frontend`                                                                                                      | PASS — lint; admin 50, web 224, api-client 23 tests; production builds |
| HTTP smoke `:3000/health`, `:4200/login`, `:4300`                                                                                 | PASS                                                                   |
| `git diff --check`                                                                                                                | PASS                                                                   |

## 6. Kết luận

**PASS.** Các cấu hình thay đổi theo máy/môi trường đã có nguồn quản lý rõ ràng, các đoạn dùng
chung có bằng chứng đã được gom đúng boundary, và regression test ngăn hardcode quay lại. Toàn
bộ gate infra/media/signaling/frontend cùng runtime Docker đều qua; ticket refactor có thể đóng
trước khi bắt đầu kịch bản deploy/release.
