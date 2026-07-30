export const CAPABILITY_IDS = [
  'auth.phoneOtp',
  'auth.google',
  'auth.apple',
  'auth.facebook',
  'topUp.web',
  'topUp.native',
  'video.upload',
  'video.transcode',
  'notifications.push',
] as const;

export type CapabilityId = (typeof CAPABILITY_IDS)[number];

const CAPABILITY_ID_SET = new Set<string>(CAPABILITY_IDS);

/**
 * Operator chỉ được đưa capability đang hoạt động vào maintenance. Availability gốc vẫn được
 * service suy ra từ adapter/credential thật, nên cấu hình này không thể bật một provider còn thiếu.
 */
export function parseMaintenanceCapabilities(value: string): Set<CapabilityId> {
  if (value.trim() === '') return new Set();
  const ids = value.split(',').map((item) => item.trim());
  for (const id of ids) {
    if (!CAPABILITY_ID_SET.has(id)) {
      throw new Error(`Capability maintenance không hợp lệ: ${id}`);
    }
  }
  return new Set(ids as CapabilityId[]);
}
