# 0001. LiveKit self-host làm Media Server chính từ Giai đoạn 2

- **Ngày**: 2026-07-10
- **Trạng thái**: Accepted
- **Liên quan**: [docs/03-architecture.md § 3.8.A](../03-architecture.md), [docs/04-tech-stack.md](../04-tech-stack.md)

## Bối cảnh

Mục tiêu dự án là Litmatch-scale (hàng trăm nghìn – hàng triệu CCU), không phải MVP. SFU là thành phần khó đổi nhất giữa chừng: chuyển SFU khi đã có hàng trăm phòng sống là việc cực tốn công. Party Room (N người) làm số consumer tăng theo N×(N-1) nên chạm ngưỡng 1 node rất sớm — bắt buộc cần cascade/distributed mesh.

## Quyết định

Dùng **LiveKit self-host** làm Media Server chính ngay từ Giai đoạn 2, không bắt đầu bằng mediasoup rồi chuyển sau.

## Phương án đã loại & lý do

- **mediasoup** — là thư viện xây SFU, không phải sản phẩm: toàn bộ phần distributed (quản lý worker, route signaling, `pipeToRouter` đa host) phải tự viết; đúng phần Litmatch-scale cần thì mediasoup không cho sẵn. Giữ làm phương án dự phòng nếu LiveKit gặp trở ngại lớn.
- **LiveKit Cloud** — chưa loại hẳn; self-host trước để tự chủ chi phí/dữ liệu, cân nhắc lại ở Giai đoạn 7 khi có số liệu vận hành thật.

## Hệ quả

- Trả trước chi phí học LiveKit (rẻ hơn nhiều chi phí đổi SFU giữa chừng).
- `apps/media-server` là LiveKit sidecar, không business logic (docs/03 § 3.3).
- Đổi lại quyết định này thì phải tạo ADR mới + sửa docs/03 và docs/04 **trước khi** code.
