import type { ReactNode } from 'react';

export function HomeSectionHeading({
  eyebrow,
  title,
  action,
}: {
  eyebrow: string;
  title: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-irisl">
          {eyebrow}
        </p>
        <h2 className="font-display mt-1 text-xl font-semibold sm:text-2xl">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}
