# Media Server

LiveKit SFU configuration/deployment, một trong ba backend deployable. Directory này không phải
NestJS/Nx project và không được chứa business logic hoặc truy cập database.

## Owned artifacts

- `livekit.yaml` — local/self-host configuration và webhook targets
- `livekit.compose.yaml` / `docker-compose.yml` — local media profile
- Deployment production tương ứng nằm ở `k8s/base/media-server` và `deploy/production`

Core API mint token, tạo/xóa room và đổi grants qua media port. Calling/Party Room giữ permission,
membership, timer và billing. Một room vẫn phải vừa một node; tăng replica chỉ scale số room.

Validate Compose syntax khi đổi profile:

```bash
docker compose -f apps/media-server/docker-compose.yml config
```

Đọc [local AGENTS](./AGENTS.md), [architecture § 3.5/3.8.A](../../docs/03-architecture.md) và
[load-test runbook](../../loadtest/README.md) trước khi đổi port, topology hoặc cap.
