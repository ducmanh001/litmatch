import Link from 'next/link';

import { LoginForm } from '../../shared/auth/login-form';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Đăng nhập' };

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-border bg-card p-6 shadow-sm">
        <div className="space-y-1">
          <Link href="/" className="text-lg font-bold text-primary">
            Litmatch
          </Link>
          <p className="text-sm text-muted-foreground">
            Đăng nhập bằng số điện thoại
          </p>
        </div>
        <LoginForm />
      </div>
    </main>
  );
}
