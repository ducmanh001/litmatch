import Link from 'next/link';

import { LoginForm } from '../../shared/auth/login-form';
import { LogoMark } from '../../shared/ui/icons';
import { ThemeSwitcher } from '../../shared/ui/theme-switcher';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Đăng nhập' };

/** Đúng layouts/web/login.html: glow nền, ThemeSwitcher góc, thẻ 2 bước phone → OTP. */
export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="fixed right-4 top-4 z-50">
        <ThemeSwitcher className="bg-white/95 p-1.5 shadow-lg dark:bg-surf/95" />
      </div>
      <div className="glow pointer-events-none absolute inset-0 overflow-hidden" />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center">
            <Link href="/" className="mb-3 text-iris">
              <LogoMark width={44} height={44} />
            </Link>
            <h1 className="font-display text-2xl font-semibold italic">
              Chào mừng đến Litmatch
            </h1>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
              Ẩn danh, an toàn, chỉ mất 30 giây
            </p>
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5 dark:border-white/5 dark:bg-surf">
            <LoginForm />
          </div>

          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Bằng việc tiếp tục, bạn xác nhận đã đủ 18 tuổi và đồng ý với Điều
            khoản dịch vụ &amp; Chính sách riêng tư.
          </p>
        </div>
      </main>
    </div>
  );
}
