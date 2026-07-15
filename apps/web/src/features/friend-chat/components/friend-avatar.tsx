import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';

export function FriendAvatar({
  userId,
  nickname,
  size = 40,
  className,
}: {
  userId: string;
  nickname: string;
  size?: number;
  className?: string;
}) {
  return (
    <PlaceholderAvatar
      seed={userId}
      alt={nickname}
      size={size}
      className={className}
    />
  );
}
