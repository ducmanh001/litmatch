# signaling-gateway — hướng dẫn theo scope

Đọc `../../AGENTS.md` trước. Gateway scale theo kết nối đồng thời và chỉ điều phối realtime.

- Không chứa quyết định business như tính tiền hoặc matching; gọi internal API của `core-api`.
- Lệnh điều khiển media phải đợi ACK trước khi cập nhật trạng thái hoàn tất.
- Nhiều instance phải dùng Redis adapter cho Socket.IO.
- Mọi kết nối realtime cần timeout và cleanup rõ ràng.
- Free-call timer tính ở server, không tin số liệu client.
