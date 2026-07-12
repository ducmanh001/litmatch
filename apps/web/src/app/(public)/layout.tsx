import Link from 'next/link';

import type { ReactNode } from 'react';

/** Layout vùng công khai (SSR/SEO — docs/12 § 12.5): header marketing + footer. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="border-b border-border">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center justify-between px-4">
          <Link href="/" className="text-lg font-bold text-primary">
            Litmatch
          </Link>
          <nav aria-label="Điều hướng công khai">
            <Link
              href="/login"
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
            >
              Đăng nhập
            </Link>
          </nav>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="border-t border-border py-6">
        <p className="text-center text-sm text-muted-foreground">
          © {new Date().getFullYear()} Litmatch
        </p>
      </footer>
    </div>
  );
}
