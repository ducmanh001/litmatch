import { ProfileIcon } from '../../../shared/ui/icons';

const AVATAR_TONES = [
  'bg-irisl',
  'bg-aqual',
  'bg-diamond',
  'bg-surf2',
] as const;

function toneForSeed(seed: string): (typeof AVATAR_TONES)[number] {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export function PostAuthorAvatar({
  seed,
  label,
  size = 10,
  tone,
}: {
  seed: string;
  label?: string;
  size?: 9 | 10;
  tone?: (typeof AVATAR_TONES)[number];
}) {
  const sizeClass = size === 9 ? 'h-9 w-9' : 'h-10 w-10';
  const resolvedTone = tone ?? toneForSeed(seed);
  const initial =
    label !== undefined && label.length > 0
      ? label.charAt(0).toUpperCase()
      : undefined;

  return (
    <div
      className={`flex ${sizeClass} shrink-0 items-center justify-center rounded-full ${resolvedTone} font-display font-bold text-white`}
    >
      {initial !== undefined ? (
        <span className="text-sm">{initial}</span>
      ) : (
        <ProfileIcon
          width={size === 9 ? 16 : 18}
          height={size === 9 ? 16 : 18}
        />
      )}
    </div>
  );
}
