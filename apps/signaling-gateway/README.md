# signaling-gateway

WebSocket gateway cho Voice Match / Party Room, connection-bound, tách riêng khỏi core-api để scale ngang độc lập. Skeleton đã dựng ở Giai đoạn 0 (Socket.IO + health); logic signaling thật thuộc Giai đoạn 2 — xem `../../docs/07-roadmap.md`.

Connection quota dùng Redis làm authority chung giữa replica:

- `WS_MAX_CONNECTIONS_PER_USER` (mặc định và trần cứng `3`)
- `WS_CONNECTION_LEASE_MS` (mặc định `90000`, giới hạn `10000..300000`)

Gateway từ chối handshake với `CONNECTION_LIMIT` khi đủ slot. Khi Redis quota không khả dụng,
gateway fail closed bằng `CONNECTION_QUOTA_UNAVAILABLE`; lease được refresh khi socket sống và tự
hết hạn nếu process chết trước khi chạy disconnect cleanup.

Xem `AGENTS.md` trong thư mục này và `../../docs/03-architecture.md § 3.3`.
