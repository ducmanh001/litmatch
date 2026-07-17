'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { Button } from '../../../shared/ui/button';
import { DiamondIcon, MatchIcon, MicIcon } from '../../../shared/ui/icons';
import { useJoinQueue } from '../api';
import { joinQueueSchema } from '../join-queue-schema';

import type { TicketDto } from '../api';
import type { JoinQueueForm } from '../join-queue-schema';

const MATCH_OPTIONS = [
  {
    value: 'soul',
    eyebrow: 'Tin nhắn',
    title: 'Ghép đôi Tâm hồn',
    description:
      'Trò chuyện ẩn danh 2–3 phút, tập trung vào câu chuyện trước khi xem hồ sơ.',
    detail: 'Chỉ mở kết nối khi cả hai cùng thấy phù hợp.',
    Icon: MatchIcon,
  },
  {
    value: 'voice',
    eyebrow: 'Giọng nói',
    title: 'Ghép đôi Voice',
    description:
      'Lắng nghe giọng nói thật trong một cuộc gọi ngắn và riêng tư.',
    detail: 'Phù hợp khi bạn muốn cảm nhận sự tự nhiên ngay từ đầu.',
    Icon: MicIcon,
  },
] as const;

export function MatchTypePicker({
  onJoined,
}: {
  onJoined: (ticket: TicketDto) => void;
}) {
  const form = useForm<JoinQueueForm>({
    resolver: zodResolver(joinQueueSchema),
    defaultValues: { matchType: 'soul', genderPreference: 'any' },
  });
  const joinQueue = useJoinQueue();
  // 1 key cho cả intent "vào hàng đợi" hiện tại — giữ nguyên qua các lần retry lỗi mạng.
  const { key, resetKey } = useIdempotencyKey();
  const selectedMatchType = form.watch('matchType');

  const message = isApiError(joinQueue.error)
    ? joinQueue.error.message
    : joinQueue.error !== null && joinQueue.error !== undefined
      ? 'Có lỗi xảy ra, thử lại.'
      : undefined;

  const onSubmit = form.handleSubmit((body) => {
    joinQueue.mutate(
      { body, idempotencyKey: key },
      {
        onSuccess: (ticket) => {
          if (ticket === undefined) return;
          resetKey();
          onJoined(ticket);
        },
      },
    );
  });

  return (
    <form className="space-y-6" onSubmit={onSubmit} noValidate>
      <fieldset className="space-y-4">
        <legend className="text-lg font-extrabold dark:text-white">
          Bạn muốn bắt đầu thế nào?
        </legend>
        <p className="text-sm leading-6 text-muted-foreground dark:text-white/70">
          Chọn cách giúp bạn thoải mái thể hiện bản thân nhất. Đối phương vẫn ẩn
          danh trong lần gặp đầu tiên.
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          {MATCH_OPTIONS.map((option) => (
            <label
              key={option.value}
              className="group relative flex min-h-56 cursor-pointer flex-col rounded-3xl border border-border bg-background p-5 transition hover:border-iris/40 hover:bg-iris/[0.03] has-[:checked]:border-irisl has-[:checked]:bg-iris/[0.08] has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-iris dark:border-white/10 dark:bg-surf2/40 dark:hover:border-irisl/35 dark:hover:bg-white/[0.04] dark:has-[:checked]:border-irisl/60 dark:has-[:checked]:bg-iris/[0.12]"
            >
              <input
                type="radio"
                value={option.value}
                className="sr-only"
                aria-describedby={`match-option-${option.value}`}
                {...form.register('matchType')}
              />
              <div className="flex items-start justify-between gap-3">
                <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-iris/10 text-irisl transition group-has-[:checked]:bg-irisl group-has-[:checked]:text-white dark:bg-white/[0.05] dark:text-white">
                  <option.Icon width={21} height={21} />
                </span>
                <span className="rounded-full border border-border bg-card px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.12em] text-muted-foreground group-has-[:checked]:border-iris/20 group-has-[:checked]:bg-iris/10 group-has-[:checked]:text-irisl dark:border-white/10 dark:bg-surf dark:text-white/70 dark:group-has-[:checked]:border-rose-300/25 dark:group-has-[:checked]:bg-rose-300/10 dark:group-has-[:checked]:text-white">
                  {option.eyebrow}
                </span>
              </div>
              <div className="mt-5 flex-1">
                <p className="font-extrabold dark:text-white">{option.title}</p>
                <p
                  id={`match-option-${option.value}`}
                  className="mt-2 text-sm leading-6 text-muted-foreground dark:text-white/70"
                >
                  {option.description}
                </p>
              </div>
              <p className="mt-4 border-t border-border pt-3 text-xs font-semibold leading-5 text-foreground/70 dark:border-white/10 dark:text-white/80">
                {option.detail}
              </p>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <div>
          <label
            htmlFor="genderPreference"
            className="mb-2 block text-xs font-extrabold uppercase tracking-[0.12em] text-muted-foreground dark:text-white/70"
          >
            Người bạn muốn gặp
          </label>
          <select
            id="genderPreference"
            className="h-12 w-full rounded-2xl border border-border bg-background px-4 text-sm font-semibold outline-none transition focus:border-irisl focus:ring-2 focus:ring-iris/10 dark:border-white/10 dark:bg-surf2/65 dark:text-white"
            {...form.register('genderPreference')}
          >
            <option value="any">Không giới hạn giới tính</option>
            <option value="male">Nam</option>
            <option value="female">Nữ</option>
          </select>
        </div>

        <div className="rounded-2xl border border-iris/10 bg-iris/[0.05] p-4 dark:border-white/10 dark:bg-white/[0.04]">
          {selectedMatchType === 'soul' ? (
            <>
              <p className="text-xs font-extrabold text-foreground dark:text-white">
                Quyền riêng tư trong Soul Match
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/70">
                Hồ sơ chỉ được mở khi cả hai cùng chọn thích sau cuộc trò
                chuyện.
              </p>
            </>
          ) : (
            <>
              <p className="flex items-center gap-1.5 text-xs font-extrabold text-diamond-foreground dark:text-white">
                <DiamondIcon width={13} height={13} />
                Thông tin về diamond
              </p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground dark:text-white/70">
                Chọn Voice không trừ diamond ở bước này. Nếu cuộc gọi chuyển
                sang phần dùng diamond, điều kiện của phiên gọi được máy chủ
                quyết định; hub ghép đôi không tự suy ra thời lượng hay giá.
              </p>
            </>
          )}
        </div>
      </div>

      {message !== undefined && (
        <p
          role="alert"
          className="rounded-2xl bg-destructive/10 px-4 py-3 text-sm font-semibold text-destructive"
        >
          {message}
        </p>
      )}

      <div className="space-y-2">
        <Button
          type="submit"
          size="lg"
          className="w-full bg-irisl text-white shadow-none hover:bg-irisl/90"
          disabled={joinQueue.isPending}
        >
          {joinQueue.isPending
            ? 'Đang vào hàng đợi…'
            : selectedMatchType === 'soul'
              ? 'Bắt đầu ghép đôi Tâm hồn'
              : 'Bắt đầu ghép đôi Voice'}
        </Button>
        <p className="text-center text-[11px] leading-5 text-muted-foreground dark:text-white/65">
          Bạn có thể huỷ khi còn trong hàng đợi. Khi đã tìm thấy người phù hợp,
          hãy xác nhận hoặc chờ phiên tự hết hạn.
        </p>
      </div>
    </form>
  );
}
