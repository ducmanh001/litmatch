/**
 * Entry point CHO FRONTEND (`@litmatch/common-dtos/pure`) — chỉ re-export các file thuần
 * TypeScript, không kéo class-validator/@nestjs vào bundle browser (docs/12 § 12.3).
 * Thêm file vào đây = cam kết file đó không import runtime backend; `cursor-pagination.ts`
 * (class-validator) không bao giờ được nằm ở đây. Backend dùng entry chính `index.ts`.
 */
export * from './lib/api-response';
export * from './lib/auth-token';
export * from './lib/realtime-events';
