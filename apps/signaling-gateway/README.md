# Signaling Gateway

NestJS/Socket.IO gateway cho authenticated realtime fanout. Gateway scale theo connection, dùng
Redis pub/sub + Socket.IO adapter và không sở hữu business decision.

## Boundary

- JWT handshake và room theo user.
- Relay event từ Core API sau commit.
- Distributed connection quota qua Redis lease; fail closed khi quota authority không sẵn sàng.
- Không matching, billing, permission hay LiveKit control.

Connection quota:

- `WS_MAX_CONNECTIONS_PER_USER` — mặc định/trần hiện hành `3`
- `WS_CONNECTION_LEASE_MS` — mặc định `90000`, validation `10000..300000`
- `WS_CONNECTION_LEASE_REFRESH_MS` — chu kỳ gia hạn lease; `0` (mặc định) = lease/3

Fanout và shard Redis (docs/services/realtime-gateway.md § 5–7):

- `WS_FANOUT_MODE` — `user` (mặc định: chỉ subscribe user có socket trên pod) hoặc `pattern` (PSUBSCRIBE cũ)
- `REALTIME_REDIS_URLS` — danh sách Redis shard theo userId; rỗng = một shard là `REDIS_URL`. Phải giống core-api.

Client nhận `CONNECTION_LIMIT` khi hết slot và `CONNECTION_QUOTA_UNAVAILABLE` khi không thể xác minh
quota lúc handshake. Lease được gia hạn gộp lô khi socket sống và tự hết hạn sau process failure; Redis
chớp không ngắt socket đang sống, chỉ ngắt khi lease cục bộ hết hạn mà không gia hạn được.

## Commands

```bash
pnpm nx serve signaling-gateway
pnpm nx test signaling-gateway
pnpm nx lint signaling-gateway
pnpm nx build signaling-gateway
pnpm nx e2e signaling-gateway-e2e
```

Đọc [local AGENTS](./AGENTS.md), [Realtime spec](../../docs/services/realtime-gateway.md) và
[architecture § 3.3](../../docs/03-architecture.md) trước khi đổi handshake/transport.
