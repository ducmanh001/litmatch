import Link from 'next/link';

import type { ReactNode } from 'react';

export function PublicPage({
  eyebrow,
  title,
  description,
  updatedAt,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  updatedAt?: string;
  children: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-4xl px-6 py-12 md:py-20">
      <nav
        aria-label="Đường dẫn"
        className="mb-8 text-sm text-slate-500 dark:text-slate-400"
      >
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link
              href="/"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              Litmatch
            </Link>
          </li>
          <li aria-hidden="true">/</li>
          <li
            aria-current="page"
            className="text-slate-700 dark:text-slate-200"
          >
            {title}
          </li>
        </ol>
      </nav>

      <header className="max-w-3xl">
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-irisl">
          {eyebrow}
        </p>
        <h1 className="font-display mt-4 text-4xl font-semibold tracking-tight md:text-5xl">
          {title}
        </h1>
        <p className="mt-5 text-lg leading-relaxed text-slate-600 dark:text-slate-400">
          {description}
        </p>
        {updatedAt !== undefined && (
          <p className="mt-4 text-sm text-slate-500 dark:text-slate-500">
            Cập nhật lần cuối: {updatedAt}
          </p>
        )}
      </header>

      <article className="mt-12 max-w-3xl space-y-10 text-[15px] leading-7 text-slate-700 dark:text-slate-300">
        {children}
      </article>
    </main>
  );
}

export function PublicSection({
  heading,
  children,
}: {
  heading: string;
  children: ReactNode;
}) {
  return (
    <section>
      <h2 className="font-display mb-3 text-2xl font-semibold text-slate-950 dark:text-white">
        {heading}
      </h2>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

export function PublicList({ items }: { items: readonly string[] }) {
  return (
    <ul className="list-disc space-y-2 pl-6 marker:text-irisl">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

export function PublicCallout({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-2xl border border-iris/20 bg-iris/5 p-5 dark:border-irisl/20 dark:bg-iris/10">
      {children}
    </div>
  );
}
