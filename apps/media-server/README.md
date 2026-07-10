# media-server

Thư mục cấu hình local/deployment cho **LiveKit self-host**, không phải app NestJS/Nx và không chứa business logic. Client dùng LiveKit SDK kết nối trực tiếp tới public LiveKit WSS/WebRTC/TURN sau khi nhận token room-scoped từ `core-api`; `core-api` là caller duy nhất giữ API secret/gọi RoomService.

Self-host multi-node dùng Redis để phân phối nhiều room, nhưng một room phải fit trên một node. Capacity phải đo theo publisher/subscriber/codec/bitrate; Party Room có `S` speaker và `N` participant xấp xỉ `S × (N-1)` subscription nếu mọi participant nghe mọi speaker.

Local:

```bash
docker compose up -d redis
docker compose -f apps/media-server/docker-compose.yml up -d
```

`livekit.yaml` và image tag hiện chỉ phục vụ development. Production phải pin image/Helm version, dùng secret manager, TLS/TURN/public IP, webhook inbox, node draining và load test theo [docs/11 § 11.5](../../docs/11-nfr-and-production-readiness.md). Kiến trúc đầy đủ: [docs/03 § 3.2-3.5](../../docs/03-architecture.md).
