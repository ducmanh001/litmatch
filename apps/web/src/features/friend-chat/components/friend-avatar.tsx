import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';

export function FriendAvatar({
  userId,
  nickname,
  size = 40,
}: {
  userId: string;
  nickname: string;
  size?: number;
}) {
  return <PlaceholderAvatar seed={userId} alt={nickname} size={size} />;
}
