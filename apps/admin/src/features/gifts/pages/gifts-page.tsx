import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Input } from '../../../shared/ui/input';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import { createGiftSchema } from '../create-gift-schema';
import { useCreateGift, useGiftsList, useUpdateGift } from '../api';

import type { CreateGiftForm } from '../create-gift-schema';

export function GiftsPage() {
  const { data, isPending, error } = useGiftsList();
  const createGift = useCreateGift();
  const updateGift = useUpdateGift();

  const form = useForm<CreateGiftForm>({
    resolver: zodResolver(createGiftSchema),
  });

  const mutationError = (err: unknown): string | undefined =>
    err === null || err === undefined
      ? undefined
      : isApiError(err)
        ? err.message
        : 'Có lỗi xảy ra, thử lại.';

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Gift catalog</h1>

      <Card className="space-y-4">
        <h2 className="font-medium">Tạo quà mới</h2>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={form.handleSubmit((values) => {
            createGift.mutate(values, { onSuccess: () => form.reset() });
          })}
          noValidate
        >
          <Field
            htmlFor="gift-code"
            label="Mã (code)"
            error={form.formState.errors.code?.message}
          >
            <Input id="gift-code" {...form.register('code')} />
          </Field>
          <Field
            htmlFor="gift-name"
            label="Tên"
            error={form.formState.errors.name?.message}
          >
            <Input id="gift-name" {...form.register('name')} />
          </Field>
          <Field
            htmlFor="gift-price"
            label="Giá (diamond)"
            error={
              form.formState.errors.priceDiamond?.message ??
              mutationError(createGift.error)
            }
          >
            <Input
              id="gift-price"
              type="number"
              min={1}
              {...form.register('priceDiamond')}
            />
          </Field>
          <Button type="submit" disabled={createGift.isPending}>
            {createGift.isPending ? 'Đang tạo…' : 'Tạo quà'}
          </Button>
        </form>
      </Card>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.length === 0 && (
        <EmptyState title="Chưa có quà nào trong catalog" />
      )}

      {data !== undefined && data.length > 0 && (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-border text-muted-foreground">
              <tr>
                <th className="px-4 py-2 font-medium">Code</th>
                <th className="px-4 py-2 font-medium">Tên</th>
                <th className="px-4 py-2 font-medium">Giá (DIA)</th>
                <th className="px-4 py-2 font-medium">Trạng thái</th>
                <th className="px-4 py-2 font-medium" />
              </tr>
            </thead>
            <tbody>
              {data.map((gift) => (
                <GiftRow
                  key={gift.id}
                  gift={gift}
                  onTogglePending={updateGift.isPending}
                  onToggle={() =>
                    updateGift.mutate({
                      id: gift.id,
                      body: { active: !gift.active },
                    })
                  }
                  onSavePrice={(priceDiamond) =>
                    updateGift.mutate({ id: gift.id, body: { priceDiamond } })
                  }
                />
              ))}
            </tbody>
          </table>
        </Card>
      )}

      {mutationError(updateGift.error) !== undefined && (
        <p role="alert" className="text-sm text-destructive">
          {mutationError(updateGift.error)}
        </p>
      )}
    </section>
  );
}

function GiftRow({
  gift,
  onToggle,
  onTogglePending,
  onSavePrice,
}: {
  gift: {
    id: string;
    code: string;
    name: string;
    priceDiamond: number;
    active: boolean;
  };
  onToggle: () => void;
  onTogglePending: boolean;
  onSavePrice: (price: number) => void;
}) {
  return (
    <tr className="border-b border-border last:border-0">
      <td className="px-4 py-2 font-mono text-xs">{gift.code}</td>
      <td className="px-4 py-2">{gift.name}</td>
      <td className="px-4 py-2">
        <PriceEditor initial={gift.priceDiamond} onSave={onSavePrice} />
      </td>
      <td className="px-4 py-2">{gift.active ? 'Đang bán' : 'Đã tắt'}</td>
      <td className="px-4 py-2 text-right">
        <Button
          size="sm"
          variant={gift.active ? 'destructive' : 'outline'}
          disabled={onTogglePending}
          onClick={onToggle}
        >
          {gift.active ? 'Tắt' : 'Bật'}
        </Button>
      </td>
    </tr>
  );
}

function PriceEditor({
  initial,
  onSave,
}: {
  initial: number;
  onSave: (price: number) => void;
}) {
  return (
    <form
      className="flex items-center gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        const raw = new FormData(e.currentTarget).get('price');
        const parsed = Number(raw);
        if (Number.isInteger(parsed) && parsed >= 1) onSave(parsed);
      }}
    >
      <Input
        name="price"
        type="number"
        min={1}
        defaultValue={initial}
        className="h-8 w-24"
      />
      <Button type="submit" size="sm" variant="ghost">
        Lưu
      </Button>
    </form>
  );
}
