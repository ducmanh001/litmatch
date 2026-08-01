import Link from 'next/link';

import { LoginForm } from '../../shared/auth/login-form';
import { LoginCopy, LoginLegalNotice } from '../../shared/auth/login-copy';
import { ConfirmSheet } from '../../shared/ui/confirm-sheet';
import { LogoMark } from '../../shared/ui/icons';
import { ToastStack } from '../../shared/ui/toast-stack';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Đăng nhập',
  robots: { index: false, follow: false },
};

/** Đúng layouts/web/login.html: glow nền, thẻ 2 bước phone → OTP. */
export default function LoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden">
      <div className="glow pointer-events-none absolute inset-0 overflow-hidden" />

      <main className="relative z-10 flex min-h-screen items-center justify-center px-6 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-8 flex flex-col items-center">
            <Link href="/" className="mb-3 text-iris">
              <LogoMark width={44} height={44} />
            </Link>
            <LoginCopy />
          </div>

          <div className="rounded-3xl border border-black/5 bg-white p-6 shadow-xl shadow-black/5 dark:border-white/5 dark:bg-surf">
            <LoginForm />
          </div>

          <LoginLegalNotice />
        </div>
      </main>
      <ToastStack />
      <ConfirmSheet />
    </div>
  );
}
