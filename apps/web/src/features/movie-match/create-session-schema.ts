import { z } from 'zod';

/**
 * Chỉ chặn rỗng ở client — domain whitelist (youtube.com/youtu.be) do server validate thật
 * (docs/services/movie-match-service.md § 3), FE không nên tự chế regex chặn cứng vì dễ lệch
 * với luật server và chặn nhầm URL hợp lệ.
 */
export const createSessionSchema = z.object({
  friendUserId: z.string().min(1, 'Chọn 1 người bạn để xem chung.'),
  videoUrl: z.string().min(1, 'Nhập link video YouTube.'),
});

export type CreateSessionForm = z.infer<typeof createSessionSchema>;
