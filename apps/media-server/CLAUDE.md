<!-- Claude Code đọc file này CÙNG VỚI CLAUDE.md ở root khi làm việc trong apps/media-server. -->

# apps/media-server — ghi chú riêng

Sidecar Pattern: tầng "cơ bắp" chuyển tiếp gói RTP, **tuyệt đối không business logic, không query DB, không biết về diamond/quyền/user profile**. Xem `../../docs/03-architecture.md § 3.3`.

## Riêng cho app này

- **Chọn mediasoup hay LiveKit theo mục tiêu scale** — quyết định này nên chốt sớm, đổi giữa chừng khi đã có phòng sống là rất tốn kém. Xem `../../docs/03-architecture.md § 3.8.A` trước khi implement.
- Nếu dùng mediasoup: 1 Worker = 1 CPU core, 1 Router ≈ 1 room, ước lượng ~500 consumer/worker (không phải 500 participant — N người trong phòng tạo N-1 consumer/người). Xem `../../docs/03-architecture.md § 3.5`.
- **Giới hạn cứng số speaker/phòng** (config được từ `core-api`, không hardcode ở đây) — Party Room chạm ngưỡng tải sớm hơn Voice Match rất nhiều vì consumer tăng theo N×(N-1).
- Giải phóng room ngay khi call/party kết thúc — không giải phóng đúng lúc gây leak resource, xem `../../docs/10-code-review-checklist.md § Calling/Signaling/SFU`.
- Việc cascade nhiều node (`pipeToRouter` hoặc LiveKit mesh) là việc của vận hành ở quy mô lớn (`../../docs/07-roadmap.md § Giai đoạn 7`), không phải việc dựng nền tảng ban đầu.
