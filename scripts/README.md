# Repository automation

Không gọi script nội bộ theo trí nhớ; ưu tiên package command ổn định trong `package.json`.

| Directory      | Vai trò                                                            | Public entry points                                          |
| -------------- | ------------------------------------------------------------------ | ------------------------------------------------------------ |
| `agent/`       | Context routing, guard, verify, OpenAPI/link/policy checks         | `agent:context`, `agent:check`, `agent:verify`, `agent:test` |
| `ci/`          | Local-equivalent quality/test/image profiles và workflow policy    | `ci:local:*`, `ci:preflight`                                 |
| `docs/`        | Registry/spec validation và deterministic Markdown/DOCX generation | `docs:generate`, `docs:check`                                |
| `release/`     | Preflight/deploy/backup/smoke/rollback/profile contract            | `release:*`, `release:profile-check`                         |
| `reliability/` | Staging SLO/evidence validation                                    | `reliability:production-gate`, `reliability:test`            |
| `dev/`         | Demo-data helpers                                                  | đọc precondition trong script trước khi chạy                 |
| `doctor.mjs`   | Toolchain/env/dependency diagnostics                               | `pnpm doctor`                                                |

Script có side effect phải fail-fast, có scope rõ và không nuốt lỗi. Tooling change chạy context
`agents`, test script liên quan và cập nhật runbook/command table nếu public behavior đổi.
