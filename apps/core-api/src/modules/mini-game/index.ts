/**
 * Public API của Mini Game module — module khác CHỈ import từ đây (arch test enforce).
 * Chưa module nào cần gọi Mini Game qua DI; export sẵn facade service theo blueprint (docs/16 §
 * 16.4) để module tương lai (vd Notification mở rộng thông báo mời chơi game) không phải sửa
 * boundary. KHÔNG export entity/repository — dữ liệu ván chơi chỉ MiniGameService được ghi.
 */
export { MiniGameModule } from './mini-game.module';
export { MiniGameService } from './mini-game.service';
export { MiniGameErrors } from './mini-game.errors';
export { MiniGameType, RockPaperScissorsMove } from './mini-game.constants';
