import { z } from 'zod';

/**
 * Client chỉ chọn các intent này — region/ageBand server tự derive
 * (docs/services/matching-service.md). `useDiamond` mặc định false vì UI hiện tại
 * chưa chọn lượt match trả phí; quyết định quota/giá/debit vẫn thuộc server.
 * (không dùng `.default()` ở đây — tránh input/output type lệch nhau khi dùng với RHF resolver).
 */
export const joinQueueSchema = z.object({
  matchType: z.enum(['soul', 'voice']),
  useDiamond: z.boolean(),
  genderPreference: z.enum(['any', 'male', 'female']),
});

export type JoinQueueForm = z.infer<typeof joinQueueSchema>;
