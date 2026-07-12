# media-server

SFU (**LiveKit self-host — đã chốt**, xem `../../docs/03-architecture.md § 3.8.A`), backend
deployable không business logic, chỉ chuyển tiếp media. Giai đoạn 0 đã có config skeleton
(`livekit.yaml` + `docker-compose.yml` local); tích hợp Voice Match/Party Room nằm trong
`core-api` qua media port — xem `../../docs/07-roadmap.md`.

Xem `AGENTS.md` trong thư mục này trước khi thêm code.
