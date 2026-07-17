import { z } from 'zod';

/** `CreateVideoCommentDto` (short-video.dtos.ts) chỉ yêu cầu string, không giới hạn độ dài —
 * chặn rỗng ở client cho UX, không tự thêm max không có ở backend. */
export const createVideoCommentSchema = z.object({
  content: z.string().trim().min(1, 'Nhập nội dung bình luận'),
});

export type CreateVideoCommentForm = z.infer<typeof createVideoCommentSchema>;
