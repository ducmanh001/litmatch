import { DomainException } from '@litmatch/common-exceptions';

import { AvatarService } from './avatar.service';
import { AvatarErrors } from './avatar.errors';
import { AvatarAsset, AvatarSlot } from './entities/avatar-asset.entity';
import { UserAvatarConfig } from './entities/user-avatar-config.entity';
import { UserAvatarItem } from './entities/user-avatar-item.entity';

import type { Repository } from 'typeorm';
import type { EconomyService } from '../economy';

function makeAsset(overrides: Partial<AvatarAsset> = {}): AvatarAsset {
  return Object.assign(new AvatarAsset(), {
    id: 'asset-1',
    slot: AvatarSlot.Hair,
    code: 'hair-x',
    name: 'Hair X',
    imageUrl: 'https://cdn/hair-x.png',
    zIndex: 20,
    priceDiamond: 0,
    active: true,
    sortOrder: 1,
    ...overrides,
  });
}

describe('AvatarService (unit — mock repo/economy)', () => {
  let assetRepo: { findOneBy: jest.Mock; find: jest.Mock };
  let itemRepo: {
    findBy: jest.Mock;
    exists: jest.Mock;
    manager: unknown;
    createQueryBuilder: jest.Mock;
  };
  let configRepo: {
    findOneBy: jest.Mock;
    update: jest.Mock;
    findOneByOrFail: jest.Mock;
  };
  let economy: { spendDiamond: jest.Mock };
  let dataSource: { transaction: jest.Mock };
  let insertQb: {
    insert: jest.Mock;
    into: jest.Mock;
    values: jest.Mock;
    orIgnore: jest.Mock;
    execute: jest.Mock;
  };
  let service: AvatarService;

  function expectDomainError(err: unknown, code: string): void {
    expect(err).toBeInstanceOf(DomainException);
    expect((err as DomainException).code).toBe(code);
  }

  beforeEach(() => {
    insertQb = {
      insert: jest.fn().mockReturnThis(),
      into: jest.fn().mockReturnThis(),
      values: jest.fn().mockReturnThis(),
      orIgnore: jest.fn().mockReturnThis(),
      execute: jest.fn(async () => undefined),
    };
    assetRepo = {
      findOneBy: jest.fn(async () => makeAsset()),
      find: jest.fn(async () => []),
    };
    itemRepo = {
      findBy: jest.fn(async () => []),
      exists: jest.fn(async () => false),
      manager: { createQueryBuilder: jest.fn(() => insertQb) },
      createQueryBuilder: jest.fn(() => insertQb),
    };
    configRepo = {
      findOneBy: jest.fn(async () => null),
      update: jest.fn(async () => undefined),
      findOneByOrFail: jest.fn(async () =>
        Object.assign(new UserAvatarConfig(), { userId: 'u1' }),
      ),
    };
    economy = {
      spendDiamond: jest.fn(async () => ({
        transactionId: 'txn-1',
        replayed: false,
      })),
    };
    dataSource = {
      transaction: jest.fn(async (cb: (m: unknown) => Promise<unknown>) =>
        cb({
          createQueryBuilder: jest.fn(() => insertQb),
          create: jest.fn((_entity, input) =>
            Object.assign(new UserAvatarConfig(), input),
          ),
          save: jest.fn(async (e) => e),
        }),
      ),
    };
    service = new AvatarService(
      dataSource as never,
      assetRepo as unknown as Repository<AvatarAsset>,
      itemRepo as unknown as Repository<UserAvatarItem>,
      configRepo as unknown as Repository<UserAvatarConfig>,
      economy as unknown as EconomyService,
    );
  });

  describe('claim', () => {
    it('item trả phí → chặn, phải dùng buy()', async () => {
      assetRepo.findOneBy.mockResolvedValue(makeAsset({ priceDiamond: 50 }));
      expectDomainError(
        await service.claim('u1', 'asset-1').catch((e) => e),
        AvatarErrors.ASSET_REQUIRES_PURCHASE,
      );
      expect(insertQb.execute).not.toHaveBeenCalled();
    });

    it('item free → ghi sở hữu qua ON CONFLICT DO NOTHING', async () => {
      await service.claim('u1', 'asset-1');
      expect(insertQb.values).toHaveBeenCalledWith({
        userId: 'u1',
        avatarAssetId: 'asset-1',
      });
      expect(insertQb.orIgnore).toHaveBeenCalled();
    });
  });

  describe('buy', () => {
    it('item free → chặn, phải dùng claim()', async () => {
      expectDomainError(
        await service.buy('u1', 'asset-1', 'k1').catch((e) => e),
        AvatarErrors.ASSET_IS_FREE,
      );
      expect(economy.spendDiamond).not.toHaveBeenCalled();
    });

    it('item trả phí → spendDiamond ĐÚNG giá catalog rồi mới ghi sở hữu', async () => {
      assetRepo.findOneBy.mockResolvedValue(
        makeAsset({ priceDiamond: 150, code: 'outfit-suit' }),
      );
      const result = await service.buy('u1', 'asset-1', 'client-key');
      expect(economy.spendDiamond).toHaveBeenCalledWith(
        'u1',
        'avatar_purchase',
        150,
        'avatar:buy:u1:client-key',
        { avatarAssetId: 'asset-1', assetCode: 'outfit-suit' },
      );
      expect(insertQb.execute).toHaveBeenCalled();
      expect(result.replayed).toBe(false);
    });
  });

  describe('equip — chống IDOR', () => {
    it('asset không đúng slot yêu cầu → 422', async () => {
      assetRepo.findOneBy.mockResolvedValue(
        makeAsset({ slot: AvatarSlot.Outfit }),
      );
      expectDomainError(
        await service.equip('u1', AvatarSlot.Hair, 'asset-1').catch((e) => e),
        AvatarErrors.ASSET_SLOT_MISMATCH,
      );
    });

    it('chưa sở hữu item → 403, không cho trang bị', async () => {
      itemRepo.exists.mockResolvedValue(false);
      expectDomainError(
        await service.equip('u1', AvatarSlot.Hair, 'asset-1').catch((e) => e),
        AvatarErrors.ITEM_NOT_OWNED,
      );
      expect(configRepo.update).not.toHaveBeenCalled();
    });

    it('đã sở hữu + đúng slot → update đúng cột', async () => {
      itemRepo.exists.mockResolvedValue(true);
      configRepo.findOneBy.mockResolvedValue(
        Object.assign(new UserAvatarConfig(), { userId: 'u1' }),
      );
      await service.equip('u1', AvatarSlot.Hair, 'asset-1');
      expect(configRepo.update).toHaveBeenCalledWith(
        { userId: 'u1' },
        { hairAssetId: 'asset-1' },
      );
    });
  });

  describe('getMyAvatar — lazy-init default', () => {
    it('chưa có config → tạo default từ item free rẻ nhất/slot', async () => {
      assetRepo.find.mockImplementation(async (opts: { where?: unknown }) => {
        const where = opts?.where as { priceDiamond?: number } | undefined;
        if (where?.priceDiamond === 0) {
          return [
            makeAsset({ id: 'base-1', slot: AvatarSlot.Base, priceDiamond: 0 }),
          ];
        }
        return [
          makeAsset({ id: 'base-1', slot: AvatarSlot.Base, priceDiamond: 0 }),
        ];
      });
      const result = await service.getMyAvatar('u1');
      expect(result.config.baseAssetId).toBe('base-1');
    });
  });
});
