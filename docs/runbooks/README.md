# Operational and development runbooks

Runbook là thủ tục có precondition/verification cho một profile cụ thể. Nó không tự nâng alpha/free
profile thành production SLA và không thay ADR hoặc domain rule.

| Runbook                                                           | Dùng cho                                                | Cần đọc kèm                      |
| ----------------------------------------------------------------- | ------------------------------------------------------- | -------------------------------- |
| [Local development](./local-development.md)                       | Compose/host-native, env, migration, reset local        | Root README, local `AGENTS.md`   |
| [Quality gates](./quality-gates.md)                               | Targeted check, local CI, preflight và evidence handoff | Context scope, commit guidelines |
| [Reliability SLO and evidence](./reliability-slo-and-evidence.md) | Staging observation window và production evidence gate  | ADR 0010, release profile        |
| [Hosted-free release](./hosted-free-release.md)                   | Northflank/Upstash/Cloudflare/LiveKit Cloud alpha       | ADR 0009                         |
| [Zero-cost production](./zero-cost-production.md)                 | Single-node Compose/Caddy profile                       | ADR 0008                         |
| [Grafana Cloud](./grafana-cloud.md)                               | Metrics/log dashboard và alerts                         | ADR 0010                         |
| [PostHog Cloud](./posthog-cloud.md)                               | Analytics/session replay với consent/cost limits        | Privacy contract                 |

Trước khi chạy một release runbook, chốt artifact/SHA, migration order, secret owner, rollback/
forward path và smoke criteria. Lưu kết quả vận hành ở release system/dated evidence, không tick
canonical docs chỉ vì command bắt đầu chạy.
