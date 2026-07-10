import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { getDataSourceToken, getRepositoryToken } from '@nestjs/typeorm';

import { TokenService } from './token.service';
import { AuthErrors } from '../auth.errors';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User } from '../../user';

describe('TokenService', () => {
  const repo = {
    save: jest.fn((t: RefreshToken) => Promise.resolve(t)),
    create: jest.fn((t: Partial<RefreshToken>) => t),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const txRefreshRepo = {
    findOne: jest.fn(),
    save: jest.fn((t: RefreshToken) => Promise.resolve(t)),
    create: jest.fn((t: Partial<RefreshToken>) => t),
    update: jest.fn(),
  };
  const txUserRepo = { findOneByOrFail: jest.fn() };
  const manager = {
    getRepository: jest.fn((entity: typeof RefreshToken | typeof User) =>
      entity === RefreshToken ? txRefreshRepo : txUserRepo,
    ),
  };
  const dataSource = {
    transaction: jest.fn(async (cb: (m: typeof manager) => Promise<unknown>) => cb(manager)),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
  const config = {
    getOrThrow: jest.fn((key: string) => ({ JWT_ACCESS_TTL_SECONDS: 900, AUTH_REFRESH_TTL_DAYS: 30 })[key]),
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
        { provide: getDataSourceToken(), useValue: dataSource },
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

  it('rotate atomically và ký access token theo isGuest thật trong DB', async () => {
    txRefreshRepo.findOne.mockResolvedValue(storedToken());
    txUserRepo.findOneByOrFail.mockResolvedValue({ id: 'u1', isGuest: true });
    const result = await service.rotate('refresh-plain');
    expect(result.userId).toBe('u1');
    expect(result.tokens.refreshToken).toBeDefined();
    expect(jwt.signAsync).toHaveBeenLastCalledWith({ sub: 'u1', isGuest: true }, { expiresIn: 900 });
    expect(txRefreshRepo.save).toHaveBeenCalledTimes(2); // mark parent + insert child trong cùng transaction
  });

  it('token không tồn tại / hết hạn / đã revoke → AUTH_REFRESH_TOKEN_INVALID', async () => {
    txRefreshRepo.findOne.mockResolvedValue(null);
    await expect(service.rotate('x')).rejects.toMatchObject({ code: AuthErrors.REFRESH_TOKEN_INVALID });

    txRefreshRepo.findOne.mockResolvedValue(storedToken({ expiresAt: new Date(Date.now() - 1000) }));
    await expect(service.rotate('x')).rejects.toMatchObject({ code: AuthErrors.REFRESH_TOKEN_INVALID });

    txRefreshRepo.findOne.mockResolvedValue(storedToken({ revokedAt: new Date() }));
    await expect(service.rotate('x')).rejects.toMatchObject({ code: AuthErrors.REFRESH_TOKEN_INVALID });
  });

  it('reuse sau rotation revoke family trong transaction, bao gồm child đã commit', async () => {
    txRefreshRepo.findOne.mockResolvedValue(storedToken({ rotatedAt: new Date() }));
    txRefreshRepo.update.mockResolvedValue({ affected: 2 });
    await expect(service.rotate('stolen')).rejects.toMatchObject({ code: AuthErrors.REFRESH_TOKEN_REUSED });
    expect(txRefreshRepo.update).toHaveBeenCalledWith(
      { familyId: 'fam1', revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
    expect(jwt.signAsync).not.toHaveBeenCalled();
  });
});
