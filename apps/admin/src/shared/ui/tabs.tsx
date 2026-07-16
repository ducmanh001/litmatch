import { cn } from '../lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
}: TabsProps<T>) {
  return (
    <div
      role="tablist"
      className="mb-4 flex w-fit gap-1 rounded-[10px] bg-muted p-1"
    >
      {tabs.map((tab) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          aria-selected={tab.value === value}
          onClick={() => onChange(tab.value)}
          className={cn(
            'rounded-lg px-4 py-2 text-[12.5px] font-bold text-muted-foreground transition-colors hover:text-foreground',
            tab.value === value && 'bg-primary text-white',
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
