import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';

/** `PostDto` chỉ có `authorUserId` (không có ảnh/tên) — PlaceholderAvatar seed theo id thật để
 * layout đủ ảnh như mockup thay vì icon trống. */
export function PostAuthorAvatar({
  seed,
  size = 10,
}: {
  seed: string;
  size?: 9 | 10;
}) {
  return <PlaceholderAvatar seed={seed} size={size === 9 ? 36 : 40} />;
}
