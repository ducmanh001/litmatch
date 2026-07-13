'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { useIdempotencyKey } from '../../../shared/idempotency/use-idempotency-key';
import { useJoinQueue } from '../api';
import { joinQueueSchema } from '../join-queue-schema';

import type { TicketDto } from '../api';
import type { JoinQueueForm } from '../join-queue-schema';

const inputClass =
  'h-10 w-full rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring';
const buttonClass =
  'h-10 w-full rounded-md bg-primary font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50';

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
    <form className="space-y-4" onSubmit={onSubmit} noValidate>
      <div className="space-y-1.5">
        <span className="text-sm font-medium">Chọn kiểu ghép đôi</span>
        <div className="flex gap-3">
          <label className="flex flex-1 items-center gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary">
            <input type="radio" value="soul" {...form.register('matchType')} />
            Soul Match — chat ẩn danh
          </label>
          <label className="flex flex-1 items-center gap-2 rounded-md border border-border p-3 text-sm has-[:checked]:border-primary">
            <input type="radio" value="voice" {...form.register('matchType')} />
            Voice Match — gọi thoại
          </label>
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor="genderPreference" className="text-sm font-medium">
          Giới tính muốn ghép
        </label>
        <select
          id="genderPreference"
          className={inputClass}
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
      <button
        type="submit"
        className={buttonClass}
        disabled={joinQueue.isPending}
      >
        {joinQueue.isPending ? 'Đang vào hàng đợi…' : 'Tìm ghép đôi'}
      </button>
    </form>
  );
}
