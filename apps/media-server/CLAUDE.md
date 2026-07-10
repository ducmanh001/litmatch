<!-- Đọc cùng CLAUDE.md ở root khi làm việc trong apps/media-server. -->

# apps/media-server — LiveKit deployment notes

Đây là config/deployment cho LiveKit self-host, không phải nơi viết business logic. LiveKit không query DB/ledger/profile; nó **có** biết participant identity/grant đã ký trong token để enforce media permission.

## Luật riêng

- SFU đã chốt là LiveKit self-host theo [docs/03 § 3.8.A](../../docs/03-architecture.md).
- Client kết nối trực tiếp tới LiveKit; không route media/SDP/ICE qua Socket.IO gateway.
- Chỉ `core-api` giữ LiveKit API secret và gọi RoomService. Không copy secret/caller quyền cao sang Signaling Gateway nếu chưa có ADR threat-model riêng.
- Multi-node self-host phân phối room qua Redis; **một room/node**, không ghi hoặc triển khai “cascade room qua nhiều node” như tính năng sẵn có.
- Capacity theo active publisher/subscriber/bitrate/packet workload. Party có `S` speaker, `N` participant thì subscription xấp xỉ `S × (N-1)` nếu tất cả nghe tất cả; không dùng mặc định `N × (N-1)`.
- Participant/speaker cap do `core-api` quyết định từ config/policy; chỉ tăng sau load test đúng environment.
- Room cleanup dựa trên server-authoritative session + signed webhook/reconciliation; event duplicate/out-of-order phải idempotent.
- Production pin image/Helm version, dùng secret manager, TLS/TURN/public IP, readiness/draining và gate [docs/11 § 11.5](../../docs/11-nfr-and-production-readiness.md).
