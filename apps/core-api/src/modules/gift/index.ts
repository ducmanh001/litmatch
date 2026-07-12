/**
 * Public API của Gift module — module khác CHỈ import từ đây.
 * Chưa export GiftService: chưa module nào cần gọi Gift qua DI (docs/05 § 5.3 —
 * không tạo public API để dành).
 */
export { GiftModule } from './gift.module';
