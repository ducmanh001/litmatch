import { createRoomSchema } from './create-room-schema';

describe('createRoomSchema', () => {
  it('chấp nhận title hợp lệ, tự trim khoảng trắng', () => {
    const result = createRoomSchema.parse({
      title: '  Phòng vui vẻ  ',
      category: 'talk',
    });
    expect(result.title).toBe('Phòng vui vẻ');
  });

  it('từ chối title rỗng hoặc chỉ toàn khoảng trắng', () => {
    expect(() =>
      createRoomSchema.parse({ title: '', category: 'talk' }),
    ).toThrow();
    expect(() =>
      createRoomSchema.parse({ title: '   ', category: 'talk' }),
    ).toThrow();
  });

  it('từ chối title vượt quá 100 ký tự', () => {
    expect(() =>
      createRoomSchema.parse({ title: 'a'.repeat(101), category: 'talk' }),
    ).toThrow();
  });

  it('chấp nhận đúng biên 100 ký tự', () => {
    const result = createRoomSchema.parse({
      title: 'a'.repeat(100),
      category: 'talk',
    });
    expect(result.title).toHaveLength(100);
  });

  it('từ chối category ngoài danh sách server hỗ trợ', () => {
    expect(() =>
      createRoomSchema.parse({ title: 'Phòng', category: 'dance' }),
    ).toThrow();
  });
});
