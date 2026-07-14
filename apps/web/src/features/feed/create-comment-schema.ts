import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (CreateCommentDto, max 1000). */
export const createCommentSchema = z.object({
  content: z.string().trim().min(1, 'Nhập nội dung bình luận').max(1000),
});

export type CreateCommentForm = z.infer<typeof createCommentSchema>;
