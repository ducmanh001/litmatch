<!-- Đọc cùng CLAUDE.md ở root khi làm việc trong apps/signaling-gateway. -->

# apps/signaling-gateway — application realtime notes

Scale theo số connection/fanout; không sở hữu business state.

## Luật riêng

- Socket.IO xử lý application realtime/presence/chat/control intent. LiveKit tự xử lý WebRTC signaling/media; không proxy SDP/ICE qua gateway.
- Không tính tiền, quyết định match/role hay mint LiveKit token tại đây. Gateway gửi intent tới `core-api`; chỉ `core-api` giữ LiveKit API secret/gọi RoomService.
- Chỉ emit “đã mute/kick/end” sau authoritative result từ `core-api`/LiveKit và reconcile webhook, không optimistic-success cho hành động quyền.
- Multi-instance dùng Redis adapter cho fanout/presence dẫn xuất; Redis không phải source of truth của session/role/billing.
- Connection có auth, heartbeat/timeout, reconnect window và duplicate/out-of-order handling. Disconnect timestamp là tín hiệu; Calling module dùng server time quyết định billing/settlement.
- Mọi thay đổi phải có metric connection, reconnect, event latency/drop, backpressure và test node draining theo [docs/11](../../docs/11-nfr-and-production-readiness.md).
