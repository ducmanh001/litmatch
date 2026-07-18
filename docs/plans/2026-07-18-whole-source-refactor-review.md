# Review — whole-source-refactor — verify — 2026-07-18

## 1. Objective, phạm vi và truy vết hai chiều

Objective của ticket 3 là rà soát toàn bộ source hiện có, không chỉ `.env`: cấu hình phải có
một nguồn quản lý, code dùng chung phải được gom đúng ownership, route/page lớn phải tách theo
feature, lifecycle lặp lại phải có primitive dùng lại, dead code phải được xoá hoặc nối vào flow
thật, và mọi thay đổi phải giữ nguyên API/domain invariant hiện hành.

Luồng kiểm chứng hai chiều:

`docs/architecture + coding standards → project graph/file audit → refactor theo boundary → unit/integration/E2E → production build → dependency/duplication scan`

`route/API/job đang chạy → component/service/helper sở hữu → public contract/schema → docs và test tương ứng`

Các nhóm thay đổi đã đối chiếu:

- Config local, Compose, LiveKit và observability dùng env đã validate; regression test chặn
  credential/IP/tunnel ID theo máy quay lại.
- E2E core/signaling dùng chung `libs/e2e-support`, tự mở server cô lập trên port ngẫu nhiên và
  chỉ teardown process do test sở hữu.
- Mười hai scheduled-job runner ở Core dùng chung `ManagedInterval`; SQL, transaction, lock,
  idempotency và state transition vẫn thuộc domain.
- Soul Match DTO không còn import ngược service; type contract nằm trong file trung lập của
  module.
- Home Web và Moderation Admin trở thành route/page điều phối mỏng; data fetching và UI được
  tách về feature owner.
- Comment presentation, icon và formatter thời gian có canonical implementation; API/query
  vẫn nằm trong feature owner.
- Reconnect Web refetch server state thật; report video đã được nối UI → API và có behavior test.
- Seed dev được tách fixture, HTTP/OTP adapter và orchestration; fixture có contract test, script
  vẫn idempotent theo thiết kế cũ.
- Export/type/component không có consumer được xoá hoặc thu hẹp visibility; không xoá endpoint
  backend chỉ vì frontend hiện chưa gọi.

## 2. Bảng giả định và vị trí chặn

| #   | Giả định / invariant                                         | Ai hoặc điều gì có thể phá                       | Vị trí chặn / bằng chứng                                                                                                         | Verdict |
| --- | ------------------------------------------------------------ | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------- | ------- |
| 1   | Không sinh backend deployable thứ tư                         | Refactor biến helper thành service riêng         | `scripts/agent/guard-core.mjs`; project graph chỉ giữ ba backend baseline                                                        | PASS    |
| 2   | Ledger append-only, wallet snapshot và idempotency không đổi | Gom scheduler làm đổi transaction/domain query   | `ManagedInterval` chỉ quản lifecycle tại `apps/core-api/src/common/scheduling/managed-interval.ts:8-54`; DB integration 709 test | PASS    |
| 3   | Tick cùng process không overlap, lỗi vẫn nhả khoá            | Promise reject làm runner kẹt                    | `managed-interval.ts:45-53`; unit test success/busy/reject-retry                                                                 | PASS    |
| 4   | Correctness nhiều pod không dựa vào cờ RAM                   | Người dùng primitive thay cho DB lock            | Comment phạm vi per-process tại `managed-interval.ts:4-7`; domain SQL/lock giữ nguyên                                            | PASS    |
| 5   | Party Room giữ hai timer độc lập                             | Một runner làm host-grace chặn sweeper           | Hai `ManagedInterval` tại `party-room-sweeper.service.ts`, test/build Core                                                       | PASS    |
| 6   | DTO Soul Match không phụ thuộc service implementation        | DTO import enum từ service                       | `soul-match.types.ts:4-20`; DTO import tại `dto/soul-match.dtos.ts:7`                                                            | PASS    |
| 7   | Reconnect phải phục hồi state bị miss từ REST                | Socket chỉ nối lại nhưng cache vẫn stale         | `apps/web/src/app/(app)/layout.tsx:124-126`; cleanup listener/socket cùng effect                                                 | PASS    |
| 8   | Báo cáo video từ Web gọi đúng safety contract                | UI chỉ có icon nhưng không có mutation thật      | `video-reel-feed.tsx:106-115`; behavior assertion tại spec dòng 105                                                              | PASS    |
| 9   | Route Home không sở hữu query của Party Room                 | Tách file nhưng kéo API qua sai feature boundary | Route slot ở `app/(app)/home/page.tsx:1-6`; query ở `trending-room-cards.tsx`                                                    | PASS    |
| 10  | Admin moderation page chỉ điều phối tab                      | Page lớn chứa lại query/mutation/render chi tiết | Dispatcher tại `moderation-page.tsx:1-33`; ba component file theo capability                                                     | PASS    |
| 11  | Seed refactor không đổi persona/reference hoặc tạo cặp sai   | Di chuyển fixture làm lệch key/relationship      | `seed-demo-data.fixtures.test.mjs` — 3 contract tests; adapter tại client riêng                                                  | PASS    |
| 12  | Config theo môi trường không hardcode rải rác                | Sửa `.env` nhưng Compose/YAML vẫn giữ literal    | `config-single-source.test.mjs`; Compose interpolation; `.env.example` canonical                                                 | PASS    |
| 13  | Refactor không tạo dependency cycle                          | Type/helper import ngược boundary                | Madge quét 801 file TS/TSX: zero circular dependency                                                                             | PASS    |
| 14  | Không tạo abstraction chỉ để giảm số dòng                    | Ép các domain khác nghĩa dùng chung base class   | Review thủ công clone list theo ownership; chỉ extract khi semantics/lifecycle giống nhau                                        | PASS    |

## 3. Audit structure, reuse và quyết định giữ lại

### Đã xử lý

- Dependency cycle: từ 1 vòng `Soul DTO → Soul service` về 0 vòng trên 801 file.
- Duplicate scan cùng profile: từ 63 clone / 1,79% xuống 57 clone / 1,50%; TypeScript còn
  khoảng 0,78%, TSX khoảng 2,65% tại snapshot sau refactor chính.
- Home route giảm từ khoảng 561 dòng xuống 6 dòng điều phối; Admin Moderation page giảm từ
  khoảng 539 dòng xuống 34 dòng điều phối.
- Seed orchestration giảm khoảng 45 KB xuống 37 KB và chuyển catalog/persona cùng HTTP/OTP
  transport sang hai module có trách nhiệm rõ ràng.
- Tất cả thao tác `setInterval/addInterval/deleteInterval` của Core tập trung trong một
  lifecycle primitive.

### Clone giữ lại có chủ đích

Một scan bổ sung với phạm vi rộng hơn, tính cả migration, barrel, declaration và config, ghi
nhận 864 source / 69.162 dòng / 2,47%. Con số này không so trực tiếp với profile trước/sau ở
trên. Danh sách đã được triage và không có clone nào đủ điều kiện extract mà vẫn giữ đúng
boundary:

- Migration và entity/DTO ở các domain khác nhau giống shape nhưng khác schema owner và vòng
  đời; gom base class sẽ che migration contract.
- Login/provider/button/toast giữa `apps/admin` và `apps/web` có một số shape giống nhau nhưng
  hai frontend có runtime/design/dependency riêng; architecture hiện không có shared UI app-lib.
- Metrics controller ở Core và Signaling là adapter rất mỏng của hai deployable; gom lại tạo
  coupling deployable không cần thiết.
- Jest/Webpack/tsconfig của các project giống cấu trúc vì Nx tool contract; giữ explicit giúp
  từng project build độc lập.
- Test setup/fixture lặp có chủ đích để mỗi scenario đọc được độc lập; chỉ gom khi helper có
  behavior riêng và có test, như `e2e-support`.
- Các domain service dài nhưng vẫn cohesive quanh một aggregate/transaction owner; không tách
  theo LOC nếu việc tách làm rò state machine hoặc transaction boundary.

## 4. Checklist review-module verify

- [x] Business flow và assumption table có vị trí chặn cụ thể.
- [x] Truy vết xuôi từ docs/convention tới code và test.
- [x] Truy vết ngược từ route/job/API về owner, contract và tài liệu.
- [x] Không thêm backend deployable, không chuyển business logic vào frontend/common.
- [x] Không sửa migration tracked; migration mới của flow Calling được test bằng DB thật.
- [x] Không thay economy ledger invariant; integration PostgreSQL thật chạy không cache.
- [x] Side effect và scheduler vẫn có idempotency/transaction/lock tại domain boundary.
- [x] Dead code chỉ xoá sau khi kiểm tra consumer; endpoint/backend contract không bị xoá nhầm.
- [x] Config mới có validation, `.env.example`, Compose interpolation và regression test.
- [x] Frontend route/component/API giữ đúng feature boundary và có behavior test.
- [x] Dependency graph đúng chiều và không có circular dependency.
- [x] Format, lint, test, E2E, build và repo guard đều PASS.

## 5. Bằng chứng test thật

| Lệnh / kiểm tra                                                                                                              | Kết quả                                                                          |
| ---------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- |
| `pnpm agent:verify core`                                                                                                     | PASS — guard, OpenAPI, format, lint, 65 suite/709 test, build, 4 suite/12 E2E    |
| `INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test pnpm nx test core-api --skip-nx-cache` | PASS — PostgreSQL thật, 65 suite/709 test, không dùng Nx cache                   |
| `pnpm agent:verify frontend`                                                                                                 | PASS — API client 23, Admin 50, Web 224 test; lint và production build           |
| `pnpm agent:verify signaling`                                                                                                | PASS — 25 unit, build, 2 isolated E2E                                            |
| `pnpm agent:verify media`                                                                                                    | PASS — standalone Compose parse, format                                          |
| `pnpm agent:verify infra`                                                                                                    | PASS — guard, 46 agent/CI test, doctor, format; PostgreSQL/Redis/Kafka reachable |
| `node --test scripts/dev/seed-demo-data.fixtures.test.mjs`                                                                   | PASS — 3 fixture/reference contract tests                                        |
| `node --check scripts/dev/seed-demo-data.mjs scripts/dev/seed-demo-data-client.mjs scripts/dev/seed-demo-data.fixtures.mjs`  | PASS                                                                             |
| `node --test scripts/agent/config-single-source.test.mjs`                                                                    | PASS — 2 hardcode/config regression tests                                        |
| Madge circular scan `apps libs`, TS/TSX                                                                                      | PASS — 801 file, 0 cycle                                                         |
| jscpd comparable source profile                                                                                              | PASS audit — 1,79% → 1,50%; 63 → 57 clone                                        |
| jscpd extra-inclusive production profile                                                                                     | PASS triage — 864 source, 2,47%; clone còn lại có ownership rõ                   |
| `git diff --check`                                                                                                           | PASS                                                                             |

Các warning `NO_COLOR/FORCE_COLOR` là warning của runner, không phải lint/test failure. Doctor
có 41 key optional/defaulted chưa đặt trong `.env` local; `.env.example` đã khai báo, runtime
dev hiện tại vẫn healthy và đây không phải missing required config.

## 6. Kết luận

**PASS.** Ticket 3 đạt acceptance criteria ở phạm vi toàn source: source có boundary rõ hơn,
phần lặp có cùng semantics đã được quản lý tập trung, page/script lớn đã tách theo ownership,
dead code/missing wiring đã được xử lý, config không còn phải sửa nhiều nơi, và mọi deployable
đều vượt qua verify chính thức. Các đoạn giống nhau còn lại đã được review theo business
meaning và được giữ explicit để tránh abstraction sai. Ticket 3 có thể đóng; chỉ sau kết luận
này mới được bắt đầu ticket 4 deploy/release.
