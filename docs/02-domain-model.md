[← 01 · Product Features](./01-product-features.md) · **02 · Domain Model** · [03 · Architecture →](./03-architecture.md)

# 2. Domain Model tổng thể (theo đúng feature set ở 01-product-features.md)

| Entity | Mô tả |
|---|---|
| `User` | hồ sơ, giới tính, tuổi, avatar, trust score |
| `Wallet` | **snapshot/cache** số dư diamond + VIP tier, ngày hết hạn VIP — là dữ liệu dẫn xuất (derived), rebuild được từ `LedgerEntry`, KHÔNG phải nguồn sự thật |
| `LedgerEntry` | sổ cái kế toán kép: mỗi sự kiện tiền (nạp, trừ, gift, speed-up, hoàn tiền) ghi thành ≥2 bút toán Nợ/Có vào 2 tài khoản nội bộ khác nhau — append-only tuyệt đối, có `idempotency_key` unique ở tầng DB. Xem chi tiết [03-architecture.md § 3.8.C](./03-architecture.md) |
| `Transaction` | metadata cấp cao của 1 giao dịch nghiệp vụ (loại, trạng thái, người liên quan) — trỏ tới nhóm `LedgerEntry` tương ứng, không tự chứa số tiền để tránh 2 nguồn sự thật |
| `MatchTicket` | đại diện 1 yêu cầu ghép của user, có state machine riêng `queued → matched → confirmed → expired/cancelled` (xem [03-architecture.md § 3.8.B](./03-architecture.md)) — tách khỏi `MatchQueue` để tránh trạng thái mơ hồ khi 2 sự kiện đến gần như đồng thời (vd vừa cancel vừa được match) |
| `MatchQueue` | **queue store**: index/cấu trúc dữ liệu tối ưu để matcher worker tìm nhanh ứng viên phù hợp (theo loại: soul/voice, shard theo region + tiêu chí lọc), không tự chứa business state — state thật nằm ở `MatchTicket` |
| `MatchSession` | 1 phiên ghép **đã confirmed**: 2 userId, loại match, trạng thái, thời điểm bắt đầu/kết thúc — được tạo ra khi 1 cặp `MatchTicket` chuyển sang trạng thái `confirmed` |
| `CallSession` | phiên voice/party call: room id, danh sách participant, thời lượng, provider SFU |
| `PartyRoom` | phòng nhóm: host, danh sách speaker/audience, trạng thái mic |
| `MovieSession` | phiên xem chung: video url, playback position, 2 participant |
| `Post` / `Comment` / `Reaction` | Feed |
| `AvatarAsset` / `UserAvatar` | item avatar, cấu hình avatar hiện tại của user |
| `Gift` / `GiftEvent` | catalog quà + log tặng quà |
| `Report` / `Block` | tố cáo, chặn |
| `PalmReadingTemplate` | nội dung bói toán dạng template, chọn random theo input |

> Chi tiết field-level (kiểu dữ liệu, ràng buộc, index) chưa được đặc tả ở đây — khi bắt đầu code 1 module, tạo entity theo đúng tên/quan hệ ở bảng trên, hỏi lại nếu cần quyết định chi tiết field chưa có trong tài liệu này.

---
[← 01 · Product Features](./01-product-features.md) · [03 · Architecture →](./03-architecture.md)
