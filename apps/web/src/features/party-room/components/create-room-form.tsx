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
    defaultValues: { title: '' },
  });
  const createRoom = useCreateRoom();

  const message =
    form.formState.errors.title?.message ??
    (isApiError(createRoom.error)
      ? createRoom.error.message
      : createRoom.error != null
        ? 'Có lỗi xảy ra, thử lại.'
        : undefined);

  const onSubmit = form.handleSubmit(({ title }) => {
    createRoom.mutate(title, {
      onSuccess: (joined) => {
        if (joined === undefined) return;
        router.push(`/party/${joined.room.id}`);
      },
    });
  });

  return (
    <form className="space-y-1.5" onSubmit={onSubmit} noValidate>
      <div className="flex gap-2">
        <input
          type="text"
          aria-label="Tên phòng"
          placeholder="Đặt tên cho phòng…"
          className="h-10 flex-1 rounded-md border border-border bg-card px-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          {...form.register('title')}
        />
        <button
          type="submit"
          className="h-10 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
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
