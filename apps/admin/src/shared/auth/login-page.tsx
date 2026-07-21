import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { getGoogleIdToken } from '@litmatch/browser-auth';
import {
  normalizeVnPhone,
  VN_COUNTRY_CODE,
  VN_LOCAL_PHONE_PATTERN,
} from '@litmatch/common-dtos/pure';
import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { z } from 'zod';

import { apiClient, tokenStore } from '../api/client';
import { env } from '../env';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { useIsAuthenticated } from './use-session';

const phoneSchema = z.object({
  // Input là số nội địa (0xxx hoặc bỏ số 0) — chuẩn hoá sang E.164 lúc submit (normalizeVnPhone).
  phone: z.string().regex(VN_LOCAL_PHONE_PATTERN, 'Số điện thoại không hợp lệ'),
});
const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/u, 'Mã OTP gồm 6 chữ số'),
});

type PhoneForm = z.infer<typeof phoneSchema>;
type CodeForm = z.infer<typeof codeSchema>;

export function LoginPage() {
  const isAuthenticated = useIsAuthenticated();
  const navigate = useNavigate();
  const location = useLocation();
  const [phase, setPhase] = useState<
    { step: 'phone' } | { step: 'code'; phone: string }
  >({
    step: 'phone',
  });

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const codeForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) });

  const requestOtp = useMutation({
    mutationFn: async (localPhone: string) => {
      const phone = normalizeVnPhone(localPhone);
      if (phone === null) {
        // Đã qua zodResolver(phoneSchema) nên luôn khớp VN_LOCAL_PHONE_PATTERN.
        throw new Error('unreachable: phone không khớp VN_LOCAL_PHONE_PATTERN');
      }
      await apiClient.POST('/api/v1/auth/otp/request', { body: { phone } });
      return phone;
    },
    onSuccess: (phone) => setPhase({ step: 'code', phone }),
  });

  const verifyOtp = useMutation({
    mutationFn: async (input: { phone: string; code: string }) => {
      const res = await apiClient.POST('/api/v1/auth/otp/verify', {
        body: input,
      });
      return res.data?.data;
    },
    onSuccess: (tokens) => {
      if (tokens === undefined) return;
      tokenStore.setSession(tokens);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    },
  });

  const socialLogin = useMutation({
    mutationFn: async () => {
      const clientId = env.VITE_AUTH_GOOGLE_CLIENT_ID;
      if (clientId === undefined) {
        throw new Error('Google OAuth chưa được cấu hình trên môi trường này.');
      }
      const idToken = await getGoogleIdToken(clientId);
      const res = await apiClient.POST('/api/v1/auth/social', {
        body: { provider: 'google', idToken },
      });
      return res.data?.data;
    },
    onSuccess: (tokens) => {
      if (tokens === undefined) return;
      tokenStore.setSession(tokens);
      const from = (location.state as { from?: string } | null)?.from;
      navigate(from ?? '/', { replace: true });
    },
  });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const mutationError = (error: unknown): string | undefined =>
    error === null
      ? undefined
      : isApiError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : 'Có lỗi xảy ra, thử lại.';

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-sm space-y-6">
        <div className="space-y-1">
          <h1 className="text-xl font-semibold">Litmatch Admin</h1>
          <p className="text-sm text-muted-foreground">
            {phase.step === 'phone'
              ? env.VITE_PHONE_OTP_ENABLED
                ? 'Đăng nhập bằng số điện thoại hoặc Google'
                : 'Đăng nhập bằng Google'
              : `Nhập mã OTP đã gửi tới ${phase.phone}`}
          </p>
        </div>

        {phase.step === 'phone' ? (
          <div className="space-y-4">
            {env.VITE_PHONE_OTP_ENABLED && (
              <form
                key="phone"
                className="space-y-4"
                onSubmit={phoneForm.handleSubmit((v) =>
                  requestOtp.mutate(v.phone),
                )}
                noValidate
              >
                <Field
                  htmlFor="phone"
                  label="Số điện thoại"
                  error={
                    phoneForm.formState.errors.phone?.message ??
                    mutationError(requestOtp.error)
                  }
                >
                  <div className="flex gap-2">
                    <span
                      aria-hidden
                      className="flex h-9 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-sm text-muted-foreground"
                    >
                      {VN_COUNTRY_CODE}
                    </span>
                    <Input
                      id="phone"
                      type="tel"
                      autoComplete="tel"
                      placeholder="912345678 hoặc 0912345678"
                      {...phoneForm.register('phone')}
                    />
                  </div>
                </Field>
                <Button
                  className="w-full"
                  type="submit"
                  disabled={requestOtp.isPending}
                >
                  {requestOtp.isPending ? 'Đang gửi…' : 'Gửi mã OTP'}
                </Button>
              </form>
            )}
            {env.VITE_PHONE_OTP_ENABLED && (
              <div className="flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">hoặc</span>
                <div className="h-px flex-1 bg-border" />
              </div>
            )}
            <Button
              className="w-full"
              type="button"
              variant="outline"
              disabled={socialLogin.isPending}
              onClick={() => socialLogin.mutate()}
            >
              {socialLogin.isPending
                ? 'Đang mở Google…'
                : 'Đăng nhập với Google'}
            </Button>
            {mutationError(socialLogin.error) !== undefined && (
              <p role="alert" className="text-sm text-destructive">
                {mutationError(socialLogin.error)}
              </p>
            )}
          </div>
        ) : (
          <form
            key="code"
            className="space-y-4"
            onSubmit={codeForm.handleSubmit((v) =>
              verifyOtp.mutate({ phone: phase.phone, code: v.code }),
            )}
            noValidate
          >
            <Field
              htmlFor="code"
              label="Mã OTP"
              error={
                codeForm.formState.errors.code?.message ??
                mutationError(verifyOtp.error)
              }
            >
              <Input
                id="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                {...codeForm.register('code')}
              />
            </Field>
            <Button
              className="w-full"
              type="submit"
              disabled={verifyOtp.isPending}
            >
              {verifyOtp.isPending ? 'Đang xác minh…' : 'Đăng nhập'}
            </Button>
            <Button
              variant="ghost"
              className="w-full"
              onClick={() => setPhase({ step: 'phone' })}
            >
              Đổi số điện thoại
            </Button>
          </form>
        )}
      </Card>
    </main>
  );
}
