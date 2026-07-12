import { buildPinoHttpOptions } from './build-logger-options';
import { REDACT_PATHS } from './redact';

describe('buildPinoHttpOptions', () => {
  it('luôn chứa toàn bộ redact list PII chung', () => {
    const opts = buildPinoHttpOptions({ level: 'info' });
    for (const p of REDACT_PATHS) {
      expect(opts.redact.paths).toContain(p);
    }
  });

  it('cộng thêm redact path riêng của app, không thay thế list chung', () => {
    const opts = buildPinoHttpOptions({
      level: 'info',
      extraRedactPaths: ['*.deviceId'],
    });
    expect(opts.redact.paths).toContain('*.deviceId');
    expect(opts.redact.paths).toContain('req.headers.authorization');
  });

  it('tái sử dụng x-request-id từ header nếu có, sinh mới nếu thiếu', () => {
    const opts = buildPinoHttpOptions({ level: 'info' });
    const resHeaders: Record<string, string> = {};
    const res = {
      setHeader: (k: string, v: string) => {
        resHeaders[k] = v;
      },
    };
    const withHeader = opts.genReqId(
      { headers: { 'x-request-id': 'trace-123' } } as never,
      res as never,
    );
    expect(withHeader).toBe('trace-123');

    const generated = opts.genReqId({ headers: {} } as never, res as never);
    expect(generated).toMatch(/[0-9a-f-]{36}/);
    expect(resHeaders['x-request-id']).toBe(generated);
  });
});
