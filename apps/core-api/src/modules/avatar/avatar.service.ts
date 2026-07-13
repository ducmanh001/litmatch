import { HttpStatus, Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DomainException } from '@litmatch/common-exceptions';
import { DataSource, In, Repository } from 'typeorm';

import { isUniqueViolation } from '../../database/postgres-errors';
import { avatarBuyIdempotencyKey } from './avatar.constants';
import { AvatarErrors } from './avatar.errors';
import { AvatarAsset, AvatarSlot } from './entities/avatar-asset.entity';
import { UserAvatarConfig } from './entities/user-avatar-config.entity';
import { UserAvatarItem } from './entities/user-avatar-item.entity';
import { EconomyService, TransactionType } from '../economy';

export interface MyAvatar {
  config: UserAvatarConfig;
  layers: AvatarAsset[];
}

/**
 * Facade Avatar (docs/services/avatar-service.md): catalog item multi-layer, mua qua
 * `EconomyService.spendDiamond` generic (pattern spend-rồi-áp-side-effect-idempotent giống
 * Matching speed-up — không có hook `withinTransaction` như Gift), trang bị chống IDOR bằng
 * check sở hữu trước khi cập nhật `UserAvatarConfig`.
 */
@Injectable()
export class AvatarService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    @InjectRepository(AvatarAsset)
    private readonly assetRepo: Repository<AvatarAsset>,
    @InjectRepository(UserAvatarItem)
    private readonly itemRepo: Repository<UserAvatarItem>,
    @InjectRepository(UserAvatarConfig)
    private readonly configRepo: Repository<UserAvatarConfig>,
    private readonly economy: EconomyService,
  ) {}

  async listCatalog(slot?: AvatarSlot): Promise<AvatarAsset[]> {
    return this.assetRepo.find({
      where: { active: true, ...(slot ? { slot } : {}) },
      order: { sortOrder: 'ASC', code: 'ASC' },
    });
  }

  async listMyItems(userId: string): Promise<AvatarAsset[]> {
    const items = await this.itemRepo.findBy({ userId });
    if (items.length === 0) return [];
    return this.assetRepo.find({
      where: { id: In(items.map((i) => i.avatarAssetId)) },
      order: { sortOrder: 'ASC' },
    });
  }

  /** Item free (priceDiamond = 0) — idempotent, không cần đi qua Economy. */
  async claim(userId: string, assetId: string): Promise<void> {
    const asset = await this.getAssetOrThrow(assetId);
    if (asset.priceDiamond !== 0) {
      throw new DomainException(
        AvatarErrors.ASSET_REQUIRES_PURCHASE,
        'Item này phải mua — dùng buy(), không claim() được',
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.grantOwnership(this.itemRepo.manager, userId, assetId);
  }

  /**
   * Item trả phí — spendDiamond generic KHÔNG có hook withinTransaction (khác sendGift), nên
   * thứ tự bắt buộc: spend (idempotent theo key) → ghi sở hữu idempotent (ON CONFLICT DO
   * NOTHING). Retry an toàn ở cả 2 nhánh (docs/services/avatar-service.md § 2).
   */
  async buy(
    userId: string,
    assetId: string,
    idempotencyKey: string,
  ): Promise<{ replayed: boolean }> {
    const asset = await this.getAssetOrThrow(assetId);
    if (asset.priceDiamond === 0) {
      throw new DomainException(
        AvatarErrors.ASSET_IS_FREE,
        'Item này miễn phí — dùng claim(), không buy() được',
        HttpStatus.BAD_REQUEST,
      );
    }
    const { replayed } = await this.economy.spendDiamond(
      userId,
      TransactionType.AvatarPurchase,
      asset.priceDiamond,
      avatarBuyIdempotencyKey(userId, idempotencyKey),
      { avatarAssetId: assetId, assetCode: asset.code },
    );
    await this.grantOwnership(this.itemRepo.manager, userId, assetId);
    return { replayed };
  }

  /** Chống IDOR (docs/10 § Avatar): chỉ trang bị item ĐÃ SỞ HỮU + đúng slot. */
  async equip(
    userId: string,
    slot: AvatarSlot,
    assetId: string,
  ): Promise<MyAvatar> {
    const asset = await this.getAssetOrThrow(assetId);
    if (asset.slot !== slot) {
      throw new DomainException(
        AvatarErrors.ASSET_SLOT_MISMATCH,
        `Item thuộc slot '${asset.slot}', không phải '${slot}'`,
        HttpStatus.UNPROCESSABLE_ENTITY,
      );
    }
    const owned = await this.itemRepo.exists({
      where: { userId, avatarAssetId: assetId },
    });
    if (!owned) {
      throw new DomainException(
        AvatarErrors.ITEM_NOT_OWNED,
        'Chưa sở hữu item này — mua/claim trước khi trang bị',
        HttpStatus.FORBIDDEN,
      );
    }

    const existing = await this.configRepo.findOneBy({ userId });
    if (!existing) await this.initDefaultConfig(userId);
    await this.configRepo.update(
      { userId },
      this.slotColumnPatch(slot, assetId),
    );

    return this.getMyAvatar(userId);
  }

  async getMyAvatar(userId: string): Promise<MyAvatar> {
    const config =
      (await this.configRepo.findOneBy({ userId })) ??
      (await this.initDefaultConfig(userId));
    return { config, layers: await this.resolveLayers(config) };
  }

  /** Xem avatar người khác — public, không cần bạn bè (docs/services/avatar-service.md § 4). */
  async getAvatarOf(userId: string): Promise<MyAvatar> {
    const config = await this.configRepo.findOneBy({ userId });
    if (!config) {
      return {
        config: Object.assign(new UserAvatarConfig(), {
          userId,
          baseAssetId: null,
          hairAssetId: null,
          faceAssetId: null,
          outfitAssetId: null,
          accessoryAssetId: null,
        }),
        layers: [],
      };
    }
    return { config, layers: await this.resolveLayers(config) };
  }

  // ---------- nội bộ ----------

  private async getAssetOrThrow(assetId: string): Promise<AvatarAsset> {
    const asset = await this.assetRepo.findOneBy({ id: assetId, active: true });
    if (!asset) {
      throw new DomainException(
        AvatarErrors.ASSET_NOT_FOUND,
        'Không tìm thấy item avatar',
        HttpStatus.NOT_FOUND,
      );
    }
    return asset;
  }

  private async grantOwnership(
    manager: DataSource['manager'],
    userId: string,
    assetId: string,
  ): Promise<void> {
    await manager
      .createQueryBuilder()
      .insert()
      .into(UserAvatarItem)
      .values({ userId, avatarAssetId: assetId })
      .orIgnore()
      .execute();
  }

  private slotColumnPatch(
    slot: AvatarSlot,
    assetId: string,
  ): Partial<UserAvatarConfig> {
    switch (slot) {
      case AvatarSlot.Base:
        return { baseAssetId: assetId };
      case AvatarSlot.Hair:
        return { hairAssetId: assetId };
      case AvatarSlot.Face:
        return { faceAssetId: assetId };
      case AvatarSlot.Outfit:
        return { outfitAssetId: assetId };
      case AvatarSlot.Accessory:
        return { accessoryAssetId: assetId };
    }
  }

  private async resolveLayers(
    config: UserAvatarConfig,
  ): Promise<AvatarAsset[]> {
    const ids = [
      config.baseAssetId,
      config.hairAssetId,
      config.faceAssetId,
      config.outfitAssetId,
      config.accessoryAssetId,
    ].filter((id): id is string => id !== null);
    if (ids.length === 0) return [];
    const assets = await this.assetRepo.find({ where: { id: In(ids) } });
    return assets.sort((a, b) => a.zIndex - b.zIndex);
  }

  /**
   * Default = item free đầu tiên (theo sortOrder) mỗi slot — ghi sở hữu + config atomic.
   * PK `userId` chặn race 2 request đầu tiên cùng lúc lazy-init — thua unique thì đọc lại dòng
   * bên thắng đã tạo, không lỗi 500 (docs/10 § 10.0.D).
   */
  private async initDefaultConfig(userId: string): Promise<UserAvatarConfig> {
    const freeAssets = await this.assetRepo.find({
      where: { active: true, priceDiamond: 0 },
      order: { sortOrder: 'ASC' },
    });
    const bySlot = new Map<AvatarSlot, AvatarAsset>();
    for (const asset of freeAssets) {
      if (!bySlot.has(asset.slot)) bySlot.set(asset.slot, asset);
    }

    try {
      return await this.dataSource.transaction(async (manager) => {
        for (const asset of bySlot.values()) {
          await this.grantOwnership(manager, userId, asset.id);
        }
        return manager.save(
          manager.create(UserAvatarConfig, {
            userId,
            baseAssetId: bySlot.get(AvatarSlot.Base)?.id ?? null,
            hairAssetId: bySlot.get(AvatarSlot.Hair)?.id ?? null,
            faceAssetId: bySlot.get(AvatarSlot.Face)?.id ?? null,
            outfitAssetId: bySlot.get(AvatarSlot.Outfit)?.id ?? null,
            accessoryAssetId: bySlot.get(AvatarSlot.Accessory)?.id ?? null,
          }),
        );
      });
    } catch (err) {
      if (!isUniqueViolation(err)) throw err;
      return this.configRepo.findOneByOrFail({ userId });
    }
  }
}
