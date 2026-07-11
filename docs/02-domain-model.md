[← 01 · Product Features](./01-product-features.md) · **02 · Domain Model** · [03 · Architecture →](./03-architecture.md)

# 2. Domain Model tổng thể (theo đúng feature set ở 01-product-features.md)

| Entity | Mô tả |
|---|---|
| `User` | hồ sơ, giới tính, tuổi, avatar, trust score |
| `Wallet` | **snapshot/cache** số dư diamond (`balance`, DIA) + điểm quy đổi (`earnings`, PTS) + VIP tier, ngày hết hạn VIP — là dữ liệu dẫn xuất (derived), rebuild được từ `LedgerEntry`, KHÔNG phải nguồn sự thật; cập nhật trong **cùng transaction DB** với bút toán ledger (xem [03-architecture.md § 3.8.C](./03-architecture.md)). `balance` **có thể âm** sau refund/chargeback (user nợ diamond) — **không đặt CHECK >= 0 ở DB**; chống tiêu quá số dư là guard tầng ứng dụng khi `SELECT ... FOR UPDATE` (chi tiết [services/economy-service.md § 5](./services/economy-service.md)) |
| `LedgerAccount` | **tài khoản nội bộ của sổ cái kép** — mỗi bút toán Nợ/Có trỏ vào 1 account. `kind` (`user_wallet`, `user_earnings`, `system_iap`, `system_revenue`, `system_gift_pool`, `system_points_mint`, `system_adjustment`) + `user_id` (null với tài khoản hệ thống) + `currency` (`DIA`/`PTS`). Unique (kind, user_id, currency). Là entity **bắt buộc** của double-entry — không có nó thì không định vị được Nợ/Có đi đâu; chi tiết [services/economy-service.md § 1](./services/economy-service.md) |
| `LedgerEntry` | sổ cái kế toán kép: mỗi sự kiện tiền (nạp, trừ, gift, speed-up, hoàn tiền) ghi thành ≥2 bút toán Nợ/Có vào 2 `LedgerAccount` khác nhau — append-only tuyệt đối (DB trigger chặn UPDATE/DELETE), mỗi bút toán trỏ về `transaction_id` của `Transaction` cha + `account_id`. Số tiền là **số nguyên dương** (bigint), chiều tiền do cột Nợ/Có quyết định (không dùng số âm). **Idempotency key KHÔNG nằm ở bảng này** (1 giao dịch tạo ≥2 bút toán cùng key, unique constraint ở đây sẽ chặn chính bút toán thứ 2 của giao dịch hợp lệ) — key nằm ở `Transaction`. Xem chi tiết [03-architecture.md § 3.8.C](./03-architecture.md) |
| `Transaction` | metadata cấp cao của 1 giao dịch nghiệp vụ (loại, trạng thái, `actor_user_id` = ai khởi tạo/null nếu hệ thống, `reversal_of` trỏ giao dịch gốc khi là bút toán đảo, `metadata` lưu **snapshot giá tại thời điểm giao dịch** — versioned pricing) — trỏ tới nhóm `LedgerEntry` tương ứng, không tự chứa số tiền để tránh 2 nguồn sự thật; mang `idempotency_key` với **unique constraint ở tầng DB** (1 key cho cả giao dịch — request trùng key trả lại kết quả giao dịch cũ) |
| `IapProduct` / `IapReceipt` | catalog product store → số diamond; receipt đã verify server-side (unique theo provider + provider_transaction_id, chặn double-credit và replay ở DB; `status` = credited/refunded) — nguồn đối soát với Apple/Google, gồm cả refund/chargeback ([services/economy-service.md § 5](./services/economy-service.md)) |
| `VipPlan` | catalog gói VIP: giá diamond + số ngày + tier — không hardcode trong code (giá lưu snapshot vào `Transaction.metadata` khi mua) |
| `OutboxEvent` | event Economy ghi **cùng DB transaction** với ledger rồi relay publish Kafka (Outbox Pattern, [03 § 3.6](./03-architecture.md)) — là hợp đồng cho các module khác nghe phản ứng phụ (notification/analytics/trust score), không đọc thẳng bảng Economy |
| `MatchTicket` | đại diện 1 yêu cầu ghép của user, có state machine riêng `queued → matched → confirmed → expired/cancelled` (xem [03-architecture.md § 3.8.B](./03-architecture.md)) — tách khỏi `MatchQueue` để tránh trạng thái mơ hồ khi 2 sự kiện đến gần như đồng thời (vd vừa cancel vừa được match) |
| `MatchQueue` | **queue store**: index/cấu trúc dữ liệu tối ưu để matcher worker tìm nhanh ứng viên phù hợp (theo loại: soul/voice, shard theo region + tiêu chí lọc), không tự chứa business state — state thật nằm ở `MatchTicket` |
| `MatchSession` | 1 phiên ghép **đã confirmed**: 2 userId, loại match, trạng thái, thời điểm bắt đầu/kết thúc — được tạo ra khi 1 cặp `MatchTicket` chuyển sang trạng thái `confirmed` |
| `CallSession` | phiên voice/party call: room id, danh sách participant, thời lượng, provider SFU |
| `PartyRoom` | phòng nhóm: host, danh sách speaker/audience, trạng thái mic |
| `MovieSession` | phiên xem chung: video url, playback position, 2 participant |
| `Friendship` | quan hệ bạn bè 2 chiều — tạo ra khi cả 2 "Thích" sau Soul/Voice Match (thời điểm unlock profile) |
| `Conversation` / `Message` | chat 1-1 lâu dài giữa 2 user đã là bạn — KHÁC chat room ẩn danh tạm thời của Soul Match (chat ẩn danh gắn với `MatchSession`, khoá lại khi session kết thúc) |
| `Post` / `Comment` / `Reaction` | Feed |
| `AvatarAsset` / `UserAvatar` | item avatar, cấu hình avatar hiện tại của user |
| `Gift` / `GiftEvent` | catalog quà + log tặng quà. Tặng quà = **1 transaction 2 chân độc lập theo currency** (trừ DIA người tặng, cộng PTS người nhận theo tỉ lệ quy đổi < 1:1), không chuyển DIA thẳng user→user — chi tiết [services/economy-service.md § 6](./services/economy-service.md), [06 § Gift](./06-domain-rules.md) |
| `Report` / `Block` | tố cáo, chặn |
| `PalmReadingTemplate` | nội dung bói toán dạng template, chọn random theo input |

> Chi tiết field-level (kiểu dữ liệu, ràng buộc, index) chưa được đặc tả ở đây — khi bắt đầu code 1 module, tạo entity theo đúng tên/quan hệ ở bảng trên, hỏi lại nếu cần quyết định chi tiết field chưa có trong tài liệu này.

---
[← 01 · Product Features](./01-product-features.md) · [03 · Architecture →](./03-architecture.md)
