'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { placeholderAvatarUrl } from '../../../shared/lib/placeholder-avatar';
import { MicIcon, ProfileIcon } from '../../../shared/ui/icons';

import type { DiscoveryCardDto, NearbyCardDto } from '../api';

function MessageIcon() {
  return (
    <svg
      width={22}
      height={22}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 15a4 4 0 0 1-4 4H8l-5 3 1.7-5.1A7.5 7.5 0 0 1 3 12V8a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4Z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2.25}
      strokeLinecap="round"
      aria-hidden
    >
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

/** Sheet chi tiết 1 user — invite CTA điều khiển bởi route cha (route được phép import
 * `features/matching`, feature `discovery` thì không — docs/13 § 13.3 boundary). */
export function DiscoveryDetailSheet({
  card,
  onClose,
  onInvite,
  inviteId,
  isInviting,
  inviteError,
  invitedMatchType,
}: {
  card: DiscoveryCardDto | NearbyCardDto;
  onClose: () => void;
  onInvite: (matchType: 'soul' | 'voice') => void;
  inviteId: string | undefined;
  isInviting: boolean;
  inviteError: string | undefined;
  invitedMatchType: 'soul' | 'voice' | undefined;
}) {
  const titleId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const [imageFailed, setImageFailed] = useState(false);
  const meta =
    'ageBucket' in card
      ? card.ageBucket === null
        ? undefined
        : `${card.ageBucket} tuổi`
      : `Trong khoảng ${card.distanceBucket}`;

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    previouslyFocusedRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const overlay = overlayRef.current;
    const background = Array.from(overlay?.parentElement?.children ?? [])
      .filter((element) => element !== overlay)
      .filter(
        (element): element is HTMLElement => element instanceof HTMLElement,
      )
      .map((element) => ({
        element,
        inert: element.inert,
        inertAttribute: element.hasAttribute('inert'),
        ariaHidden: element.getAttribute('aria-hidden'),
      }));
    for (const { element } of background) {
      element.inert = true;
      element.setAttribute('inert', '');
      element.setAttribute('aria-hidden', 'true');
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;

      const focusable = Array.from(
        dialogRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
      if (focusable.length === 0) {
        event.preventDefault();
        return;
      }
      const first = focusable[0];
      const last = focusable.at(-1);
      if (first === undefined || last === undefined) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      } else if (!dialogRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      for (const { element, inert, inertAttribute, ariaHidden } of background) {
        element.inert = inert;
        if (inertAttribute) element.setAttribute('inert', '');
        else element.removeAttribute('inert');
        if (ariaHidden === null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', ariaHidden);
      }
      previouslyFocusedRef.current?.focus();
      previouslyFocusedRef.current = null;
    };
  }, []);

  return (
    <div
      ref={overlayRef}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 md:items-center md:p-6"
    >
      <button
        type="button"
        tabIndex={-1}
        className="absolute inset-0 h-full w-full cursor-default bg-black/60 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden="true"
      />

      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="relative z-10 max-h-[92dvh] w-full overflow-y-auto rounded-t-[2rem] border border-transparent bg-card shadow-2xl md:max-w-3xl md:rounded-[2rem] dark:border-white/10 dark:bg-surf dark:shadow-black/50"
      >
        <h2 id={titleId} className="sr-only">
          Hồ sơ của {card.profile.nickname}
        </h2>
        <div className="mx-auto mt-3 h-1 w-10 rounded-full bg-border md:hidden dark:bg-white/20" />
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          aria-label="Đóng hồ sơ"
          className="absolute right-4 top-4 z-20 flex h-10 w-10 items-center justify-center rounded-full border border-white/20 bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring md:right-5 md:top-5"
        >
          <CloseIcon />
        </button>

        <div className="grid md:grid-cols-[0.88fr_1.12fr]">
          <div className="relative min-h-64 overflow-hidden bg-muted md:min-h-[520px] md:rounded-l-[2rem] dark:bg-surf2">
            {imageFailed ? (
              <span className="absolute inset-0 flex items-center justify-center">
                <ProfileIcon
                  width={64}
                  height={64}
                  className="text-muted-foreground dark:text-white/50"
                />
              </span>
            ) : (
              <img
                src={placeholderAvatarUrl(card.profile.id)}
                alt=""
                width={520}
                height={650}
                onError={() => setImageFailed(true)}
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
            <span className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-black/75 to-transparent md:hidden" />
            <div className="absolute inset-x-0 bottom-0 p-5 text-white md:hidden">
              <p className="text-2xl font-extrabold">{card.profile.nickname}</p>
              {meta !== undefined && (
                <p className="mt-1 text-sm font-semibold text-white/90">
                  {meta}
                </p>
              )}
            </div>
          </div>

          <div className="p-5 pb-8 dark:bg-gradient-to-b dark:from-surf dark:to-iris/[0.04] md:flex md:min-h-[520px] md:flex-col md:p-8">
            <div className="hidden md:block">
              <p className="mb-2 text-xs font-extrabold tracking-[0.16em] text-muted-foreground dark:text-white/85">
                HỒ SƠ KHÁM PHÁ
              </p>
              <p className="text-3xl font-extrabold dark:text-white">
                {card.profile.nickname}
              </p>
              {meta !== undefined && (
                <p className="mt-1.5 text-sm font-semibold text-muted-foreground dark:text-white/75">
                  {meta}
                </p>
              )}
            </div>

            <div className="mt-1 rounded-2xl bg-muted p-4 dark:border dark:border-white/10 dark:bg-surf2/65 md:mt-6">
              <p className="text-sm font-bold dark:text-white">
                Mở lời theo cách bạn thấy tự nhiên
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/75">
                Chọn trò chuyện hoặc voice. Kết nối chỉ tiếp tục khi đối phương
                chấp nhận lời mời của bạn.
              </p>
            </div>

            {inviteError !== undefined && (
              <p role="alert" className="mt-4 text-sm text-destructive">
                {inviteError}
              </p>
            )}

            <div className="mt-auto pt-5">
              {invitedMatchType !== undefined && inviteId !== undefined ? (
                <div
                  role="status"
                  className="rounded-2xl border border-primary/20 bg-primary/10 p-4 dark:border-rose-300/25 dark:bg-rose-300/10"
                >
                  <p className="font-bold dark:text-white">
                    Lời mời đã được gửi
                  </p>
                  <p className="mt-1 text-sm text-muted-foreground dark:text-white/75">
                    Đã gửi lời mời{' '}
                    {invitedMatchType === 'soul' ? 'Soul Match' : 'Voice Match'}{' '}
                    — chờ đối phương phản hồi.
                  </p>
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-1">
                  <button
                    type="button"
                    aria-label="Mời Soul Match"
                    disabled={isInviting}
                    onClick={() => onInvite('soul')}
                    className="flex min-h-16 items-center gap-3 rounded-2xl bg-foreground px-4 text-left text-background transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 dark:bg-rose-500 dark:text-white dark:shadow-none"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-background/15">
                      <MessageIcon />
                    </span>
                    <span>
                      <span className="block text-sm font-extrabold">
                        Trò chuyện trước
                      </span>
                      <span className="block text-[11px] opacity-80">
                        Soul Match
                      </span>
                    </span>
                  </button>
                  <button
                    type="button"
                    aria-label="Mời Voice Match"
                    disabled={isInviting}
                    onClick={() => onInvite('voice')}
                    className="flex min-h-16 items-center gap-3 rounded-2xl border border-border bg-card px-4 text-left transition hover:bg-muted focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50 dark:border-white/15 dark:bg-surf2/65 dark:text-white dark:hover:bg-surf2"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-foreground dark:bg-rose-300/15 dark:text-white">
                      <MicIcon />
                    </span>
                    <span>
                      <span className="block text-sm font-extrabold">
                        Nói chuyện qua voice
                      </span>
                      <span className="block text-[11px] text-muted-foreground dark:text-white/70">
                        Voice Match
                      </span>
                    </span>
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
