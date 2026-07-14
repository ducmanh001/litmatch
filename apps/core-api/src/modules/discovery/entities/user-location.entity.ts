import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Vị trí Nearby của 1 user — 1:1 với `users` (docs/services/discovery-service.md § Nearby).
 * Toạ độ đã QUANTIZE ~500m NGAY LÚC GHI (`NearbyService.setLocation`) — bảng này KHÔNG BAO GIỜ
 * chứa toạ độ thô. Đây là dòng bảo vệ đầu tiên trong 3 lớp chống trilateration (quantize tại
 * nguồn + jitter tất định theo cặp-theo-ngày lúc đọc + rate limit ghi/đọc).
 *
 * `updatedAt` dùng để derive "còn tươi" (`DISCOVERY_LOCATION_FRESHNESS_HOURS`) khi đọc — vị trí
 * quá hạn tự biến mất khỏi kết quả nearby, KHÔNG có cron dọn hàng riêng cho bảng này.
 *
 * Tắt `DiscoverySetting.nearbyVisible` PHẢI xoá dòng tương ứng ở đây cùng transaction.
 */
@Entity({ name: 'user_locations' })
export class UserLocation {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'double precision' })
  latQuantized!: number;

  @Column({ type: 'double precision' })
  lonQuantized!: number;

  @Column({ type: 'timestamptz' })
  updatedAt!: Date;
}
