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
import { isCapabilityUsable, useCapabilities } from '../capabilities/api';
import { env } from '../env';
import { t, useT } from '../i18n/catalog';
import { showToast } from '../lib/toast-store';
import { Button } from '../ui/button';
import { Card } from '../ui/card';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ToastStack } from '../ui/toast-stack';
import { useIsAuthenticated } from './use-session';

import type { CapabilitiesDto } from '../capabilities/api';

const phoneSchema = z.object({
  // Input là số nội địa (0xxx hoặc bỏ số 0) — chuẩn hoá sang E.164 lúc submit (normalizeVnPhone).
  phone: z.string().regex(VN_LOCAL_PHONE_PATTERN, t('auth.invalidPhone')),
});
const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/u, t('auth.invalidOtp')),
});

type PhoneForm = z.infer<typeof phoneSchema>;
type CodeForm = z.infer<typeof codeSchema>;

function legacyAuthCapabilities(): CapabilitiesDto['auth'] {
  const state = (enabled: boolean, message: string) => ({
    status: enabled ? ('enabled' as const) : ('disabled' as const),
    message,
  });
  const googleClientId = env.VITE_AUTH_GOOGLE_CLIENT_ID ?? null;
  return {
    phoneOtp: {
      ...state(env.VITE_PHONE_OTP_ENABLED, t('auth.phoneUnavailable')),
      clientId: null,
    },
    google: {
      ...state(googleClientId !== null, t('auth.googleUnavailable')),
      clientId: googleClientId,
    },
    apple: {
      ...state(false, t('auth.appleUnavailable')),
      clientId: null,
    },
    facebook: {
      ...state(false, t('auth.facebookUnavailable')),
      clientId: null,
    },
    guest: state(true, t('auth.guestAvailable')),
  };
}

export function LoginPage() {
  const t = useT();
  const isAuthenticated = useIsAuthenticated();
  const capabilities = useCapabilities();
  const authCapabilities = capabilities.data?.auth ?? legacyAuthCapabilities();
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
        throw new Error(t('auth.invalidPhoneFormat'));
      }
      const res = await apiClient.POST('/api/v1/auth/otp/request', {
        body: { phone },
      });
      const otp = res.data?.data;
      if (otp === undefined || !/^\d{6}$/u.test(otp.code)) {
        throw new Error(t('auth.otpSetupFailed'));
      }
      return { phone, otp };
    },
    onSuccess: ({ phone, otp }) => {
      codeForm.setValue('code', otp.code, {
        shouldDirty: true,
        shouldValidate: true,
      });
      setPhase({ step: 'code', phone });
      showToast(t('auth.otpCode', { code: otp.code }));
    },
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
      const capability = authCapabilities.google;
      if (!isCapabilityUsable(capability) || capability?.clientId === null) {
        throw new Error(
          capability?.message ?? t('auth.googleLoginUnavailable'),
        );
      }
      const clientId = capability.clientId;
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
    onError: (error) =>
      showToast(
        isApiError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : t('common.tryAgain'),
        'warn',
      ),
  });

  if (isAuthenticated) return <Navigate to="/" replace />;

  const mutationError = (error: unknown): string | undefined =>
    error === null
      ? undefined
      : isApiError(error)
        ? error.message
        : error instanceof Error
          ? error.message
          : t('common.tryAgain');

  if (capabilities.isPending) {
    return (
      <main className="flex min-h-screen items-center justify-center p-4">
        <p className="text-sm text-muted-foreground">
          {t('auth.checkingMethods')}
        </p>
      </main>
    );
  }

  return (
    <>
      <main className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-sm space-y-6">
          <div className="space-y-1">
            <h1 className="text-xl font-semibold">Litmatch Admin</h1>
            <p className="text-sm text-muted-foreground">
              {phase.step === 'phone'
                ? t('auth.signInPhoneOrGoogle')
                : t('auth.enterOtpSentTo', { phone: phase.phone })}
            </p>
          </div>

          {phase.step === 'phone' ? (
            <div className="space-y-4">
              <form
                key="phone"
                className="space-y-4"
                onSubmit={(event) => {
                  if (!isCapabilityUsable(authCapabilities.phoneOtp)) {
                    event.preventDefault();
                    showToast(authCapabilities.phoneOtp.message, 'warn');
                    return;
                  }
                  void phoneForm.handleSubmit((v) =>
                    requestOtp.mutate(v.phone),
                  )(event);
                }}
                noValidate
              >
                <Field
                  htmlFor="phone"
                  label={t('auth.phone')}
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
                      placeholder={t('auth.phonePlaceholder')}
                      {...phoneForm.register('phone')}
                    />
                  </div>
                </Field>
                <Button
                  className="w-full"
                  type="submit"
                  disabled={requestOtp.isPending}
                >
                  {requestOtp.isPending ? t('auth.sending') : t('auth.sendOtp')}
                </Button>
              </form>
              <div className="flex items-center gap-3" aria-hidden>
                <div className="h-px flex-1 bg-border" />
                <span className="text-xs text-muted-foreground">
                  {t('auth.or')}
                </span>
                <div className="h-px flex-1 bg-border" />
              </div>
              <Button
                className="w-full"
                type="button"
                variant="outline"
                disabled={socialLogin.isPending}
                onClick={() => socialLogin.mutate()}
              >
                {socialLogin.isPending
                  ? t('auth.openingGoogle')
                  : t('auth.signInGoogle')}
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
                label={t('auth.otp')}
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
                {verifyOtp.isPending ? t('auth.verifying') : t('auth.signIn')}
              </Button>
              <Button
                variant="ghost"
                className="w-full"
                onClick={() => setPhase({ step: 'phone' })}
              >
                {t('auth.changePhone')}
              </Button>
            </form>
          )}
        </Card>
      </main>
      <ToastStack />
    </>
  );
}
