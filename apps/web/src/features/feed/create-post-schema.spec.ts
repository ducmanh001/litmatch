import { createPostSchema } from './create-post-schema';

describe('createPostSchema', () => {
  it('chấp nhận chỉ có content', () => {
    expect(
      createPostSchema.safeParse({ content: 'Xin chào', audience: 'public' })
        .success,
    ).toBe(true);
  });

  it('chấp nhận chỉ có imageUrl', () => {
    expect(
      createPostSchema.safeParse({
        imageUrl: 'https://example.com/a.png',
        audience: 'public',
      }).success,
    ).toBe(true);
  });

  it('từ chối khi cả content và imageUrl đều rỗng', () => {
    expect(
      createPostSchema.safeParse({
        content: '',
        imageUrl: '',
        audience: 'public',
      }).success,
    ).toBe(false);
  });

  it('từ chối imageUrl không phải URL hợp lệ', () => {
    expect(
      createPostSchema.safeParse({
        content: '',
        imageUrl: 'not-a-url',
        audience: 'public',
      }).success,
    ).toBe(false);
  });

  it('từ chối audience ngoài danh sách server hỗ trợ', () => {
    expect(
      createPostSchema.safeParse({ content: 'Hi', audience: 'everyone' })
        .success,
    ).toBe(false);
  });
});
