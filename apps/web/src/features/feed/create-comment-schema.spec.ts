import { createCommentSchema } from './create-comment-schema';

describe('createCommentSchema', () => {
  it('chấp nhận nội dung hợp lệ', () => {
    expect(createCommentSchema.safeParse({ content: 'Hay quá' }).success).toBe(
      true,
    );
  });

  it('từ chối nội dung rỗng', () => {
    expect(createCommentSchema.safeParse({ content: '   ' }).success).toBe(
      false,
    );
  });

  it('từ chối nội dung quá 1000 ký tự', () => {
    expect(
      createCommentSchema.safeParse({ content: 'a'.repeat(1001) }).success,
    ).toBe(false);
  });
});
