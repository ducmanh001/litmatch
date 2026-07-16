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
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { apiClient, tokenStore } from '../api/client';
import { env } from '../env';
import { showToast } from '../lib/toast-store';
import { getAppleIdToken, getGoogleIdToken } from './social-sdk';

import type { ClipboardEvent, KeyboardEvent } from 'react';

/** Chỉ để giãn cách UX (giảm spam bấm) — rate-limit thật enforce ở server. */
const RESEND_COOLDOWN_SECONDS = 30;
const OTP_LENGTH = 6;
/** Khoá localStorage lưu deviceId ổn định cho tài khoản khách (docs/06 § Auth guest). */
const GUEST_DEVICE_ID_STORAGE_KEY = 'litmatch.guestDeviceId';

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

function getOrCreateGuestDeviceId(): string {
  const existing = window.localStorage.getItem(GUEST_DEVICE_ID_STORAGE_KEY);
  if (existing !== null && existing !== '') return existing;
  const created = crypto.randomUUID();
  window.localStorage.setItem(GUEST_DEVICE_ID_STORAGE_KEY, created);
  return created;
}

const inputClass =
  'h-12 w-full rounded-xl bg-slate-100 px-4 text-sm placeholder:text-muted-foreground outline-none focus:ring-2 focus:ring-iris dark:bg-surf2';
const buttonClass =
  'h-12 w-full rounded-xl bg-gradient-to-br from-irisl to-irisl font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50 disabled:shadow-none';
const socialButtonClass =
  'flex items-center justify-center rounded-xl bg-slate-100 py-3 transition hover:bg-slate-200 disabled:opacity-50 dark:bg-surf2 dark:hover:bg-surf2/70';

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
  const [otpDigits, setOtpDigits] = useState<string[]>(() =>
    Array(OTP_LENGTH).fill(''),
  );
  const otpInputRefs = useRef<Array<HTMLInputElement | null>>([]);

  useEffect(() => {
    if (phase.step !== 'code') return;
    setOtpDigits(Array(OTP_LENGTH).fill(''));
    codeForm.setValue('code', '', { shouldValidate: false });
    otpInputRefs.current[0]?.focus();
  }, [phase]);

  const setOtpDigit = (index: number, rawValue: string) => {
    const digit = rawValue.replace(/[^0-9]/gu, '').slice(-1);
    setOtpDigits((prev) => {
      const next = [...prev];
      next[index] = digit;
      codeForm.setValue('code', next.join(''), { shouldValidate: false });
      return next;
    });
    if (digit !== '' && index < OTP_LENGTH - 1) {
      otpInputRefs.current[index + 1]?.focus();
    }
  };

  const handleOtpKeyDown = (
    index: number,
    event: KeyboardEvent<HTMLInputElement>,
  ) => {
    if (event.key === 'Backspace' && otpDigits[index] === '' && index > 0) {
      otpInputRefs.current[index - 1]?.focus();
    }
  };

  const handleOtpPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    const pasted = event.clipboardData
      .getData('text')
      .replace(/[^0-9]/gu, '')
      .slice(0, OTP_LENGTH);
    if (pasted.length === 0) return;
    event.preventDefault();
    const next = Array(OTP_LENGTH).fill('');
    for (let i = 0; i < pasted.length; i += 1) next[i] = pasted[i];
    setOtpDigits(next);
    codeForm.setValue('code', next.join(''), { shouldValidate: false });
    otpInputRefs.current[Math.min(pasted.length, OTP_LENGTH - 1)]?.focus();
  };

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

  const guestLogin = useMutation({
    mutationFn: async () => {
      const deviceId = getOrCreateGuestDeviceId();
      const res = await apiClient.POST('/api/v1/auth/guest', {
        body: { deviceId },
      });
      return res.data?.data;
    },
    onSuccess: (tokens) => {
      if (tokens === undefined) return;
      tokenStore.setSession(tokens);
      router.replace('/home');
    },
  });

  // ID token lấy từ SDK chính chủ, server verify lại toàn bộ (POST /auth/social).
  const socialLogin = useMutation({
    mutationFn: async (provider: 'google' | 'apple') => {
      const clientId =
        provider === 'google'
          ? env.NEXT_PUBLIC_AUTH_GOOGLE_CLIENT_ID
          : env.NEXT_PUBLIC_AUTH_APPLE_CLIENT_ID;
      if (clientId === undefined) {
        throw new Error(
          `Đăng nhập ${provider === 'google' ? 'Google' : 'Apple'} chưa được cấu hình trên môi trường này.`,
        );
      }
      const idToken =
        provider === 'google'
          ? await getGoogleIdToken(clientId)
          : await getAppleIdToken(clientId);
      const res = await apiClient.POST('/api/v1/auth/social', {
        body: { provider, idToken },
      });
      return res.data?.data;
    },
    onSuccess: (tokens) => {
      if (tokens === undefined) return;
      tokenStore.setSession(tokens);
      router.replace('/home');
    },
    onError: (error) =>
      showToast(
        isApiError(error)
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Có lỗi xảy ra, thử lại.',
        'warn',
      ),
  });

  // Backend chủ đích chưa hỗ trợ Facebook (access token, không phải OIDC — social-verifier.ts);
  // nút vẫn theo mockup nhưng trạng thái "chưa hỗ trợ" phải nói rõ, không im lặng.
  const onFacebookClick = () =>
    showToast('Đăng nhập Facebook chưa được hỗ trợ.', 'warn');

  const errorOf = (error: unknown): string | undefined =>
    error === null
      ? undefined
      : isApiError(error)
        ? error.message
        : 'Có lỗi xảy ra, thử lại.';

  const guestCta = (
    <>
      <div className="my-5 flex items-center gap-3">
        <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
      </div>
      <button
        type="button"
        disabled={guestLogin.isPending}
        onClick={() => guestLogin.mutate()}
        className="block w-full text-center text-sm font-bold text-irisl disabled:opacity-50"
      >
        {guestLogin.isPending ? 'Đang vào…' : 'Dùng thử với tài khoản khách →'}
      </button>
      {errorOf(guestLogin.error) !== undefined && (
        <p role="alert" className="mt-3 text-center text-sm text-destructive">
          {errorOf(guestLogin.error)}
        </p>
      )}
    </>
  );

  if (phase.step === 'phone') {
    const message =
      phoneForm.formState.errors.phone?.message ?? errorOf(requestOtp.error);
    return (
      <form
        key="phone"
        onSubmit={phoneForm.handleSubmit((v) => requestOtp.mutate(v.phone))}
        noValidate
      >
        <label
          htmlFor="phone"
          className="mb-2 block text-xs font-bold uppercase text-slate-500 dark:text-slate-400"
        >
          Số điện thoại
        </label>
        <div className="mb-4 flex gap-2">
          <span
            aria-hidden
            className="flex h-12 w-14 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-sm font-semibold dark:bg-surf2"
          >
            {VN_COUNTRY_CODE}
          </span>
          <input
            id="phone"
            type="tel"
            autoComplete="tel"
            autoFocus
            placeholder="912 345 678"
            className={inputClass}
            {...phoneForm.register('phone')}
          />
        </div>
        {message !== undefined && (
          <p role="alert" className="-mt-2 mb-4 text-sm text-destructive">
            {message}
          </p>
        )}
        <button
          type="submit"
          className={`${buttonClass} mb-5`}
          disabled={requestOtp.isPending}
        >
          {requestOtp.isPending ? 'Đang gửi…' : 'Gửi mã OTP'}
        </button>

        <div className="mb-5 flex items-center gap-3">
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
          <span className="text-xs text-slate-400">hoặc tiếp tục với</span>
          <div className="h-px flex-1 bg-black/10 dark:bg-white/10" />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <button
            type="button"
            disabled={socialLogin.isPending}
            onClick={() => socialLogin.mutate('google')}
            aria-label="Đăng nhập với Google"
            className={socialButtonClass}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#EA4335"
                d="M12 10.2v3.9h5.5c-.24 1.35-1.68 3.96-5.5 3.96-3.3 0-6-2.73-6-6.1s2.7-6.1 6-6.1c1.88 0 3.14.8 3.86 1.49l2.63-2.53C16.9 3.16 14.7 2.2 12 2.2 6.9 2.2 2.75 6.5 2.75 12s4.15 9.8 9.25 9.8c5.34 0 8.88-3.75 8.88-9.03 0-.61-.07-1.07-.15-1.53H12z"
              />
            </svg>
          </button>
          <button
            type="button"
            disabled={socialLogin.isPending}
            onClick={() => socialLogin.mutate('apple')}
            aria-label="Đăng nhập với Apple"
            className={socialButtonClass}
          >
            <svg
              width={18}
              height={18}
              viewBox="0 0 24 24"
              fill="currentColor"
              aria-hidden
            >
              <path d="M16.365 1.43c0 1.14-.468 2.16-1.223 2.94-.83.86-2.11 1.53-3.13 1.44-.14-1.08.44-2.24 1.2-2.97.79-.77 2.17-1.35 3.15-1.41zM20.6 17.14c-.55 1.27-.81 1.83-1.52 2.95-.99 1.56-2.39 3.51-4.13 3.53-1.54.02-1.94-1-4.03-.99-2.09.01-2.53 1.01-4.07.99-1.74-.02-3.06-1.77-4.05-3.33C.55 16.94-.6 12.4 1.06 9.32c.83-1.54 2.32-2.52 3.94-2.54 1.51-.02 2.94 1.02 3.86 1.02.92 0 2.65-1.26 4.47-1.08.76.03 2.9.31 4.27 2.33-.11.07-2.55 1.49-2.52 4.44.03 3.53 3.1 4.71 3.14 4.73-.02.06-.49 1.68-1.62 3.32z" />
            </svg>
          </button>
          <button
            type="button"
            onClick={onFacebookClick}
            aria-label="Đăng nhập với Facebook (chưa hỗ trợ)"
            className={socialButtonClass}
          >
            <svg width={18} height={18} viewBox="0 0 24 24" aria-hidden>
              <path
                fill="#1877F2"
                d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.1 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.69 4.53-4.69 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.95.93-1.95 1.89v2.26h3.32l-.53 3.49h-2.79V24C19.61 23.1 24 18.1 24 12.07z"
              />
            </svg>
          </button>
        </div>
        {guestCta}
      </form>
    );
  }

  const message =
    codeForm.formState.errors.code?.message ?? errorOf(verifyOtp.error);
  return (
    <form
      key="code"
      onSubmit={codeForm.handleSubmit((v) =>
        verifyOtp.mutate({ phone: phase.phone, code: v.code }),
      )}
      noValidate
    >
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Nhập mã gồm 6 số vừa gửi tới{' '}
        <span className="font-semibold text-slate-700 dark:text-slate-200">
          {phase.phone}
        </span>
      </p>
      <input type="hidden" {...codeForm.register('code')} />
      <div className="mb-5 flex justify-between gap-2">
        {otpDigits.map((digit, index) => (
          <input
            key={index}
            ref={(el) => {
              otpInputRefs.current[index] = el;
            }}
            inputMode="numeric"
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            maxLength={1}
            aria-label={`Chữ số ${index + 1} trên 6 của mã OTP đã gửi tới ${phase.phone}`}
            className="h-13 w-11 rounded-xl bg-slate-100 text-center text-lg font-bold outline-none focus:ring-2 focus:ring-iris dark:bg-surf2"
            value={digit}
            onChange={(e) => setOtpDigit(index, e.target.value)}
            onKeyDown={(e) => handleOtpKeyDown(index, e)}
            onPaste={handleOtpPaste}
          />
        ))}
      </div>
      {message !== undefined && (
        <p role="alert" className="-mt-3 mb-4 text-sm text-destructive">
          {message}
        </p>
      )}
      {errorOf(resendOtp.error) !== undefined && (
        <p role="alert" className="-mt-3 mb-4 text-sm text-destructive">
          {errorOf(resendOtp.error)}
        </p>
      )}
      <button
        type="submit"
        className={`${buttonClass} mb-3`}
        disabled={verifyOtp.isPending}
      >
        {verifyOtp.isPending ? 'Đang xác minh…' : 'Đăng nhập'}
      </button>
      <div className="flex items-center justify-between">
        <button
          type="button"
          className="text-sm font-semibold text-slate-500 disabled:opacity-50 dark:text-slate-400"
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
          className="text-sm font-semibold text-slate-500 dark:text-slate-400"
          onClick={() => setPhase({ step: 'phone' })}
        >
          ← Đổi số điện thoại
        </button>
      </div>
      {guestCta}
    </form>
  );
}
