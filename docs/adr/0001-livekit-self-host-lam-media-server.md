# 0001. LiveKit self-host làm Media Server chính từ Giai đoạn 2

- **Ngày**: 2026-07-10
- **Trạng thái**: Accepted
- **Liên quan**: [docs/03-architecture.md § 3.8.A](../03-architecture.md), [docs/04-tech-stack.md](../04-tech-stack.md)

## Bối cảnh

Mục tiêu dự án là Litmatch-scale (hàng trăm nghìn – hàng triệu CCU), không phải MVP. SFU là
thành phần khó đổi giữa chừng. Dự án cần một media server có control API/SDK, webhook và cách
scale ngang nhiều room bằng các node đồng nhất; đồng thời domain không được phụ thuộc trực tiếp
type của provider.

## Quyết định

Dùng **LiveKit self-host** làm Media Server chính ngay từ Giai đoạn 2, không bắt đầu bằng mediasoup rồi chuyển sau.

## Phương án đã loại & lý do

- **mediasoup** — là thư viện mức thấp hơn; team phải tự sở hữu thêm control plane, lifecycle và
  routing. Giữ làm phương án dự phòng nếu LiveKit gặp trở ngại lớn.
- **LiveKit Cloud** — chưa loại hẳn; self-host trước để tự chủ chi phí/dữ liệu, cân nhắc lại ở Giai đoạn 7 khi có số liệu vận hành thật.

## Hệ quả

- Trả trước chi phí học/vận hành LiveKit để tránh đổi provider sau khi domain đã tích hợp sâu.
- `apps/media-server` là deployable LiveKit không business logic (docs/03 § 3.3).
- Redis/multi-node scale theo số room; **một room self-host vẫn phải vừa một node**. Party Room
  cần cap + load test; nếu phải vượt biên này thì tạo ADR mới về topology/provider.
- Đổi lại quyết định này thì phải tạo ADR mới + sửa docs/03 và docs/04 **trước khi** code.

> **Đính chính 2026-07-13**: bỏ giả định “distributed mesh tự chia một room qua nhiều node”.
> Tài liệu LiveKit self-host hiện hành nêu rõ multi-node chọn node host room và một room phải vừa
> trên một node. Đính chính không đổi quyết định chọn LiveKit, nhưng đổi capacity model bắt buộc.
