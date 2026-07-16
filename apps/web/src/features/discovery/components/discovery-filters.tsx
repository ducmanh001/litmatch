import { cn } from '../../../shared/lib/cn';

import type { Gender } from '../api';

export type DiscoveryAgeRange = 'all' | '18-24' | '25-30' | '31-40' | '41+';

const GENDER_OPTIONS: { label: string; value: Gender | undefined }[] = [
  { label: 'Mọi người', value: undefined },
  { label: 'Nữ', value: 'female' },
  { label: 'Nam', value: 'male' },
  { label: 'Khác', value: 'other' },
];

const AGE_OPTIONS: {
  label: string;
  value: DiscoveryAgeRange;
  ageMin: number | undefined;
  ageMax: number | undefined;
}[] = [
  { label: 'Tất cả', value: 'all', ageMin: undefined, ageMax: undefined },
  { label: '18–24', value: '18-24', ageMin: 18, ageMax: 24 },
  { label: '25–30', value: '25-30', ageMin: 25, ageMax: 30 },
  { label: '31–40', value: '31-40', ageMin: 31, ageMax: 40 },
  { label: '41+', value: '41+', ageMin: 41, ageMax: undefined },
];

export function getDiscoveryAgeBounds(ageRange: DiscoveryAgeRange): {
  ageMin: number | undefined;
  ageMax: number | undefined;
} {
  const option = AGE_OPTIONS.find((item) => item.value === ageRange);
  return {
    ageMin: option?.ageMin,
    ageMax: option?.ageMax,
  };
}

function BrowseIcon() {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx={11} cy={11} r={7} />
      <path d="m20 20-4-4" />
    </svg>
  );
}

function LocationIcon() {
  return (
    <svg
      width={19}
      height={19}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M20 10c0 5-8 11-8 11S4 15 4 10a8 8 0 1 1 16 0Z" />
      <circle cx={12} cy={10} r={2.5} />
    </svg>
  );
}

const CHIP_BASE =
  'shrink-0 rounded-full border px-3.5 py-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring';

export function DiscoveryFilters({
  gender,
  onGenderChange,
  ageRange,
  onAgeRangeChange,
  mode,
  onModeChange,
}: {
  gender: Gender | undefined;
  onGenderChange: (gender: Gender | undefined) => void;
  ageRange: DiscoveryAgeRange;
  onAgeRangeChange: (ageRange: DiscoveryAgeRange) => void;
  mode: 'browse' | 'nearby';
  onModeChange: (mode: 'browse' | 'nearby') => void;
}) {
  return (
    <div className="flex flex-col gap-4">
      <div
        role="group"
        aria-label="Cách tìm người phù hợp"
        className="inline-flex w-fit max-w-full gap-1 rounded-full border border-iris/15 bg-card p-1 shadow-sm shadow-iris/[0.04] dark:border-white/10 dark:bg-surf dark:shadow-none"
      >
        <button
          type="button"
          aria-pressed={mode === 'nearby'}
          onClick={() => onModeChange('nearby')}
          className={cn(
            'flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            mode === 'nearby'
              ? 'bg-gradient-to-r from-aqua to-irisl text-white shadow-sm shadow-iris/15'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:text-white/75 dark:hover:bg-white/[0.08] dark:hover:text-white',
          )}
        >
          <LocationIcon />
          Quanh đây
        </button>
        <button
          type="button"
          aria-pressed={mode === 'browse'}
          onClick={() => onModeChange('browse')}
          className={cn(
            'flex min-h-11 items-center justify-center gap-2 whitespace-nowrap rounded-full px-4 text-sm font-bold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            mode === 'browse'
              ? 'bg-gradient-to-r from-aqua to-irisl text-white shadow-sm shadow-iris/15'
              : 'text-muted-foreground hover:bg-muted hover:text-foreground dark:text-white/75 dark:hover:bg-white/[0.08] dark:hover:text-white',
          )}
        >
          <BrowseIcon />
          Khám phá phù hợp
        </button>
      </div>

      <section
        aria-label="Bộ lọc hồ sơ"
        className="grid gap-4 rounded-3xl border border-iris/15 bg-card p-4 shadow-sm shadow-iris/[0.04] dark:border-white/10 dark:bg-surf dark:shadow-none md:grid-cols-2 md:gap-6"
      >
        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-extrabold tracking-wide text-rose-700 dark:text-white/85">
            MUỐN LÀM QUEN VỚI
          </legend>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
            {GENDER_OPTIONS.map((option) => (
              <button
                key={option.label}
                type="button"
                aria-pressed={gender === option.value}
                onClick={() => onGenderChange(option.value)}
                className={cn(
                  CHIP_BASE,
                  gender === option.value
                    ? 'border-transparent bg-irisl text-white shadow-sm shadow-iris/20'
                    : 'border-border bg-background text-foreground hover:bg-muted dark:border-white/10 dark:bg-surf2/45 dark:text-white/85 dark:hover:bg-surf2',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="min-w-0">
          <legend className="mb-2 text-xs font-extrabold tracking-wide text-rose-700 dark:text-white/75">
            KHOẢNG TUỔI
          </legend>
          <div className="no-scrollbar flex gap-2 overflow-x-auto pb-0.5">
            {AGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={ageRange === option.value}
                onClick={() => onAgeRangeChange(option.value)}
                className={cn(
                  CHIP_BASE,
                  ageRange === option.value
                    ? 'border-transparent bg-irisl text-white shadow-sm shadow-iris/20'
                    : 'border-border bg-background text-foreground hover:bg-muted dark:border-white/10 dark:bg-surf2/45 dark:text-white/85 dark:hover:bg-surf2',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
        </fieldset>
      </section>
    </div>
  );
}
