import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (CreatePostDto). */
export const createPostSchema = z
  .object({
    content: z.string().trim().max(2000).optional(),
    // Form giữ marker cục bộ trong lúc upload; API chỉ nhận assetId thật sau khi PUT thành công.
    imageAssetId: z.string().optional(),
    audience: z.enum(['public', 'friends', 'only_me']),
  })
  .refine(
    (value) =>
      (value.content?.length ?? 0) > 0 || (value.imageAssetId?.length ?? 0) > 0,
    { message: 'Viết gì đó hoặc thêm ảnh trước khi đăng', path: ['content'] },
  );

export type CreatePostForm = z.infer<typeof createPostSchema>;
