import { createVideoCommentSchema } from './create-video-comment-schema';

describe('createVideoCommentSchema', () => {
  it('chấp nhận nội dung hợp lệ', () => {
    expect(
      createVideoCommentSchema.safeParse({ content: 'Hay quá' }).success,
    ).toBe(true);
  });

  it('từ chối nội dung rỗng', () => {
    expect(createVideoCommentSchema.safeParse({ content: '   ' }).success).toBe(
      false,
    );
  });
});
