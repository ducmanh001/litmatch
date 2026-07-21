# Litmatch — hợp đồng làm việc cho mọi agent

Đây là nguồn hướng dẫn bắt buộc và trung lập cho mọi agent làm việc trong repo. Các file
tương thích theo từng công cụ chỉ được trỏ về đây, không được chứa luật riêng. Đọc
`docs/00-overview-and-index.md` để lấy bản đồ tài liệu đầy đủ.

## Ba luật không được vi phạm

1. **Baseline chỉ có ba thành phần deploy riêng phía backend**: `apps/core-api`,
   `apps/signaling-gateway`, `apps/media-server`. Mọi domain mới mặc định là module NestJS bên
   trong `core-api`; không tự tạo app/service backend thứ tư. Chỉ được thay baseline này khi số
   liệu vận hành đạt tiêu chí `docs/03 § 3.4` **và** một ADR mới cập nhật đồng thời file này,
   architecture, guard và deployment. Frontend client (`apps/admin`, `apps/web`) không thuộc luật
   này nhưng không được chứa business logic — xem `docs/12-frontend-architecture.md`.
2. **Economy/diamond**: `LedgerEntry` double-entry, append-only là nguồn sự thật;
   `Wallet.balance` chỉ là snapshot. Idempotency key unique ở DB trên `Transaction`. Không
   sửa/xoá ledger cũ; sửa sai bằng reversal entry mới. Xem `docs/03-architecture.md § 3.8.C`.
3. **Trước khi báo xong**: dùng skill `review-module` ở mode `verify`; thay đổi nhạy cảm phải
   có bảng giả định, vị trí chặn và bằng chứng test thật. Mode `verify` FAIL nghĩa là task chưa
   hoàn tất.

## Nạp đúng context

Chạy `pnpm agent:context <scope>` trước khi sửa. Scope hỗ trợ: `core`, `economy`, `matching`,
`calling`, `signaling`, `media`, `frontend`, `infra`. Nếu chưa rõ scope, chạy `pnpm agent:context`.

| Khi cần                  | Đọc                                                                         |
| ------------------------ | --------------------------------------------------------------------------- |
| Toàn cảnh                | `docs/00-overview-and-index.md`                                             |
| Domain model             | `docs/02-domain-model.md`                                                   |
| Kiến trúc/boundary/scale | `docs/03-architecture.md`                                                   |
| Tech stack               | `docs/04-tech-stack.md`                                                     |
| Coding convention        | `docs/05-coding-standards.md`                                               |
| Domain rules             | `docs/06-domain-rules.md`                                                   |
| Roadmap hiện tại         | `docs/07-roadmap.md`                                                        |
| Quy trình agent          | `docs/08-working-with-agents.md`                                            |
| Frontend (khung + chuẩn) | `docs/12-frontend-architecture.md` + `docs/13-frontend-coding-standards.md` |
| Review bắt buộc          | `docs/10-code-review-checklist.md`                                          |
| La bàn thiết kế          | `docs/11-engineering-principles.md`                                         |

## Thứ tự nguồn hướng dẫn

Các nguồn không được tự ý ghi đè nhau. Mỗi nguồn có một trách nhiệm:

1. `AGENTS.md` gốc giữ invariant và quy trình không được vi phạm trong toàn repo.
2. Architecture hiện hành (`docs/03`, `docs/12`) và ADR giữ quyết định thiết kế/boundary.
3. Coding standards (`docs/05`, `docs/13`) giữ cách hiện thực mặc định.
4. `AGENTS.md` gần app/module chỉ giữ current state, lệnh chạy và delta **chặt hơn**; không
   được nới lỏng các nguồn phía trên nếu chưa cập nhật architecture/ADR tương ứng.
5. Roadmap mô tả tiến độ, không phải nguồn luật kỹ thuật.

Nếu hai nguồn mâu thuẫn, dừng và sửa nguồn canonical trong cùng thay đổi; không âm thầm chọn
một bên và không dùng file scope để lách invariant toàn repo.

## Quy trình mặc định

1. Xác nhận objective, out-of-scope và acceptance criteria từ task; không tự mở rộng phạm vi.
2. Nạp context đúng scope, đọc `AGENTS.md` gần nhất trong cây thư mục nếu có.
3. Với module/luồng nghiệp vụ mới, dùng `review-module plan` trước khi code.
4. Viết test song song với thay đổi. Schema chỉ đổi bằng migration mới.
5. Chạy `pnpm agent:check`, unit test file/target bị ảnh hưởng, lint và build target áp dụng.
6. Chạy `review-module verify`; bàn giao file thay đổi, lệnh đã chạy, kết quả và quyết định còn mở.
7. Nếu phát hiện docs sai/thiếu, sửa nguồn docs tương ứng trong cùng thay đổi.

## Boundary và correctness

- Domain sở hữu logic, dữ liệu, type và quyền ghi; module khác đi qua public API/DTO/event.
- `common/` phải trung lập; dependency một chiều; không tạo abstraction để dành.
- Side effect phải idempotent và atomic; correctness trước cache/performance.
- API chạm diamond cần idempotency key + DB transaction/locking phù hợp.
- Security, privacy, compatibility, failure isolation và observability là phần của thiết kế.
- Không hardcode giá/threshold; dùng config có validation và cập nhật `.env.example`.

## Skills dùng chung

- Tự chọn model/effort và điều phối sub-agent cho task không tầm thường: đọc và làm theo
  `.agents/skills/adaptive-orchestration/SKILL.md`; task simple/standard phải giữ direct để tránh
  overhead, không fan-out theo mặc định.
- Tạo module: đọc và làm theo `.agents/skills/new-module/SKILL.md`.
- Plan/review module: đọc và làm theo `.agents/skills/review-module/SKILL.md`.

Skill là quy trình dùng chung, không phụ thuộc model, IDE hay nhà cung cấp.

## Giới hạn thực thi và token

- Không polling loop, `sleep` hoặc lặp status. Sau khi trigger push/job thì dừng; nếu buộc phải chờ
  theo yêu cầu người dùng, dùng tối đa một native blocking wait/watch.
- Không gửi progress filler. Chỉ báo kết quả có ý nghĩa, blocker cần input hoặc update mà runtime
  bắt buộc.
- Search bằng `rg` có scope và loại build/vendor dirs; đọc bounded range. Log đưa vào context mặc
  định tối đa 20 dòng liên quan; không đọc toàn lockfile, minified bundle hay build artifact.
- Cùng một failure chỉ được sửa và retry tối đa hai lần; vẫn lỗi thì dừng, tóm tắt và xin hướng dẫn.
- Chỉ chạy unit test file/target bị ảnh hưởng; full test suite chỉ khi người dùng yêu cầu rõ. Domain
  nhạy cảm vẫn phải chạy gate bắt buộc được ghi riêng trong repo.
- Không chạy server/process dài ở foreground. Batch lệnh ngắn liên quan bằng `&&`.
- Sub-agent cap mặc định là hai; chỉ task critical được tối đa ba gồm reviewer. Dừng agent khi đủ
  evidence; không truyền toàn bộ prompt, hội thoại hoặc raw log sang agent khác.
- Nếu runtime không hỗ trợ hạ cấp model cho sub-agent, cấm tạo sub-agent để tránh nhân bản chi phí từ model chính.
- Sub-agent chỉ nhận task payload rút gọn và file path liên quan, không inherit toàn bộ chat history.
- Tranh luận/Review giữa các sub-agent tối đa 1 lượt (1 round); nếu vẫn reject thì dừng và hỏi User.
- Giới hạn đọc file tối đa 200 dòng/lần; không nạp file > 100KB hoặc unformatted JSON/lockfile vào context.
- Tất cả lệnh CLI nguy cơ lâu/treo phải bọc hard timeout ở cấp OS (ví dụ: `timeout 45s <command>`).

## Lệnh kiểm chứng

Đây là catalog lệnh, không phải danh sách phải chạy toàn bộ cho mọi task. `agent:test`, `test` và
verify full chỉ chạy khi người dùng yêu cầu rõ hoặc trong CI; agent tương tác ưu tiên file/target bị
ảnh hưởng theo giới hạn phía trên.

```bash
pnpm doctor
pnpm agent:context <scope>
pnpm agent:verify <scope>
pnpm agent:check
pnpm agent:test
pnpm format:check
pnpm lint
pnpm test
pnpm build
```

Thay đổi Economy phải chạy thêm integration test thật, không dùng cache:

```bash
INTEGRATION_DB_URL=postgresql://litmatch:litmatch_local@localhost:5432/litmatch_test \
  pnpm nx test core-api --skip-nx-cache
```

## Guardrail

Rule engine trung lập nằm tại `scripts/agent/guard-core.mjs`; adapter tương tác và CI cùng gọi
chung engine này. Bị guard chặn thì sửa cách làm hoặc xin quyết định mới, không tìm cách lách.

<!-- nx configuration start-->
<!-- Leave the start & end comments to automatically receive updates. -->

## General Guidelines for working with Nx

- For navigating/exploring the workspace, invoke the `nx-workspace` skill first - it has patterns for querying projects, targets, and dependencies
- When running tasks (for example build, lint, test, e2e, etc.), always prefer running the task through `nx` (i.e. `nx run`, `nx run-many`, `nx affected`) instead of using the underlying tooling directly
- Prefix nx commands with the workspace's package manager (e.g., `pnpm nx build`, `npm exec nx test`) - avoids using globally installed CLI
- You have access to the Nx MCP server and its tools, use them to help the user
- For Nx plugin best practices, check `node_modules/@nx/<plugin>/PLUGIN.md`. Not all plugins have this file - proceed without it if unavailable.
- NEVER guess CLI flags - always check nx_docs or `--help` first when unsure

## Scaffolding & Generators

- For scaffolding tasks (creating apps, libs, project structure, setup), ALWAYS invoke the `nx-generate` skill FIRST before exploring or calling MCP tools

## When to use nx_docs

- USE for: advanced config options, unfamiliar flags, migration guides, plugin configuration, edge cases
- DON'T USE for: basic generator syntax (`nx g @nx/react:app`), standard commands, things you already know
- The `nx-generate` skill handles generator discovery internally - don't call nx_docs just to look up generator syntax

<!-- nx configuration end-->
