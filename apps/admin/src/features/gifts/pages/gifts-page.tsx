import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { showToast } from '../../../shared/lib/toast-store';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { Field } from '../../../shared/ui/field';
import { Input } from '../../../shared/ui/input';
import { Pill } from '../../../shared/ui/pill';
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
      <Card>
        <h3 className="mb-3.5 text-[14.5px] font-extrabold">Tạo quà mới</h3>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={form.handleSubmit((values) => {
            createGift.mutate(values, {
              onSuccess: () => {
                form.reset();
                showToast(`Đã tạo quà mới "${values.name}"`);
              },
            });
          })}
          noValidate
        >
          <Field
            htmlFor="gift-code"
            label="Mã (code)"
            error={form.formState.errors.code?.message}
          >
            <Input
              id="gift-code"
              placeholder="VD: ROSE"
              {...form.register('code')}
            />
          </Field>
          <Field
            htmlFor="gift-name"
            label="Tên"
            error={form.formState.errors.name?.message}
          >
            <Input
              id="gift-name"
              placeholder="VD: Hoa hồng"
              {...form.register('name')}
            />
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
              placeholder="100"
              {...form.register('priceDiamond')}
            />
          </Field>
          <Button type="submit" className="h-9" disabled={createGift.isPending}>
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
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[13px]">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Code
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Tên
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Giá (DIA)
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    Trạng thái
                  </th>
                  <th className="px-[18px] py-3" />
                </tr>
              </thead>
              <tbody>
                {data.map((gift) => (
                  <GiftRow
                    key={gift.id}
                    gift={gift}
                    onTogglePending={updateGift.isPending}
                    onToggle={() =>
                      updateGift.mutate(
                        { id: gift.id, body: { active: !gift.active } },
                        {
                          onSuccess: () =>
                            showToast(
                              `${gift.active ? 'Đã tắt' : 'Đã bật'} quà "${gift.name}"`,
                            ),
                        },
                      )
                    }
                    onSavePrice={(priceDiamond) =>
                      updateGift.mutate(
                        { id: gift.id, body: { priceDiamond } },
                        {
                          onSuccess: () =>
                            showToast(
                              `Đã lưu giá quà "${gift.name}": ${priceDiamond} DIA`,
                            ),
                        },
                      )
                    }
                  />
                ))}
              </tbody>
            </table>
          </div>
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
    <tr className="border-b border-border last:border-0 hover:bg-muted">
      <td className="px-[18px] py-[13px] font-mono text-[11.5px] text-muted-foreground">
        {gift.code}
      </td>
      <td className="px-[18px] py-[13px]">{gift.name}</td>
      <td className="px-[18px] py-[13px]">
        <PriceEditor initial={gift.priceDiamond} onSave={onSavePrice} />
      </td>
      <td className="px-[18px] py-[13px]">
        <Pill variant={gift.active ? 'green' : 'neutral'}>
          {gift.active ? 'Đang bán' : 'Đã tắt'}
        </Pill>
      </td>
      <td className="px-[18px] py-[13px] text-right">
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
        className="h-8 w-[100px]"
      />
      <Button type="submit" size="sm" variant="ghost">
        Lưu
      </Button>
    </form>
  );
}
