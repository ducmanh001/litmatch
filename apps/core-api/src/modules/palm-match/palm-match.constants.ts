/** Hằng số/helper dùng bởi ≥2 file trong module (docs/05 § 5.1). */

/** Seed string đầu vào cho fnv1aHash — gói lại để không lệch định dạng giữa các chỗ gọi. */
export function palmMatchSeedInput(
  userId: string,
  category: string,
  forDate: string,
): string {
  return `${userId}:${category}:${forDate}`;
}

export interface PalmZodiacSign {
  key: string;
  symbol: string;
  name: string;
}

/** Catalog trình bày ổn định; session chỉ lưu key để snapshot gọn và API hydrate từ đây. */
export const PALM_ZODIAC_SIGNS: readonly PalmZodiacSign[] = [
  { key: 'aries', symbol: '♈', name: 'Bạch Dương' },
  { key: 'taurus', symbol: '♉', name: 'Kim Ngưu' },
  { key: 'gemini', symbol: '♊', name: 'Song Tử' },
  { key: 'cancer', symbol: '♋', name: 'Cự Giải' },
  { key: 'leo', symbol: '♌', name: 'Sư Tử' },
  { key: 'virgo', symbol: '♍', name: 'Xử Nữ' },
  { key: 'libra', symbol: '♎', name: 'Thiên Bình' },
  { key: 'scorpio', symbol: '♏', name: 'Bọ Cạp' },
  { key: 'sagittarius', symbol: '♐', name: 'Nhân Mã' },
  { key: 'capricorn', symbol: '♑', name: 'Ma Kết' },
  { key: 'aquarius', symbol: '♒', name: 'Bảo Bình' },
  { key: 'pisces', symbol: '♓', name: 'Song Ngư' },
] as const;

export const PALM_MATCH_ADVISORY_LOCK_KEY = 'litmatch:palm-match:pairing';
