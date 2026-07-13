import { sendMessageSchema } from './send-message-schema';

describe('sendMessageSchema', () => {
  it('chấp nhận nội dung hợp lệ, tự trim khoảng trắng', () => {
    const result = sendMessageSchema.parse({ content: '  hi  ' });
    expect(result.content).toBe('hi');
  });

  it('từ chối nội dung rỗng hoặc chỉ toàn khoảng trắng', () => {
    expect(() => sendMessageSchema.parse({ content: '' })).toThrow();
    expect(() => sendMessageSchema.parse({ content: '   ' })).toThrow();
  });

  it('từ chối nội dung vượt quá 1000 ký tự', () => {
    expect(() =>
      sendMessageSchema.parse({ content: 'a'.repeat(1001) }),
    ).toThrow();
  });

  it('chấp nhận đúng biên 1000 ký tự', () => {
    const result = sendMessageSchema.parse({ content: 'a'.repeat(1000) });
    expect(result.content).toHaveLength(1000);
  });
});
