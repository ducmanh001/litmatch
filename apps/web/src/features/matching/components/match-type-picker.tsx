'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { Button } from '../../../shared/ui/button';
import { MatchIcon, MicIcon } from '../../../shared/ui/icons';
import { useJoinQueue } from '../api';
import { joinQueueSchema } from '../join-queue-schema';

import type { TicketDto } from '../api';
import type { JoinQueueForm } from '../join-queue-schema';

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
      <div className="space-y-3">
        <h2 className="text-sm font-extrabold tracking-wide text-slate-500 dark:text-slate-400">
          Chọn kiểu ghép đôi
        </h2>
        <div className="grid grid-cols-2 gap-3">
          <label className="group relative flex cursor-pointer flex-col rounded-2xl border border-black/5 bg-white p-4 transition-colors has-[:checked]:border-transparent has-[:checked]:bg-gradient-to-br has-[:checked]:from-irisl has-[:checked]:to-irisl has-[:checked]:text-white has-[:checked]:shadow-lg has-[:checked]:shadow-iris/25 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-iris dark:border-white/5 dark:bg-surf">
            <input
              type="radio"
              value="soul"
              className="sr-only"
              {...form.register('matchType')}
            />
            <MatchIcon
              width={24}
              height={24}
              className="mb-6 text-irisl group-has-[:checked]:text-white"
            />
            <p className="font-bold">Soul Match</p>
            <p className="mt-0.5 text-xs text-slate-500 group-has-[:checked]:text-white/80 dark:text-slate-400">
              Chat ẩn danh 2-3 phút
            </p>
          </label>
          <label className="group relative flex cursor-pointer flex-col rounded-2xl border border-black/5 bg-white p-4 transition-colors has-[:checked]:border-transparent has-[:checked]:bg-gradient-to-br has-[:checked]:from-irisl has-[:checked]:to-irisl has-[:checked]:text-white has-[:checked]:shadow-lg has-[:checked]:shadow-iris/25 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-iris dark:border-white/5 dark:bg-surf">
            <input
              type="radio"
              value="voice"
              className="sr-only"
              {...form.register('matchType')}
            />
            <MicIcon
              width={24}
              height={24}
              className="mb-6 text-irisl group-has-[:checked]:text-white"
            />
            <p className="font-bold">Voice Match</p>
            <p className="mt-0.5 text-xs text-slate-500 group-has-[:checked]:text-white/80 dark:text-slate-400">
              Nghe giọng ~7 phút
            </p>
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <label
          htmlFor="genderPreference"
          className="block text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500"
        >
          Giới tính muốn ghép
        </label>
        <select
          id="genderPreference"
          className="h-12 w-full rounded-xl border border-black/5 bg-white px-4 text-sm outline-none focus:border-irisl dark:border-white/10 dark:bg-surf"
          {...form.register('genderPreference')}
        >
          <option value="any">Bất kỳ</option>
          <option value="male">Nam</option>
          <option value="female">Nữ</option>
        </select>
      </div>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
      <Button type="submit" className="w-full" disabled={joinQueue.isPending}>
        {joinQueue.isPending ? 'Đang vào hàng đợi…' : 'Tìm ghép đôi'}
      </Button>
    </form>
  );
}
