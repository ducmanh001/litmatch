<!-- Claude Code đọc file này CÙNG VỚI CLAUDE.md ở root khi làm việc trong apps/signaling-gateway. -->

# apps/signaling-gateway — ghi chú riêng

WebSocket gateway, scale theo số **kết nối đồng thời** (connection-bound) — khác quy luật scale của `core-api` (CPU/DB-bound). Xem `../../docs/03-architecture.md § 3.3`.

## Riêng cho app này

- **Không chứa business logic nặng** (tính tiền, quyết định match...) — gọi `core-api` qua internal API để lấy quyết định, gateway chỉ điều phối kết nối/room/tín hiệu.
- **Điều khiển Media Server**: gửi lệnh (mute/kick/đổi quyền) qua internal control API, **phải đợi ACK** trước khi coi hành động đã hoàn tất — không tự cập nhật state ở gateway rồi coi như xong (xem lỗi cụ thể ở `../../docs/10-code-review-checklist.md § Calling/Signaling/SFU`).
- **Chạy nhiều instance**: bắt buộc dùng Redis adapter cho Socket.IO để đồng bộ state (ai đang ở phòng nào, ai đang speaker) giữa các instance — thiếu cái này gây lệch trạng thái phòng khi scale ngang (`../../docs/07-roadmap.md § Giai đoạn 6`).
- **Timeout bắt buộc** cho mọi kết nối WebSocket — không để client đơ giữa chừng làm phòng "vô chủ" không ai dọn.
- **Free-call timer tính ở server**, không tin báo cáo từ client (`../../docs/06-domain-rules.md`).
