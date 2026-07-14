import { cn } from '../../../shared/lib/cn';

import type { Gender } from '../api';

const CHIP_BASE =
  'shrink-0 rounded-full px-4 py-2 text-xs font-bold whitespace-nowrap border';

const GENDER_OPTIONS: { label: string; value: Gender | undefined }[] = [
  { label: 'Tất cả', value: undefined },
  { label: 'Nữ', value: 'female' },
  { label: 'Nam', value: 'male' },
];

export function DiscoveryFilters({
  gender,
  onGenderChange,
  mode,
  onModeChange,
}: {
  gender: Gender | undefined;
  onGenderChange: (gender: Gender | undefined) => void;
  mode: 'browse' | 'nearby';
  onModeChange: (mode: 'browse' | 'nearby') => void;
}) {
  return (
    <div className="no-scrollbar flex gap-2 overflow-x-auto px-5 pb-4">
      {GENDER_OPTIONS.map((option) => (
        <button
          key={option.label}
          type="button"
          onClick={() => onGenderChange(option.value)}
          className={cn(
            CHIP_BASE,
            gender === option.value
              ? 'border-transparent bg-gradient-to-br from-irisl to-irisl text-white'
              : 'border-transparent bg-white dark:bg-surf',
          )}
        >
          {option.label}
        </button>
      ))}
      <button
        type="button"
        onClick={() => onModeChange(mode === 'nearby' ? 'browse' : 'nearby')}
        className={cn(
          CHIP_BASE,
          mode === 'nearby'
            ? 'border-transparent bg-gradient-to-br from-irisl to-irisl text-white'
            : 'border-transparent bg-white dark:bg-surf',
        )}
      >
        📍 Gần tôi
      </button>
    </div>
  );
}
