import { cn } from '../lib/cn';

interface ToggleSwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}

export function ToggleSwitch({
  checked,
  onChange,
  label,
  disabled = false,
}: ToggleSwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative h-[21px] w-[38px] shrink-0 rounded-full border border-border bg-muted transition-colors hover:border-primary disabled:cursor-not-allowed disabled:opacity-50',
        checked && 'border-transparent bg-primary',
      )}
    >
      <span
        className={cn(
          'absolute top-0.5 left-0.5 size-[15px] rounded-full bg-white shadow-[0_1px_3px_rgb(0_0_0/35%)] transition-transform duration-200 ease-out',
          checked && 'translate-x-[17px]',
        )}
      />
    </button>
  );
}
