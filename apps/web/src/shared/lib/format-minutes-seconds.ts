/** Hiển thị duration không âm theo `m:ss`; cho phép phút vượt 59 vì các flow không hiện giờ. */
export function formatMinutesSeconds(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}
