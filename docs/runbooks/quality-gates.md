# Quality gates

Runbook này chọn gate theo phạm vi và chi phí. Model/linter mạnh không thay test; full suite không
thay targeted reproduction; local PASS không chứng minh production.

## Gate ladder

| Khi nào                | Gate tối thiểu                                                               | Ghi chú                                          |
| ---------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------ |
| Trong vòng lặp sửa nhỏ | Targeted test + lint/typecheck/build liên quan                               | Dùng target thật từ `nx show project`            |
| Docs/spec              | `pnpm docs:check`, `pnpm agent:check`, targeted Prettier check               | Generated artifacts phải up-to-date              |
| Agent/tooling          | `pnpm agent:check`, `pnpm agent:test`                                        | Chạy context scope `agents`                      |
| Frontend contract      | `pnpm agent:verify frontend`, `pnpm openapi:check`                           | Có thể cần Core API emit/generation              |
| Business nhạy cảm      | `pnpm agent:verify <scope>` + `review-module verify` + integration test thật | Economy/Matching/Calling/Gift/Party/Feed/Safety  |
| Trước push             | `pnpm ci:preflight`                                                          | Clean quality + test/build/E2E + container smoke |
| Staging reliability    | `pnpm reliability:production-gate`                                           | Cần evidence env được runbook reliability mô tả  |

Xem gate chính xác được scope router yêu cầu bằng:

```bash
pnpm agent:context <scope>
```

## Local CI profiles

| Command                                   | Hành vi                                                                                      |
| ----------------------------------------- | -------------------------------------------------------------------------------------------- |
| `pnpm ci:local:plan`                      | In plan của full profile, không chạy gate                                                    |
| `pnpm ci:local:quick`                     | Install, reset Nx, **format write**, agent checks/tests, workflow lint, format check và lint |
| `pnpm ci:local:clean`                     | Quality gate trong clean Node 22 Linux container, cũng **format write** workspace mount      |
| `pnpm ci:local`                           | Quick quality + DB services + tests/build/E2E                                                |
| `pnpm ci:local:docker`                    | Build image, migration và local container smoke                                              |
| `pnpm ci:preflight` / `pnpm ci:local:all` | Clean quality + test/build/E2E + image smoke                                                 |
| `pnpm ci:local:security`                  | Hiện disabled/non-blocking; không được mô tả như security PASS                               |

Local CI và `agent:verify` sở hữu watchdog theo từng stage (mặc định lần lượt 20 và 15 phút,
có thể cấu hình bằng `LOCAL_CI_STAGE_TIMEOUT_MS` / `AGENT_VERIFY_STAGE_TIMEOUT_MS`). Không bọc cả
profile bằng `timeout 45s`: aggregate gate hợp lệ thường dài hơn 45 giây. Stage quá hạn được ghi
`TIMED_OUT`, trả exit `124`, gửi `SIGTERM` cho cả process group rồi `SIGKILL` sau grace period;
command tự trả `124` vẫn được giữ nguyên nhưng không có marker `TIMED_OUT`, nên consumer phải
phân loại bằng cả marker và exit code. Đây là lỗi hạ tầng/thời lượng, không phải bằng chứng test
`FAIL`. Trước khi retry phải kiểm tra cây process cũ đã dừng. Probe HTTP của container có
connect/total timeout riêng.

Target `signaling-gateway:test` chạy tách khỏi pool Core API trong local/GitHub CI. Integration
suite của gateway dùng TTL lease production tối thiểu để chứng minh renew và replica-crash expiry;
cho suite này tranh CPU với Jest pool lớn có thể làm timer renew trễ quá TTL và tạo failure giả như
replica đã chết. Không tăng TTL/assertion timeout để che hiện tượng: runner cô lập target nhạy timing,
sau đó mới chạy các project còn lại song song.

Vì quick/clean/preflight chạy `pnpm format`, chúng có thể ghi vào file ngoài scope. Trong shared
dirty worktree, không chạy các profile này nếu chưa phối hợp ownership; ưu tiên:

```bash
pnpm exec prettier --check <owned-paths...>
pnpm nx test <project> --runTestsByPath <test-file>
pnpm nx lint <project>
```

Không stage file chỉ vì formatter của gate đã chạm nó. Nếu full gate fail ở file concurrent ngoài
scope, ghi rõ baseline/collision và vẫn chứng minh owned paths bằng targeted check.

## Evidence cần bàn giao

- Exact command và exit result
- Phân loại `PASS`, `FAIL`, `TIMED_OUT` (marker + exit `124`) hoặc `CANCELLED`; không gom timeout
  thành test fail hay suy timeout chỉ từ exit code
- Checkout/commit SHA khi evidence dùng cho release
- Môi trường thật hay mock; database/provider nào được dùng
- Test source hay test vừa chạy
- Known skipped suite và lý do
- Assumption/open risk
- `review-module` result hoặc lý do N/A

Không copy số test PASS cũ vào canonical docs. Dated result thuộc `docs/plans/` hoặc release
artifact và phải có caveat.

## Bypass

Emergency bypass contract nằm ở [commit guidelines § 15.4](../15-commit-guidelines.md). Bypass chỉ
là authority tạm thời có lý do/log; không biến gate đỏ thành PASS và không được dùng để hạ
threshold/guard cho tiện.

`review-module: N/A` — runbook này định nghĩa tooling/verification workflow, không thay business
flow.
