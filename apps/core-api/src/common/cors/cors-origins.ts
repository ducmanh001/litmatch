/**
 * Parse + validate `CORS_ORIGINS` (docs/12 § 12.7 Task 0 point 3 — "CORS allow-list có
 * validation, không dùng origin: true"). Throw `Error` với message rõ ràng khi sai —
 * `env.validation.ts` gọi hàm này trong Joi `.custom()` để chết ngay lúc boot thay vì
 * `enableCors` âm thầm nhận origin sai định dạng. Chuỗi rỗng = deny mọi origin (mảng rỗng),
 * `main.ts` map mảng rỗng → `enableCors({ origin: false })`.
 */
export function parseCorsOrigins(raw: string): string[] {
  const origins = raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

  for (const origin of origins) {
    let parsed: URL;
    try {
      parsed = new URL(origin);
    } catch {
      throw new Error(
        `CORS_ORIGINS có origin không hợp lệ: "${origin}" (phải dạng http(s)://host[:port])`,
      );
    }
    if (!/^https?:$/.test(parsed.protocol)) {
      throw new Error(`CORS_ORIGINS chỉ chấp nhận http/https: "${origin}"`);
    }
    if (parsed.pathname !== '/' || parsed.search !== '' || parsed.hash !== '') {
      throw new Error(
        `CORS_ORIGINS phải là origin thuần (không path/query/hash): "${origin}"`,
      );
    }
  }

  return origins;
}
