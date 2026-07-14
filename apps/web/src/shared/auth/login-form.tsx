'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import {
  normalizeVnPhone,
  VN_COUNTRY_CODE,
  VN_LOCAL_PHONE_PATTERN,
} from '@litmatch/common-dtos/pure';
import { useMutation } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiClient, tokenStore } from '../api/client';

/** Chỉ để giãn cách UX (giảm spam bấm) — rate-limit thật enforce ở server. */
const RESEND_COOLDOWN_SECONDS = 30;

const phoneSchema = z.object({
  // Input là số nội địa (0xxx hoặc bỏ số 0) — chuẩn hoá sang E.164 lúc submit (normalizeVnPhone).
  phone: z.string().regex(VN_LOCAL_PHONE_PATTERN, 'Số điện thoại không hợp lệ'),
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
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const id = setTimeout(() => setResendCooldown((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [resendCooldown]);

  const postOtpRequest = async (phone: string): Promise<void> => {
    await apiClient.POST('/api/v1/auth/otp/request', { body: { phone } });
  };

  const requestOtp = useMutation({
    mutationFn: async (localPhone: string) => {
      const phone = normalizeVnPhone(localPhone);
      if (phone === null) {
        // Đã qua zodResolver(phoneSchema) nên luôn khớp VN_LOCAL_PHONE_PATTERN.
        throw new Error('unreachable: phone không khớp VN_LOCAL_PHONE_PATTERN');
      }
      await postOtpRequest(phone);
      return phone;
    },
    onSuccess: (phone) => {
      setPhase({ step: 'code', phone });
      setResendCooldown(RESEND_COOLDOWN_SECONDS);
    },
  });

  // Phone đã ở dạng E.164 (từ phase.phone) — gửi thẳng, KHÔNG qua normalizeVnPhone lần nữa
  // (nó chỉ nhận input dạng nội địa, sẽ trả null cho input đã có tiền tố +84).
  const resendOtp = useMutation({
    mutationFn: postOtpRequest,
    onSuccess: () => setResendCooldown(RESEND_COOLDOWN_SECONDS),
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
          <div className="flex gap-2">
            <span
              aria-hidden
              className="flex h-10 w-14 shrink-0 items-center justify-center rounded-md border border-border bg-muted text-sm text-muted-foreground"
            >
              {VN_COUNTRY_CODE}
            </span>
            <input
              id="phone"
              type="tel"
              autoComplete="tel"
              autoFocus
              placeholder="912345678 hoặc 0912345678"
              className={inputClass}
              {...phoneForm.register('phone')}
            />
          </div>
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
          autoFocus
          maxLength={6}
          className={inputClass}
          {...codeForm.register('code')}
        />
        {message !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {message}
          </p>
        )}
        {errorOf(resendOtp.error) !== undefined && (
          <p role="alert" className="text-sm text-destructive">
            {errorOf(resendOtp.error)}
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
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground disabled:opacity-50"
          disabled={resendCooldown > 0 || resendOtp.isPending}
          onClick={() => resendOtp.mutate(phase.phone)}
        >
          {resendCooldown > 0
            ? `Gửi lại mã (${resendCooldown}s)`
            : resendOtp.isPending
              ? 'Đang gửi…'
              : 'Gửi lại mã'}
        </button>
        <button
          type="button"
          className="text-sm text-muted-foreground hover:text-foreground"
          onClick={() => setPhase({ step: 'phone' })}
        >
          Đổi số điện thoại
        </button>
      </div>
    </form>
  );
}
