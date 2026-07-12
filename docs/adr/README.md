# ADR — Architecture Decision Records

Mỗi quyết định kiến trúc/công nghệ **đã chốt** ghi thành 1 file `NNNN-ten-quyet-dinh.md`, đánh số tăng dần, không xoá/sửa ADR cũ — quyết định bị thay thì tạo ADR mới và ghi `Superseded by NNNN` vào ADR cũ (cùng triết lý append-only với ledger).

Quan hệ với `docs/03-architecture.md`: file 03 mô tả kiến trúc **hiện hành** (trạng thái đích), ADR ghi **lịch sử vì sao chốt như vậy** (bối cảnh, phương án đã loại, hệ quả). Khi chốt 1 quyết định mới: cập nhật 03 (hoặc file docs liên quan) + thêm 1 ADR, trong cùng commit.

## Template

```markdown
# NNNN. <Tên quyết định>

- **Ngày**: YYYY-MM-DD
- **Trạng thái**: Accepted | Superseded by NNNN
- **Liên quan**: docs/03-architecture.md § x.y, ...

## Bối cảnh

<vấn đề gì buộc phải quyết định, ràng buộc nào>

## Quyết định

<chốt gì, 1-3 câu>

## Phương án đã loại & lý do

<mỗi phương án 1 dòng: tên — lý do loại>

## Hệ quả

<đánh đổi chấp nhận, việc phát sinh phải làm, điều kiện xem xét lại>
```

## Danh sách

| #                                                     | Quyết định                                               | Ngày       | Trạng thái |
| ----------------------------------------------------- | -------------------------------------------------------- | ---------- | ---------- |
| [0001](./0001-livekit-self-host-lam-media-server.md)  | LiveKit self-host làm Media Server chính từ Giai đoạn 2  | 2026-07-10 | Accepted   |
| [0002](./0002-browser-refresh-token-local-storage.md) | Browser V1 giữ refresh token trong localStorage          | 2026-07-13 | Superseded |
| [0003](./0003-browser-auth-production-gate.md)        | Browser localStorage chỉ là scaffold, production có gate | 2026-07-13 | Accepted   |
