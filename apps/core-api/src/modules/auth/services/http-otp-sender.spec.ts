import { createServer } from 'node:http';

import { HttpOtpSender } from './http-otp-sender';

import type { IncomingHttpHeaders, Server } from 'node:http';
import type { AddressInfo } from 'node:net';

interface Captured {
  method?: string;
  url?: string;
  headers: IncomingHttpHeaders;
  body: string;
}

const INPUT = {
  phone: '+84912345678',
  message: 'Ma OTP la 654321',
  reference: 'otp-1',
};

describe('HttpOtpSender (server HTTP thật trên loopback)', () => {
  let server: Server;
  let baseUrl: string;
  let captured: Captured[];
  let respond: (
    request: Captured,
  ) =>
    | { status: number; headers?: Record<string, string>; body?: string }
    | 'hang';
  let settings: Record<string, unknown>;

  const sender = () =>
    new HttpOtpSender({
      getOrThrow: (key: string) => {
        if (!(key in settings)) throw new Error(`missing ${key}`);
        return settings[key];
      },
    } as never);

  beforeAll(async () => {
    server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (chunk: Buffer) => chunks.push(chunk));
      req.on('end', () => {
        const request: Captured = {
          method: req.method,
          url: req.url,
          headers: req.headers,
          body: Buffer.concat(chunks).toString('utf8'),
        };
        captured.push(request);
        const outcome = respond(request);
        if (outcome === 'hang') return; // không bao giờ trả lời → kiểm tra timeout
        res.writeHead(outcome.status, outcome.headers ?? {});
        res.end(outcome.body ?? '');
      });
    });
    await new Promise<void>((resolve) =>
      server.listen(0, '127.0.0.1', resolve),
    );
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  beforeEach(() => {
    captured = [];
    respond = () => ({ status: 202 });
    settings = {
      AUTH_OTP_SMS_HTTP_URL: `${baseUrl}/sms/send`,
      AUTH_OTP_SMS_HTTP_TOKEN: 'secret-token',
      AUTH_OTP_SMS_HTTP_TIMEOUT_MS: 2_000,
    };
  });

  it('POST JSON { to, message, reference } kèm Bearer token; 2xx = đã nhận gửi', async () => {
    await expect(sender().send(INPUT)).resolves.toBeUndefined();

    expect(captured).toHaveLength(1);
    expect(captured[0]?.method).toBe('POST');
    expect(captured[0]?.url).toBe('/sms/send');
    expect(captured[0]?.headers['content-type']).toBe('application/json');
    expect(captured[0]?.headers['authorization']).toBe('Bearer secret-token');
    expect(JSON.parse(captured[0]?.body ?? '{}')).toEqual({
      to: INPUT.phone,
      message: INPUT.message,
      reference: INPUT.reference,
    });
  });

  it('không có token → không gửi header Authorization', async () => {
    settings['AUTH_OTP_SMS_HTTP_TOKEN'] = '';
    await sender().send(INPUT);
    expect(captured[0]?.headers['authorization']).toBeUndefined();
  });

  it('HTTP không phải 2xx → lỗi nêu mã trạng thái, KHÔNG lặp lại body phản hồi (có thể chứa mã OTP)', async () => {
    respond = () => ({
      status: 502,
      body: 'echo: Ma OTP la 654321 +84912345678',
    });

    const failure = await sender()
      .send(INPUT)
      .then(
        () => null,
        (error: unknown) => error as Error,
      );

    expect(failure?.message).toBe('SMS gateway trả HTTP 502');
    expect(failure?.message).not.toContain('654321');
    expect(failure?.message).not.toContain(INPUT.phone);
  });

  it('chuyển hướng bị từ chối (không gửi token sang host khác)', async () => {
    respond = () => ({
      status: 307,
      headers: { location: 'http://127.0.0.1:1/steal' },
    });

    await expect(sender().send(INPUT)).rejects.toThrow(
      'SMS gateway không kết nối được',
    );
    expect(captured).toHaveLength(1);
  });

  it('cổng treo → hết thời gian chờ đúng cấu hình, lỗi không chứa URL', async () => {
    respond = () => 'hang';
    settings['AUTH_OTP_SMS_HTTP_TIMEOUT_MS'] = 500;
    const started = Date.now();

    const failure = await sender()
      .send(INPUT)
      .then(
        () => null,
        (error: unknown) => error as Error,
      );

    expect(failure?.message).toBe('SMS gateway timeout sau 500ms');
    expect(failure?.message).not.toContain('127.0.0.1');
    expect(Date.now() - started).toBeLessThan(2_000);
  });

  it('không kết nối được (cổng đóng) → lỗi chung, không lộ địa chỉ', async () => {
    settings['AUTH_OTP_SMS_HTTP_URL'] = 'http://127.0.0.1:1/sms/send';

    const failure = await sender()
      .send(INPUT)
      .then(
        () => null,
        (error: unknown) => error as Error,
      );

    expect(failure?.message).toBe('SMS gateway không kết nối được');
  });

  it('thiếu AUTH_OTP_SMS_HTTP_URL → lỗi cấu hình rõ ràng, không gọi mạng', async () => {
    settings['AUTH_OTP_SMS_HTTP_URL'] = '';
    await expect(sender().send(INPUT)).rejects.toThrow(
      'AUTH_OTP_SMS_HTTP_URL chưa được cấu hình',
    );
    expect(captured).toHaveLength(0);
  });
});
