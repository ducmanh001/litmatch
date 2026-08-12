import { createHash } from 'node:crypto';

import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Roles } from '@litmatch/common-dtos';

import { TokenService } from './token.service';
import { AuthErrors } from '../auth.errors';
import { RefreshSessionPort } from '../ports/refresh-session.port';
import type {
  RefreshSessionPort as RefreshSessionPortContract,
  RefreshSessionRecord,
} from '../ports/refresh-session.port';
import { UserService } from '../../user';

describe('TokenService', () => {
  const refreshSessions: jest.Mocked<RefreshSessionPortContract> = {
    issue: jest.fn(),
    findByTokenHash: jest.fn(),
    rotate: jest.fn(),
    revoke: jest.fn(),
    revokeForUser: jest.fn(),
    revokeFamily: jest.fn(),
  };
  const jwt = { signAsync: jest.fn().mockResolvedValue('access.jwt') };
  const config = {
    getOrThrow: jest.fn(
      (key: string) =>
        ({ JWT_ACCESS_TTL_SECONDS: 900, AUTH_REFRESH_TTL_DAYS: 30 })[key],
    ),
  };
  const userService = {
    getByIdOrThrow: jest.fn().mockResolvedValue({
      id: 'u1',
      isGuest: false,
      role: Roles.User,
    }),
  };
  let service: TokenService;

  const storedToken = (
    over: Partial<RefreshSessionRecord> = {},
  ): RefreshSessionRecord => ({
    id: 'rt1',
    userId: 'u1',
    familyId: 'fam1',
    expiresAt: new Date(Date.now() + 86400_000),
    revokedAt: null,
    rotatedAt: null,
    ...over,
  });

  const hash = (value: string): string =>
    createHash('sha256').update(value).digest('hex');

  beforeEach(async () => {
    jest.clearAllMocks();
    refreshSessions.findByTokenHash.mockResolvedValue(storedToken());
    refreshSessions.rotate.mockResolvedValue('rotated');
    userService.getByIdOrThrow.mockResolvedValue({
      id: 'u1',
      isGuest: false,
      role: Roles.User,
    });
    const moduleRef = await Test.createTestingModule({
      providers: [
        TokenService,
        { provide: RefreshSessionPort, useValue: refreshSessions },
        { provide: JwtService, useValue: jwt },
        { provide: ConfigService, useValue: config },
        { provide: UserService, useValue: userService },
      ],
    }).compile();
    service = moduleRef.get(TokenService);
  });

  it('issue lưu HASH qua port, không đưa plaintext vào persistence boundary', async () => {
    const tokens = await service.issueForUser('u1', false, Roles.User);

    expect(tokens.accessToken).toBe('access.jwt');
    expect(tokens.refreshToken.length).toBeGreaterThan(40);
    expect(refreshSessions.issue).toHaveBeenCalledWith({
      userId: 'u1',
      tokenHash: hash(tokens.refreshToken),
      familyId: expect.any(String),
      expiresAt: expect.any(Date),
    });
    expect(refreshSessions.issue.mock.calls[0][0].tokenHash).not.toContain(
      tokens.refreshToken,
    );
  });

  it('mỗi lần issue có jti riêng kể cả trong cùng một giây', async () => {
    await service.issueForUser('u1', false, Roles.User);
    await service.issueForUser('u1', false, Roles.User);

    const firstPayload = jwt.signAsync.mock.calls[0][0] as { jti?: string };
    const secondPayload = jwt.signAsync.mock.calls[1][0] as { jti?: string };
    expect(firstPayload.jti).toEqual(expect.any(String));
    expect(secondPayload.jti).toEqual(expect.any(String));
    expect(secondPayload.jti).not.toBe(firstPayload.jti);
  });

  it('rotate thành công với session còn hiệu lực và replacement hash', async () => {
    const result = await service.rotate('refresh-plain');

    expect(result.userId).toBe('u1');
    expect(result.tokens.refreshToken).toBeDefined();
    expect(refreshSessions.findByTokenHash).toHaveBeenCalledWith(
      hash('refresh-plain'),
    );
    expect(refreshSessions.rotate).toHaveBeenCalledWith({
      tokenId: 'rt1',
      replacement: {
        tokenHash: hash(result.tokens.refreshToken),
        expiresAt: expect.any(Date),
      },
    });
  });

  it('rotate nhúng role HIỆN TẠI từ DB, không phải role cũ', async () => {
    userService.getByIdOrThrow.mockResolvedValue({
      id: 'u1',
      isGuest: false,
      role: Roles.Admin,
    });

    await service.rotate('refresh-plain');

    expect(jwt.signAsync).toHaveBeenCalledWith(
      expect.objectContaining({ role: Roles.Admin }),
      expect.anything(),
    );
  });

  it('token không tồn tại / hết hạn / đã revoke → AUTH_REFRESH_TOKEN_INVALID', async () => {
    refreshSessions.findByTokenHash.mockResolvedValue(null);
    await expect(service.rotate('x')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_INVALID,
    });

    refreshSessions.findByTokenHash.mockResolvedValue(
      storedToken({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(service.rotate('x')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_INVALID,
    });

    refreshSessions.findByTokenHash.mockResolvedValue(
      storedToken({ revokedAt: new Date() }),
    );
    await expect(service.rotate('x')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_INVALID,
    });
    expect(refreshSessions.rotate).not.toHaveBeenCalled();
  });

  it('reuse → port atomic revoke cả family và TokenService trả lỗi reuse', async () => {
    refreshSessions.rotate.mockResolvedValue('reused');

    await expect(service.rotate('stolen')).rejects.toMatchObject({
      code: AuthErrors.REFRESH_TOKEN_REUSED,
    });
    expect(refreshSessions.rotate).toHaveBeenCalled();
    expect(refreshSessions.revokeFamily).not.toHaveBeenCalled();
  });

  it('revoke và revokeFamily ủy quyền đúng port', async () => {
    await service.revoke('refresh-plain');
    await service.revokeFamily('fam1');

    expect(refreshSessions.revoke).toHaveBeenCalledWith(hash('refresh-plain'));
    expect(refreshSessions.revokeFamily).toHaveBeenCalledWith('fam1');
  });
});
