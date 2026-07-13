/**
 * Public API của Movie Match module — module khác CHỈ import từ đây (arch test enforce).
 * Chưa module nào cần gọi Movie Match qua DI (docs/05 § 5.3 — không tạo public API để dành);
 * export sẵn facade service theo blueprint (docs/16 § 16.4) để module tương lai (vd Notification
 * mở rộng thông báo mời xem chung) không phải sửa boundary.
 */
export { MovieMatchModule } from './movie-match.module';
export { MovieMatchService } from './movie-match.service';
export { MovieMatchErrors } from './movie-match.errors';
