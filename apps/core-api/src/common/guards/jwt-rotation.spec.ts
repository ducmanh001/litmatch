import { JwtService } from '@nestjs/jwt';

import { verifyJwtWithRotation } from './jwt-rotation';

const CURRENT = 'current-secret-0123456789abcdef0123456789abcdef';
const PREVIOUS = 'previous-secret-0123456789abcdef0123456789abcde';
const UNRELATED = 'unrelated-secret-0123456789abcdef0123456789abc';

const nowSeconds = (): number => Math.floor(Date.now() / 1000);

function signWith(secret: string, payload: object = {}): Promise<string> {
  return new JwtService({ secret }).signAsync({
    sub: 'user-1',
    exp: nowSeconds() + 300,
    ...payload,
  });
}

describe('verifyJwtWithRotation', () => {
  const jwt = new JwtService({ secret: CURRENT });

  it('token ký bằng khoá hiện tại → hợp lệ và không thử khoá cũ', async () => {
    const verify = jest.spyOn(jwt, 'verifyAsync');
    const token = await signWith(CURRENT);

    await expect(
      verifyJwtWithRotation<{ sub: string }>(jwt, token, PREVIOUS),
    ).resolves.toMatchObject({ sub: 'user-1' });
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });

  it('token ký bằng khoá cũ → hợp lệ khi đang trong cửa sổ xoay khoá', async () => {
    const token = await signWith(PREVIOUS);

    await expect(
      verifyJwtWithRotation<{ sub: string }>(jwt, token, PREVIOUS),
    ).resolves.toMatchObject({ sub: 'user-1' });
  });

  it('token ký bằng khoá cũ → bị từ chối khi không cấu hình khoá cũ', async () => {
    const token = await signWith(PREVIOUS);

    await expect(verifyJwtWithRotation(jwt, token, undefined)).rejects.toThrow(
      'invalid signature',
    );
  });

  it('token ký bằng khoá lạ → bị từ chối kể cả khi có khoá cũ', async () => {
    const token = await signWith(UNRELATED);

    await expect(verifyJwtWithRotation(jwt, token, PREVIOUS)).rejects.toThrow(
      'invalid signature',
    );
  });

  it('token ký bằng khoá cũ nhưng đã hết hạn → vẫn bị từ chối (không hồi sinh token hết hạn)', async () => {
    const token = await signWith(PREVIOUS, { exp: nowSeconds() - 60 });

    await expect(verifyJwtWithRotation(jwt, token, PREVIOUS)).rejects.toThrow(
      'jwt expired',
    );
  });

  it('token ký bằng khoá hiện tại nhưng hết hạn → không thử lại với khoá cũ', async () => {
    const verify = jest.spyOn(jwt, 'verifyAsync');
    const token = await signWith(CURRENT, { exp: nowSeconds() - 60 });

    await expect(verifyJwtWithRotation(jwt, token, PREVIOUS)).rejects.toThrow(
      'jwt expired',
    );
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });

  it('chuỗi không phải JWT → bị từ chối, không thử lại', async () => {
    const verify = jest.spyOn(jwt, 'verifyAsync');

    await expect(
      verifyJwtWithRotation(jwt, 'not-a-jwt', PREVIOUS),
    ).rejects.toThrow('jwt malformed');
    expect(verify).toHaveBeenCalledTimes(1);
    verify.mockRestore();
  });
});
