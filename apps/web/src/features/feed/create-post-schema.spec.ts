import { createPostSchema } from './create-post-schema';

describe('createPostSchema', () => {
  it('chấp nhận chỉ có content', () => {
    expect(createPostSchema.safeParse({ content: 'Xin chào' }).success).toBe(
      true,
    );
  });

  it('chấp nhận chỉ có imageUrl', () => {
    expect(
      createPostSchema.safeParse({ imageUrl: 'https://example.com/a.png' })
        .success,
    ).toBe(true);
  });

  it('từ chối khi cả content và imageUrl đều rỗng', () => {
    expect(
      createPostSchema.safeParse({ content: '', imageUrl: '' }).success,
    ).toBe(false);
  });

  it('từ chối imageUrl không phải URL hợp lệ', () => {
    expect(
      createPostSchema.safeParse({ content: '', imageUrl: 'not-a-url' })
        .success,
    ).toBe(false);
  });
});
