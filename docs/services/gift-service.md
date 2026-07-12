# Gift Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 3 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/gift`.
> Cơ chế tiền đã CHỐT từ Giai đoạn 1 tại [economy-service.md § 6](./economy-service.md) — file này
> đặc tả phần nghiệp vụ quanh nó.

## 1. Luồng tiền — 1 transaction, 2 chân độc lập theo currency

`EconomyService.sendGift` (facade Economy — Gift KHÔNG đụng ledger trực tiếp):

- Chân DIA: Nợ `user_wallet` (người tặng) / Có `system_gift_pool` = đúng giá quà.
- Chân PTS: Nợ `system_points_mint` / Có `user_earnings` (người nhận) =
  `floor(giá × GIFT_POINTS_RATE_PERCENT / 100)`.
- Cả 2 chân + `GiftEvent` (qua `withinTransaction`) trong **CÙNG 1 DB transaction** — 1 bước fail
  rollback tất cả (chống "trừ mà không cộng" — [10 § Gift](../10-code-review-checklist.md)).
- Idempotency key `gift:send:{senderId}:{clientKey}` unique DB trên `Transaction`; replay trả lại
  đúng `GiftEvent` cũ qua unique `transaction_id` (1 event ↔ 1 transaction).
- Snapshot tỉ lệ áp dụng vào `transactions.metadata` + `gift_events.points_rate_percent`.
- Economy chặn cứng `pointsAwarded > priceDiamond` (bất biến < 1:1 — chống nhân đôi giá trị) và
  tự tặng chính mình. Outbox `economy.gift.sent` ghi cùng transaction (consumer: notification GĐ4).

## 2. Catalog

Bảng `gifts` — giá là DATA trong DB (seed ở migration `1752700000000`, đổi bằng UPDATE/admin,
KHÔNG phải env config). Server **đọc lại giá tại đúng thời điểm tặng**; client chỉ gửi `giftId`,
không bao giờ gửi giá ([10 § Gift](../10-code-review-checklist.md)). `code` là khoá ổn định cho
client map asset/animation. `GET /gifts` chỉ trả quà `active`.

## 3. Ngữ cảnh tặng (GĐ3)

- Tặng trong Party Room: `POST /party/rooms/:roomId/gifts` (header `Idempotency-Key` bắt buộc).
  Người tặng VÀ người nhận phải là member active của phòng active (qua
  `PartyRoomService.getActiveRoomMembers`) — check nghiệp vụ, KHÔNG phải chốt an toàn tiền: tiền
  đúng bất kể race rời-phòng nhờ transaction + idempotency ở Economy.
- **Ngoài scope GĐ3** (mở khi nghiệp vụ cần, sửa spec này trước): tặng trong chat 1-1/call,
  gift combo/lucky gift.

## 4. Guest & chống lạm dụng ([06-domain-rules.md](../06-domain-rules.md))

- Người nhận là **guest → chân PTS = 0** (quà vẫn tặng được, `gift_events.points_awarded = 0`,
  metadata `receiverIsGuest`) — guest không nhận điểm quy đổi.
- Diamond không bao giờ user→user 1:1: chênh lệch (giá − PTS) ở lại `system_gift_pool`.
- PTS giai đoạn đầu chỉ hiển thị + xếp hạng, CHƯA quy đổi ngược (quyết định vận hành, docs/06).

## 5. Hoàn tiền gift — CHƯA làm ở GĐ3 (quyết định mở)

Reverse 1 giao dịch gift sẽ Nợ `user_earnings` (PTS) và bị chặn bởi guard `newEarnings < 0` +
DB `CHECK (earnings >= 0)` ([economy-service.md § 6](./economy-service.md)). GĐ3 giữ nguyên
2 chốt chặn đó và KHÔNG code luồng hoàn gift. Trước khi code (khi PTS có luồng tiêu), phải chốt:
PTS được âm khi reverse, hay chặn hoàn khi người nhận đã tiêu PTS.

## 6. Realtime

`gift.sent` fanout per-user cho member active của phòng, **publish SAU khi transaction tiền
commit** — client CHỈ bắn hiệu ứng sau khi server xác nhận (200/realtime), không bắn trước
([10 § Gift](../10-code-review-checklist.md)). Best-effort: phòng đóng giữa chừng → mất hiệu ứng,
giao dịch vẫn hợp lệ.

## 7. Config

`GIFT_POINTS_RATE_PERCENT` (int 0–100, default 40; docs/06 đề xuất 30–50, **phải < 100 ở
production**). Validation ở `env.validation.ts`, mẫu ở `.env.example`.
