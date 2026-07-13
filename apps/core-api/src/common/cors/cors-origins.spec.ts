import { parseCorsOrigins } from './cors-origins';

describe('parseCorsOrigins', () => {
  it('chuỗi rỗng → mảng rỗng (deny mọi origin)', () => {
    expect(parseCorsOrigins('')).toEqual([]);
  });

  it('parse đúng nhiều origin hợp lệ, phân cách dấu phẩy + khoảng trắng', () => {
    expect(
      parseCorsOrigins('http://localhost:4200, http://localhost:4300'),
    ).toEqual(['http://localhost:4200', 'http://localhost:4300']);
  });

  it('chấp nhận https không port', () => {
    expect(parseCorsOrigins('https://admin.litmatch.app')).toEqual([
      'https://admin.litmatch.app',
    ]);
  });

  it('từ chối origin không phải URL hợp lệ', () => {
    expect(() => parseCorsOrigins('not-a-url')).toThrow(/không hợp lệ/);
  });

  it('từ chối scheme khác http/https', () => {
    expect(() => parseCorsOrigins('ftp://example.com')).toThrow(/http\/https/);
  });

  it('từ chối origin có path/query/hash', () => {
    expect(() => parseCorsOrigins('http://localhost:4200/admin')).toThrow(
      /path\/query\/hash/,
    );
    expect(() => parseCorsOrigins('http://localhost:4200?x=1')).toThrow(
      /path\/query\/hash/,
    );
  });

  it('1 origin sai giữa danh sách vẫn làm cả chuỗi throw (fail-fast)', () => {
    expect(() => parseCorsOrigins('http://localhost:4200,not-a-url')).toThrow();
  });
});
