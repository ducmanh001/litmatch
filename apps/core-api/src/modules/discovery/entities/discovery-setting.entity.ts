import { Column, Entity, PrimaryColumn } from 'typeorm';

/**
 * Cài đặt hiển thị Nearby của 1 user — 1:1 với `users` (docs/services/discovery-service.md § Nearby).
 * `nearbyVisible` mặc định **false** (opt-in). Reciprocity: chưa opt-in thì không xem được nearby
 * của người khác (`NearbyService.listNearby` tự check trước khi query — không phải cột này quyết
 * định người khác thấy mình, mà quyết định CHÍNH USER có được xem nearby hay không, đối xứng 2
 * chiều vì ai cũng phải bật mới xem được nhau).
 *
 * Tắt `nearbyVisible` PHẢI xoá `user_locations` cùng transaction (`NearbyService.setVisible`) —
 * không giữ toạ độ cũ của user đã tắt tính năng.
 */
@Entity({ name: 'discovery_settings' })
export class DiscoverySetting {
  @PrimaryColumn({ type: 'uuid' })
  userId!: string;

  @Column({ type: 'boolean', default: false })
  nearbyVisible!: boolean;
}
