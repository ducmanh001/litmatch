# signaling-gateway

Socket.IO gateway cho **application realtime**: presence, chat/session event và control intent của Voice/Party. Gateway tách khỏi `core-api` để scale theo connection/fanout.

Gateway **không** proxy LiveKit SDP/ICE/media, không giữ LiveKit API secret và không tự quyết định match/role/billing. Client kết nối LiveKit trực tiếp; control intent đi Gateway → `core-api` authorize/orchestrate → LiveKit RoomService → authoritative update trở lại Gateway.

Khi nhiều instance, dùng Socket.IO Redis adapter cho fanout/presence dẫn xuất. Business state vẫn ở `core-api`/Postgres; phải chịu reconnect, duplicate/out-of-order event và timeout. Xem [docs/03 § 3.2-3.7](../../docs/03-architecture.md) và [docs/11](../../docs/11-nfr-and-production-readiness.md).
