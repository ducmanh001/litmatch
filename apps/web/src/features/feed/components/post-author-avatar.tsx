import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';

export function PostAuthorAvatar({
  seed,
  nickname = '',
  size = 44,
}: {
  seed: string;
  nickname?: string;
  size?: number;
}) {
  const pixelSize = size === 9 ? 36 : size === 10 ? 40 : size;
  return <PlaceholderAvatar seed={seed} alt={nickname} size={pixelSize} />;
}
