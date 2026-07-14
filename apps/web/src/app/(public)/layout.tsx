import Link from 'next/link';

import { ThemeSwitcher } from '../../shared/ui/theme-switcher';
import { LogoMark } from '../../shared/ui/icons';

import type { ReactNode } from 'react';

/** Layout vùng công khai (SSR/SEO — docs/12 § 12.5): header marketing + footer, đúng layouts/web/index.html. */
export default function PublicLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative">
      <header className="sticky top-0 z-50 border-b border-black/5 bg-paper/85 backdrop-blur dark:border-white/5 dark:bg-ink/85">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-6">
          <Link
            href="/"
            className="font-display flex items-center gap-2 text-xl font-semibold italic"
          >
            <LogoMark />
            Litmatch
          </Link>
          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-500 md:flex dark:text-slate-400">
            <a
              href="#features"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              Tính năng
            </a>
            <a
              href="#how"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              Cách hoạt động
            </a>
            <Link
              href="/login"
              className="transition hover:text-iris dark:hover:text-irisl"
            >
              Cộng đồng
            </Link>
          </nav>
          <div className="flex items-center gap-3">
            <ThemeSwitcher className="hidden p-1 sm:flex" />
            <Link
              href="/login"
              className="hidden px-4 py-2 text-sm font-semibold text-slate-600 transition hover:text-iris sm:block dark:text-slate-300 dark:hover:text-irisl"
            >
              Đăng nhập
            </Link>
            <Link
              href="/login"
              className="rounded-full bg-irisl px-5 py-2.5 text-sm font-bold text-white shadow-lg shadow-iris/30"
            >
              Đăng ký miễn phí
            </Link>
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <footer className="relative z-10 border-t border-black/5 dark:border-white/5">
        <div className="mx-auto grid max-w-6xl grid-cols-1 gap-10 px-6 py-12 sm:grid-cols-2 md:grid-cols-4">
          <div>
            <p className="font-display mb-3 text-xl italic">Litmatch</p>
            <p className="max-w-[220px] text-sm text-slate-500 dark:text-slate-400">
              Ẩn danh trước, chân thật sau — kết nối đúng người, đúng nhịp.
            </p>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold">Sản phẩm</p>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a
                  href="#features"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Tính năng
                </a>
              </li>
              <li>
                <Link
                  href="/login"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Khám phá
                </Link>
              </li>
              <li>
                <Link
                  href="/login"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Feed
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold">Công ty</p>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a
                  href="#"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Về chúng tôi
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Tuyển dụng
                </a>
              </li>
              <li>
                <a
                  href="#"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Liên hệ
                </a>
              </li>
            </ul>
          </div>
          <div>
            <p className="mb-4 text-sm font-bold">Pháp lý</p>
            <ul className="space-y-2.5 text-sm text-slate-500 dark:text-slate-400">
              <li>
                <a
                  href="#"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Điều khoản
                </a>
              </li>
              <li>
                <Link
                  href="/privacy"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  Quyền riêng tư
                </Link>
              </li>
              <li>
                <Link
                  href="/help"
                  className="transition hover:text-iris dark:hover:text-irisl"
                >
                  An toàn cộng đồng
                </Link>
              </li>
            </ul>
          </div>
        </div>
        <div className="border-t border-black/5 dark:border-white/5">
          <div className="mx-auto max-w-6xl px-6 py-6 text-xs text-slate-500 dark:text-slate-400">
            © {new Date().getFullYear()} Litmatch
          </div>
        </div>
      </footer>
    </div>
  );
}
