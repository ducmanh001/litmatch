/** Mã lỗi của Avatar module (docs/05 § 5.5). */
export const AvatarErrors = {
  ASSET_NOT_FOUND: 'AVATAR_ASSET_NOT_FOUND',
  /** claim() gọi nhầm item phải mua — dùng buy() thay vì claim(). */
  ASSET_REQUIRES_PURCHASE: 'AVATAR_ASSET_REQUIRES_PURCHASE',
  /** buy() gọi nhầm item free — dùng claim() thay vì buy(). */
  ASSET_IS_FREE: 'AVATAR_ASSET_IS_FREE',
  ASSET_SLOT_MISMATCH: 'AVATAR_ASSET_SLOT_MISMATCH',
  ITEM_NOT_OWNED: 'AVATAR_ITEM_NOT_OWNED',
} as const;
