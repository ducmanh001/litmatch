/**
 * FNV-1a 32-bit thuần, không dùng thư viện ngoài (docs/services/palm-match-service.md § 1, § 3).
 * offset basis 2166136261, prime 16777619 — chuẩn FNV-1a 32-bit.
 * Dùng làm seed deterministic (KHÔNG dùng cho mục đích crypto/bảo mật).
 */
export function fnv1aHash(input: string): number {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return hash >>> 0;
}
