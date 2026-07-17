import { useEffect, useRef, useSyncExternalStore } from 'react';

import { cn } from '../lib/cn';
import { themeStore } from '../lib/theme-store';

import type { ThemeValue } from '../lib/theme-store';

const STOPS: { value: ThemeValue; label: string }[] = [
  { value: 'cyan-dark', label: 'Cyan Tối' },
  { value: 'cyan-light', label: 'Cyan Sáng' },
  { value: 'warm-dark', label: 'Ấm Tối' },
  { value: 'warm-light', label: 'Ấm Sáng' },
];

/** Port từ layouts/admins/litmatch-admin-dashboard (2).html — thumb kéo bằng con trỏ + phím mũi tên. */
export function ThemeSlider({ className }: { className?: string }) {
  const value = useSyncExternalStore(
    themeStore.subscribe,
    themeStore.getSnapshot,
    () => 'cyan-dark' as ThemeValue,
  );
  const activeIndex = Math.max(
    0,
    STOPS.findIndex((s) => s.value === value),
  );
  const containerRef = useRef<HTMLDivElement>(null);
  const stopRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const thumbRef = useRef<HTMLDivElement>(null);
  const draggingRef = useRef(false);

  useEffect(() => {
    function positionThumb(): void {
      const container = containerRef.current;
      const stop = stopRefs.current[activeIndex];
      const thumb = thumbRef.current;
      if (!container || !stop || !thumb) return;
      const containerRect = container.getBoundingClientRect();
      const stopRect = stop.getBoundingClientRect();
      thumb.style.width = `${stopRect.width}px`;
      thumb.style.transform = `translateX(${stopRect.left - containerRect.left}px)`;
    }
    positionThumb();
    window.addEventListener('resize', positionThumb);
    return () => window.removeEventListener('resize', positionThumb);
  }, [activeIndex]);

  function select(index: number): void {
    const clamped = Math.max(0, Math.min(STOPS.length - 1, index));
    themeStore.set(STOPS[clamped].value);
  }

  function indexFromPointer(clientX: number): number {
    const container = containerRef.current;
    if (!container) return activeIndex;
    const rect = container.getBoundingClientRect();
    const ratio = (clientX - rect.left) / rect.width;
    return Math.max(
      0,
      Math.min(STOPS.length - 1, Math.floor(ratio * STOPS.length)),
    );
  }

  return (
    <div
      ref={containerRef}
      role="radiogroup"
      aria-label="Chọn theme màu và chế độ sáng/tối"
      tabIndex={0}
      className={cn(
        'relative flex cursor-grab touch-none select-none rounded-full border border-border bg-card p-[3px] active:cursor-grabbing',
        className,
      )}
      onPointerDown={(e) => {
        draggingRef.current = true;
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        select(indexFromPointer(e.clientX));
      }}
      onPointerMove={(e) => {
        if (draggingRef.current) select(indexFromPointer(e.clientX));
      }}
      onPointerUp={() => {
        draggingRef.current = false;
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
          select(activeIndex + 1);
          e.preventDefault();
        }
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
          select(activeIndex - 1);
          e.preventDefault();
        }
      }}
    >
      <div
        ref={thumbRef}
        className="absolute inset-y-[3px] left-0 rounded-full bg-primary transition-[transform,width] duration-[250ms] ease-out"
      />
      {STOPS.map((stop, index) => (
        <button
          key={stop.value}
          ref={(el) => {
            stopRefs.current[index] = el;
          }}
          type="button"
          role="radio"
          aria-checked={index === activeIndex}
          onClick={() => select(index)}
          className={cn(
            'relative z-10 whitespace-nowrap rounded-full px-3 py-2 text-[11px] font-bold text-muted-foreground transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            index === activeIndex && 'text-brand-foreground',
          )}
        >
          {stop.label}
        </button>
      ))}
    </div>
  );
}
