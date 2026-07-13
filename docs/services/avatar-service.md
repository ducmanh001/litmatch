# Avatar Service (module trong `core-api`) — đặc tả chi tiết

> Giai đoạn 4 ([07-roadmap.md](../07-roadmap.md)). Module `apps/core-api/src/modules/avatar`.
> Model đã chốt với user: **multi-layer thật** (đúng docs/01 #7 "item, layer ghép hình" — kiểu
> Bitmoji/Zepeto), không phải chọn 1 avatar hoàn chỉnh. `User.avatarId` (từ Giai đoạn 0) giữ
> nguyên, KHÔNG đụng tới — module này hoàn toàn additive, không migrate/ghi đè cột đó.

## 1. Data model

- `AvatarAsset` (catalog): `slot` (enum `base|hair|face|outfit|accessory`), `code`, `name`,
  `imageUrl` (layer image, client tự ghép theo `zIndex`), `zIndex`, `priceDiamond` (giá là DATA
  trong DB — server đọc lại tại thời điểm mua, không tin client, cùng nguyên tắc Gift catalog;
  `0` = item free/mặc định), `active`, `sortOrder`.
- `UserAvatarItem`: sở hữu — `(userId, avatarAssetId)` unique. Nguồn sự thật "user có item này
  chưa", tách khỏi `UserAvatarConfig` (đang trang bị) để 1 user có thể sở hữu nhiều item cùng
  slot nhưng chỉ trang bị 1.
- `UserAvatarConfig`: 1 dòng/user (PK = `userId`), 5 cột nullable
  `baseAssetId/hairAssetId/faceAssetId/outfitAssetId/accessoryAssetId` — item đang trang bị mỗi
  slot. Lazy-init lúc gọi `getMyAvatar` lần đầu (không cần hook vào Auth/User lúc đăng ký — tránh
  đụng 2 module đã ổn định).

## 2. Mua item — dùng `EconomyService.spendDiamond` generic (không cần chân PTS như Gift)

- `priceDiamond = 0`: `claim()` — ghi `UserAvatarItem` trực tiếp, `ON CONFLICT DO NOTHING`
  (idempotent, không cần đi qua Economy vì không có tiền để trừ).
- `priceDiamond > 0`: `buy()` theo ĐÚNG pattern đã có ở Matching speed-up (docs/services/
  matching-service.md § 4) — generic `spendDiamond` KHÔNG có hook `withinTransaction` (khác
  `sendGift`), nên thứ tự bắt buộc: **spendDiamond (idempotent theo key) → ghi `UserAvatarItem`
  idempotent (`ON CONFLICT DO NOTHING` theo `(userId, avatarAssetId)`)**. Retry sau khi tiền đã
  trừ nhưng crash trước khi ghi sở hữu vẫn an toàn: replay cùng idempotency key không trừ tiền
  lần 2, ghi sở hữu lần 2 là no-op nhờ constraint.
- `TransactionType.AvatarPurchase` mới trong `economy/entities/transaction.entity.ts` — cột
  `type` là `varchar(32)` (không phải Postgres enum), thêm giá trị không cần migration.

## 3. Trang bị (equip) — chống IDOR (docs/10 § Avatar)

`equip(userId, slot, avatarAssetId)`:

1. Asset tồn tại + `active` + đúng `slot` yêu cầu (chặn gửi `slot=hair` nhưng `assetId` là item
   `outfit`).
2. **User thực sự sở hữu item** (`UserAvatarItem` tồn tại cho đúng cặp `(userId, assetId)`) —
   chốt chặn chính cho pitfall "trang bị item người khác/chưa mua" (docs/10 § Avatar/Item/Inventory).
3. Update đúng cột slot trên `UserAvatarConfig` (upsert nếu chưa có dòng — lazy-init).

Không có item nào giới hạn số lượng (không phải item event/limited) ở GĐ4 — pitfall "race dùng
item limited-quantity" (docs/10 § Avatar) hiện N/A, ghi rõ lý do thay vì tự chế guard cho tình
huống chưa tồn tại (docs/11).

## 4. Xem avatar

- `GET /avatar/me` — config của chính mình + resolve sang danh sách layer (asset đầy đủ, sắp theo
  `zIndex`) để client ghép hình.
- `GET /avatar/users/:userId` — xem avatar người khác (public, không cần bạn bè — avatar là thông
  tin hiển thị công khai như nickname), read-only, không có bước ownership check.

## 5. Ngoài scope GĐ4

- Item limited-quantity/event (giới hạn số lượng bán) — chưa có.
- Hoàn tiền khi mua nhầm item — chưa có (giống Gift, quyết định mở).
- Migrate `User.avatarId` sang derive từ `UserAvatarConfig` — KHÔNG làm ở GĐ4, giữ nguyên tách biệt.
