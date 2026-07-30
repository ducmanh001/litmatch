import { cn } from '../lib/cn';

export interface TabItem<T extends string> {
  value: T;
  label: string;
}

interface TabsProps<T extends string> {
  id: string;
  tabs: TabItem<T>[];
  value: T;
  onChange: (value: T) => void;
}

export function Tabs<T extends string>({
  id,
  tabs,
  value,
  onChange,
}: TabsProps<T>) {
  function focusTab(nextIndex: number): void {
    onChange(tabs[nextIndex].value);
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          `[role="tab"][data-tab-value="${tabs[nextIndex].value}"]`,
        )
        ?.focus();
    });
  }

  function moveFocus(currentIndex: number, direction: -1 | 1): void {
    focusTab((currentIndex + direction + tabs.length) % tabs.length);
  }

  return (
    <div
      role="tablist"
      className="mb-4 flex w-fit gap-1 rounded-[10px] bg-muted p-1"
    >
      {tabs.map((tab, index) => (
        <button
          key={tab.value}
          type="button"
          role="tab"
          id={`${id}-tab-${tab.value}`}
          aria-controls={`${id}-panel-${tab.value}`}
          aria-selected={tab.value === value}
          tabIndex={tab.value === value ? 0 : -1}
          data-tab-value={tab.value}
          onClick={() => onChange(tab.value)}
          onKeyDown={(event) => {
            if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
              event.preventDefault();
              moveFocus(index, 1);
            } else if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
              event.preventDefault();
              moveFocus(index, -1);
            } else if (event.key === 'Home') {
              event.preventDefault();
              focusTab(0);
            } else if (event.key === 'End') {
              event.preventDefault();
              focusTab(tabs.length - 1);
            }
          }}
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
