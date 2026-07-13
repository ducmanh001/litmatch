'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiClient, tokenStore } from '../api/client';

const phoneSchema = z.object({
  // Format E.164 — validate thật ở backend, client chỉ đỡ UX (docs/13 § 13.6)
  phone: z.string().regex(/^\+?[0-9]{8,15}$/u, 'Số điện thoại không hợp lệ'),
});
const codeSchema = z.object({
  code: z.string().regex(/^[0-9]{6}$/u, 'Mã OTP gồm 6 chữ số'),
});

type PhoneForm = z.infer<typeof phoneSchema>;
type CodeForm = z.infer<typeof codeSchema>;

const inputClass =
  'h-10 w-full rounded-md border border-border bg-card px-3 text-sm placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const buttonClass =
  'h-10 w-full rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';

export function LoginForm() {
  const router = useRouter();
  const [phase, setPhase] = useState<
    { step: 'phone' } | { step: 'code'; phone: string }
  >({
    step: 'phone',
  });

  const phoneForm = useForm<PhoneForm>({ resolver: zodResolver(phoneSchema) });
  const codeForm = useForm<CodeForm>({ resolver: zodResolver(codeSchema) });

  const requestOtp = useMutation({
    mutationFn: async (phone: string) => {
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
      router.replace('/home');
    },
  });

  const errorOf = (error: unknown): string | undefined =>
    error === null
      ? undefined
      : isApiError(error)
        ? error.message
        : 'Có lỗi xảy ra, thử lại.';

  if (phase.step === 'phone') {
    const message =
      phoneForm.formState.errors.phone?.message ?? errorOf(requestOtp.error);
    return (
      <form
        key="phone"
        className="space-y-4"
        onSubmit={phoneForm.handleSubmit((v) => requestOtp.mutate(v.phone))}
        noValidate
      >
        <div className="space-y-1.5">
          <label htmlFor="phone" className="text-sm font-medium">
            Số điện thoại
          </label>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            placeholder="+84xxxxxxxxx"
            className={inputClass}
            {...phoneForm.register('phone')}
          />
          {message !== undefined && (
            <p role="alert" className="text-sm text-destructive">
              {message}
            </p>
          )}
        </div>
        <button
          type="submit"
          className={buttonClass}
          disabled={requestOtp.isPending}
        >
          {requestOtp.isPending ? 'Đang gửi…' : 'Gửi mã OTP'}
        </button>
      </form>
    );
  }

  const message =
    codeForm.formState.errors.code?.message ?? errorOf(verifyOtp.error);
  return (
    <form
      key="code"
      className="space-y-4"
      onSubmit={codeForm.handleSubmit((v) =>
        verifyOtp.mutate({ phone: phase.phone, code: v.code }),
      )}
      noValidate
    >
      <div className="space-y-1.5">
        <label htmlFor="code" className="text-sm font-medium">
          Mã OTP đã gửi tới {phase.phone}
        </label>
        <input
          id="code"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          className={inputClass}
          {...codeForm.register('code')}
        />
        {message !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
      </div>
      <button
        type="submit"
        className={buttonClass}
        disabled={verifyOtp.isPending}
      >
        {verifyOtp.isPending ? 'Đang xác minh…' : 'Đăng nhập'}
      </button>
      <button
        type="button"
        className="w-full text-sm text-muted-foreground hover:text-foreground"
        onClick={() => setPhase({ step: 'phone' })}
      >
        Đổi số điện thoại
      </button>
    </form>
  );
}
