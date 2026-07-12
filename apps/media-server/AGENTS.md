# media-server — hướng dẫn theo scope

Đọc `../../AGENTS.md` trước. Đây là tầng media/SFU, không chứa business logic hoặc truy cập DB.

- SFU đã chốt là LiveKit self-host; muốn đổi phải cập nhật quyết định kiến trúc trước.
- Giới hạn speaker/phòng lấy từ config, không hardcode.
- Giải phóng room/resource khi call hoặc party kết thúc.
- Cascade nhiều node chỉ triển khai khi số liệu vận hành chứng minh nhu cầu.
