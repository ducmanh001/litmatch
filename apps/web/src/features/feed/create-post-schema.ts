import { z } from 'zod';

/** UX-only cap — backend là nguồn thật (CreatePostDto). */
export const createPostSchema = z
  .object({
    content: z.string().trim().max(2000).optional(),
    imageUrl: z.union([z.literal(''), z.string().trim().url()]).optional(),
  })
  .refine(
    (value) =>
      (value.content?.length ?? 0) > 0 || (value.imageUrl?.length ?? 0) > 0,
    { message: 'Viết gì đó hoặc thêm ảnh trước khi đăng', path: ['content'] },
  );

export type CreatePostForm = z.infer<typeof createPostSchema>;
