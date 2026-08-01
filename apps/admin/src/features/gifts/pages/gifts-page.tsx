import { zodResolver } from '@hookform/resolvers/zod';
import { isApiError } from '@litmatch/api-client';
import { useForm } from 'react-hook-form';

import { showToast } from '../../../shared/lib/toast-store';
import { useT } from '../../../shared/i18n/catalog';
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

import type {
  CreateGiftForm,
  CreateGiftFormInput,
} from '../create-gift-schema';

export function GiftsPage() {
  const t = useT();
  const { data, isPending, error } = useGiftsList();
  const createGift = useCreateGift();
  const updateGift = useUpdateGift();

  const form = useForm<CreateGiftFormInput, unknown, CreateGiftForm>({
    resolver: zodResolver(createGiftSchema),
  });

  const mutationError = (err: unknown): string | undefined =>
    err === null || err === undefined
      ? undefined
      : isApiError(err)
        ? err.message
        : t('common.tryAgain');

  return (
    <section className="space-y-4">
      <Card>
        <h3 className="mb-3.5 text-[14.5px] font-extrabold">
          {t('gifts.createTitle')}
        </h3>
        <form
          className="flex flex-wrap items-end gap-4"
          onSubmit={form.handleSubmit((values) => {
            createGift.mutate(
              { ...values, sortOrder: 0 },
              {
                onSuccess: () => {
                  form.reset();
                  showToast(t('gifts.created', { name: values.name }));
                },
              },
            );
          })}
          noValidate
        >
          <Field
            htmlFor="gift-code"
            label={t('gifts.code')}
            error={form.formState.errors.code?.message}
          >
            <Input
              id="gift-code"
              placeholder={t('gifts.codePlaceholder')}
              {...form.register('code')}
            />
          </Field>
          <Field
            htmlFor="gift-name"
            label={t('gifts.name')}
            error={form.formState.errors.name?.message}
          >
            <Input
              id="gift-name"
              placeholder={t('gifts.namePlaceholder')}
              {...form.register('name')}
            />
          </Field>
          <Field
            htmlFor="gift-price"
            label={t('gifts.price')}
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
            {createGift.isPending ? t('gifts.creating') : t('gifts.create')}
          </Button>
        </form>
      </Card>

      {isPending && <LoadingState />}
      {error !== null && <ErrorState error={error} />}
      {data !== undefined && data.length === 0 && (
        <EmptyState title={t('gifts.empty')} />
      )}

      {data !== undefined && data.length > 0 && (
        <Card className="overflow-hidden p-0">
          <div className="overflow-x-auto">
            <table className="responsive-table w-full border-collapse text-[13px] md:min-w-[640px]">
              <thead className="border-b border-border">
                <tr>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    {t('gifts.codeColumn')}
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    {t('gifts.name')}
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    {t('gifts.priceColumn')}
                  </th>
                  <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
                    {t('gifts.status')}
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
                              t('gifts.toggled', {
                                action: gift.active
                                  ? t('common.disabled')
                                  : t('common.enabled'),
                                name: gift.name,
                              }),
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
                              t('gifts.priceSaved', {
                                name: gift.name,
                                price: priceDiamond,
                              }),
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
  const t = useT();
  return (
    <tr className="border-b border-border last:border-0 hover:bg-muted">
      <td
        data-label={t('gifts.codeColumn')}
        className="px-[18px] py-[13px] font-mono text-[11.5px] text-muted-foreground"
      >
        {gift.code}
      </td>
      <td data-label={t('gifts.name')} className="px-[18px] py-[13px]">
        {gift.name}
      </td>
      <td data-label={t('gifts.priceColumn')} className="px-[18px] py-[13px]">
        <PriceEditor initial={gift.priceDiamond} onSave={onSavePrice} />
      </td>
      <td data-label={t('gifts.status')} className="px-[18px] py-[13px]">
        <Pill variant={gift.active ? 'green' : 'neutral'}>
          {gift.active ? t('gifts.onSale') : t('common.disabled')}
        </Pill>
      </td>
      <td data-label="" className="px-[18px] py-[13px] text-right">
        <Button
          size="sm"
          variant={gift.active ? 'destructive' : 'outline'}
          disabled={onTogglePending}
          onClick={onToggle}
        >
          {gift.active ? t('gifts.disable') : t('gifts.enable')}
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
  const t = useT();
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
        {t('common.save')}
      </Button>
    </form>
  );
}
