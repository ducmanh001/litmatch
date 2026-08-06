import { DataSource } from 'typeorm';

import { RefreshToken } from '../entities/refresh-token.entity';

import { TypeOrmRefreshSessionAdapter } from './typeorm-refresh-session.adapter';

describe('TypeOrmRefreshSessionAdapter', () => {
  const repository = {
    insert: jest.fn(),
    findOneBy: jest.fn(),
    update: jest.fn(),
  };
  const manager = {
    findOne: jest.fn(),
    insert: jest.fn(),
    update: jest.fn(),
  };
  const dataSource = {
    getRepository: jest.fn(() => repository),
    transaction: jest.fn(async (callback: (tx: typeof manager) => unknown) =>
      callback(manager),
    ),
  };
  let adapter: TypeOrmRefreshSessionAdapter;

  const session = (over: Partial<RefreshToken> = {}): RefreshToken =>
    Object.assign(new RefreshToken(), {
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      expiresAt: new Date(Date.now() + 86400_000),
      revokedAt: null,
      rotatedAt: null,
      ...over,
    });

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new TypeOrmRefreshSessionAdapter(
      dataSource as unknown as DataSource,
    );
  });

  it('issue ghi đúng token_hash đã được hash ở application boundary', async () => {
    await adapter.issue({
      userId: 'u1',
      tokenHash: 'a'.repeat(64),
      familyId: 'fam1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });

    expect(repository.insert).toHaveBeenCalledWith({
      userId: 'u1',
      tokenHash: 'a'.repeat(64),
      familyId: 'fam1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
  });

  it('findByTokenHash đọc đúng session record, không trả entity persistence', async () => {
    repository.findOneBy.mockResolvedValue(session());

    await expect(adapter.findByTokenHash('a'.repeat(64))).resolves.toEqual({
      id: 'rt1',
      userId: 'u1',
      familyId: 'fam1',
      expiresAt: expect.any(Date),
      revokedAt: null,
      rotatedAt: null,
    });
    expect(repository.findOneBy).toHaveBeenCalledWith({
      tokenHash: 'a'.repeat(64),
    });
  });

  it('rotate atomically lock + mark cũ + insert replacement trong cùng transaction', async () => {
    manager.findOne.mockResolvedValue(session());
    manager.update.mockResolvedValue({ affected: 1 });

    await expect(
      adapter.rotate({
        tokenId: 'rt1',
        replacement: {
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      }),
    ).resolves.toBe('rotated');

    expect(dataSource.transaction).toHaveBeenCalled();
    expect(manager.findOne).toHaveBeenCalledWith(RefreshToken, {
      where: { id: 'rt1' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).toHaveBeenCalledWith(
      RefreshToken,
      { id: 'rt1', rotatedAt: expect.anything(), revokedAt: expect.anything() },
      { rotatedAt: expect.any(Date) },
    );
    expect(manager.insert).toHaveBeenCalledWith(RefreshToken, {
      userId: 'u1',
      tokenHash: 'b'.repeat(64),
      familyId: 'fam1',
      expiresAt: new Date('2030-01-01T00:00:00.000Z'),
    });
  });

  it('reuse token đã rotate → revoke cả family trong cùng transaction', async () => {
    manager.findOne.mockResolvedValue(session({ rotatedAt: new Date() }));
    manager.update.mockResolvedValue({ affected: 3 });

    await expect(
      adapter.rotate({
        tokenId: 'rt1',
        replacement: {
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date('2030-01-01T00:00:00.000Z'),
        },
      }),
    ).resolves.toBe('reused');

    expect(manager.update).toHaveBeenCalledWith(
      RefreshToken,
      { familyId: 'fam1', revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
    expect(manager.insert).not.toHaveBeenCalled();
  });

  it('revoked hoặc expired session bị từ chối trước khi update', async () => {
    manager.findOne.mockResolvedValue(session({ revokedAt: new Date() }));
    await expect(
      adapter.rotate({
        tokenId: 'rt1',
        replacement: {
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(),
        },
      }),
    ).resolves.toBe('invalid');

    manager.findOne.mockResolvedValue(
      session({ expiresAt: new Date(Date.now() - 1000) }),
    );
    await expect(
      adapter.rotate({
        tokenId: 'rt1',
        replacement: {
          tokenHash: 'b'.repeat(64),
          expiresAt: new Date(),
        },
      }),
    ).resolves.toBe('invalid');
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('revoke và revokeFamily chỉ update các session chưa revoked', async () => {
    await adapter.revoke('a'.repeat(64));
    await adapter.revokeFamily('fam1');

    expect(repository.update).toHaveBeenNthCalledWith(
      1,
      { tokenHash: 'a'.repeat(64), revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
    expect(repository.update).toHaveBeenNthCalledWith(
      2,
      { familyId: 'fam1', revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
  });

  it('revokeForUser thu hồi toàn bộ refresh session của user, không đụng session khác', async () => {
    await adapter.revokeForUser('u1');

    expect(repository.update).toHaveBeenCalledWith(
      { userId: 'u1', revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
  });
});
