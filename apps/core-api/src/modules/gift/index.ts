/**
 * Public API của Gift module — module khác CHỈ import từ đây.
 * `GiftService` export để AdminModule quản lý catalog (docs/12 § 12.7).
 */
export { GiftModule } from './gift.module';
export { GiftService } from './gift.service';
export type { CreateGiftInput, UpdateGiftInput } from './gift.service';
export { Gift } from './entities/gift.entity';
export { GiftErrors } from './gift.errors';
