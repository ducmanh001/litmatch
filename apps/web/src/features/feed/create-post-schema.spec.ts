import { createPostSchema } from './create-post-schema';

describe('createPostSchema', () => {
  it('chấp nhận chỉ có content', () => {
    expect(
      createPostSchema.safeParse({ content: 'Xin chào', audience: 'public' })
        .success,
    ).toBe(true);
  });

  it('chấp nhận chỉ có imageAssetId', () => {
    expect(
      createPostSchema.safeParse({
        imageAssetId: 'selected',
        audience: 'public',
      }).success,
    ).toBe(true);
  });

  it('từ chối khi cả content và imageAssetId đều rỗng', () => {
    expect(
      createPostSchema.safeParse({
        content: '',
        imageAssetId: '',
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
