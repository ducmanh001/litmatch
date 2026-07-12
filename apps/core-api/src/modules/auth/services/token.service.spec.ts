import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getRepositoryToken } from '@nestjs/typeorm';

import { TokenService } from './token.service';
import { AuthErrors } from '../auth.errors';
import { RefreshToken } from '../entities/refresh-token.entity';

describe('TokenService', () => {
  const repo = {
    save: jest.fn((t: RefreshToken) => Promise.resolve(t)),
    create: jest.fn((t: Partial<RefreshToken>) => t),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({ JWT_ACCESS_TTL_SECONDS: 900, AUTH_REFRESH_TTL_DAYS: 30 })[key],
    ),
  };
  let service: TokenService;

  const storedToken = (over: Partial<RefreshToken> = {}): RefreshToken =>
    Object.assign(new RefreshToken(), {
      id: 'rt1',
      userId: 'u1',
      tokenHash: 'x'.repeat(64),
      familyId: 'fam1',
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      rotatedAt: null,
      ...over,
    });

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: getRepositoryToken(RefreshToken), useValue: repo },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('issueForUser trả cặp token, lưu HASH chứ không lưu plaintext', async () => {
    const tokens = await service.issueForUser('u1', false);
    expect(tokens.accessToken).toBe('access.jwt');
    expect(tokens.refreshToken.length).toBeGreaterThan(40);
    const saved = repo.save.mock.calls[0][0] as RefreshToken;
    expect(saved.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(saved.tokenHash).not.toContain(tokens.refreshToken);
  });

  it('rotate thành công khi token còn hiệu lực và chưa rotate', async () => {
    repo.findOneBy.mockResolvedValue(storedToken());
    repo.update.mockResolvedValue({ affected: 1 });
    const result = await service.rotate('refresh-plain');
    expect(result.userId).toBe('u1');
    expect(result.tokens.refreshToken).toBeDefined();
  });

  it('token không tồn tại / hết hạn / đã revoke → AUTH_REFRESH_TOKEN_INVALID', async () => {
    repo.findOneBy.mockResolvedValue(null);
    await expect(service.rotate('x')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_INVALID,
    });

    repo.findOneBy.mockResolvedValue(
      storedToken({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.rotate('x')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_INVALID,
    });

    repo.findOneBy.mockResolvedValue(storedToken({ revokedAt: new Date() }));
    await expect(service.rotate('x')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_INVALID,
    });
  });

  it('reuse (2 request song song cùng 1 token — UPDATE có điều kiện affected=0) → revoke cả family', async () => {
    repo.findOneBy.mockResolvedValue(storedToken());
    repo.update
      .mockResolvedValueOnce({ affected: 0 }) // thua race đánh dấu rotated
      .mockResolvedValueOnce({ affected: 3 }); // revokeFamily
    await expect(service.rotate('stolen')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_REUSED,
    });
    expect(repo.update).toHaveBeenCalledWith(
      { familyId: 'fam1', revokedAt: expect.anything() },
      expect.anything(),
    );
  });
});
