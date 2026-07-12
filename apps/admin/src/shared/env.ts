import { z } from 'zod';

/**
 * Nguồn duy nhất đọc `import.meta.env` (docs/13 § 13.10, guard enforce) — validate lúc
 * boot, thiếu/sai env chết ngay với message rõ, không chạy tiếp với `undefined`.
 * Thêm biến mới: schema này + `.env.example` của app trong cùng PR.
 */
const envSchema = z.object({
  /** Origin core-api, KHÔNG kèm /api/v1 (spec đã chứa prefix trong path). */
  VITE_API_URL: z.url(),
});

export const env = envSchema.parse({
  VITE_API_URL: import.meta.env['VITE_API_URL'],
});
