# Deployment artifacts

Directory này giữ artifact theo release profile; procedure và quyết định canonical nằm ở runbook/
ADR tương ứng.

| Path          | Profile                                                       | Canonical guide                                                                                                            |
| ------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| `hosted/`     | Core/Signaling container + env examples cho hosted-free alpha | [ADR 0009](../docs/adr/0009-hosted-free-alpha-release-profile.md), [runbook](../docs/runbooks/hosted-free-release.md)      |
| `production/` | Single-node Compose/Caddy/LiveKit profile                     | [ADR 0008](../docs/adr/0008-zero-cost-single-node-release-profile.md), [runbook](../docs/runbooks/zero-cost-production.md) |
| `../k8s/`     | Kubernetes base/overlays cho scale/HA                         | [K8s guide](../k8s/README.md)                                                                                              |

Env examples chỉ khai key/shape, không chứa secret thật. Release phải pin artifact/SHA, chạy
migration trước app, có rollback/forward plan và smoke evidence. Runtime capability contract phải
phản ánh provider/credential thật sau deploy.
