/** Ngày UTC hiện tại theo giờ SERVER, dạng `YYYY-MM-DD` — không phải giờ địa phương client. */
export function todayUtc(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Số ngày lịch UTC giữa 2 chuỗi `YYYY-MM-DD` (luôn >= 0 khi `to` sau `from`). */
export function daysBetweenUtc(from: string, to: string): number {
  const msPerDay = 24 * 60 * 60 * 1000;
  const fromMs = Date.parse(`${from}T00:00:00.000Z`);
  const toMs = Date.parse(`${to}T00:00:00.000Z`);
  return Math.round((toMs - fromMs) / msPerDay);
}

/** Cộng `days` ngày lịch UTC vào 1 chuỗi `YYYY-MM-DD`, trả về chuỗi cùng định dạng. */
export function addDaysUtc(date: string, days: number): string {
  const ms = Date.parse(`${date}T00:00:00.000Z`) + days * 24 * 60 * 60 * 1000;
  return new Date(ms).toISOString().slice(0, 10);
}
