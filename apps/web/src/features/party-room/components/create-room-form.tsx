'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';

import { useCreateRoom } from '../api';
import { createRoomSchema } from '../create-room-schema';

import type { CreateRoomForm as CreateRoomFormValues } from '../create-room-schema';

export function CreateRoomForm() {
  const router = useRouter();
  const form = useForm<CreateRoomFormValues>({
    resolver: zodResolver(createRoomSchema),
    defaultValues: { title: '', category: 'talk' },
  });
  const createRoom = useCreateRoom();

  const message =
    form.formState.errors.title?.message ??
    (isApiError(createRoom.error)
      ? createRoom.error.message
      : createRoom.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit((values) => {
    createRoom.mutate(values, {
      onSuccess: (joined) => {
        if (joined === undefined) return;
        router.push(`/party/${joined.room.id}`);
      },
    });
  });

  return (
    <form className="space-y-1.5" onSubmit={onSubmit} noValidate>
      <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
        <input
          type="text"
          aria-label="Tên phòng"
          placeholder="Đặt tên cho phòng…"
          className="h-11 flex-1 rounded-full border border-black/5 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:border-white/5 dark:bg-surf"
          {...form.register('title')}
        />
        <select
          aria-label="Chủ đề phòng"
          className="h-11 rounded-full border border-black/5 bg-white px-4 text-sm outline-none focus:ring-2 focus:ring-iris dark:border-white/5 dark:bg-surf"
          {...form.register('category')}
        >
          <option value="talk">💬 Tâm sự</option>
          <option value="sing">🎤 Ca hát</option>
          <option value="friend">👋 Kết bạn</option>
          <option value="study">📚 Học tập</option>
          <option value="other">✨ Khác</option>
        </select>
        <button
          type="submit"
          className="h-11 shrink-0 rounded-full bg-gradient-to-br from-irisl to-irisl px-5 text-sm font-bold text-white shadow-lg shadow-iris/30 disabled:opacity-50 sm:col-span-2"
          disabled={createRoom.isPending}
        >
          {createRoom.isPending ? 'Đang tạo…' : 'Tạo phòng'}
        </button>
      </div>
      {message !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {message}
        </p>
      )}
    </form>
  );
}
