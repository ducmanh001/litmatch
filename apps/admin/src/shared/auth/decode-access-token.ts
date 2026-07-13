import type { AccessTokenPayload } from '@litmatch/common-dtos/pure';

/**
 * Đọc role từ chính JWT access token (docs/12 § 12.7) — KHÔNG phải nguồn quyết định bảo mật
 * (đó là RolesGuard ở backend), chỉ dùng để gate UX (ẩn shell admin với user thường). Payload
 * hỏng/không đúng dạng → trả null, caller coi như CHƯA xác định được role (fail-closed, không
 * mặc định cho qua).
 */
export function decodeAccessTokenPayload(
  accessToken: string,
): AccessTokenPayload | null {
  const parts = accessToken.split('.');
  if (parts.length !== 3) return null;
  try {
    const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = atob(base64);
    const parsed: unknown = JSON.parse(json);
    if (
      typeof parsed !== 'object' ||
      parsed === null ||
      !('role' in parsed) ||
      typeof (parsed as { role: unknown }).role !== 'string'
    ) {
      return null;
    }
    return parsed as AccessTokenPayload;
  } catch {
    return null;
  }
}
