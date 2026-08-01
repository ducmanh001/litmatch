import { useState } from 'react';

import { showToast } from '../../../shared/lib/toast-store';
import { t, useT } from '../../../shared/i18n/catalog';
import { Button } from '../../../shared/ui/button';
import { Card } from '../../../shared/ui/card';
import { ErrorState, LoadingState } from '../../../shared/ui/states';
import { ToggleSwitch } from '../../../shared/ui/toggle-switch';
import {
  useBroadcastNotification,
  useEconomyCatalog,
  useSetIapProductActive,
  useSetVipPlanActive,
} from '../api';

import type {
  AdminIapProductDto,
  AdminVipPlanDto,
  BroadcastAudience,
} from '../api';
import type { ReactNode } from 'react';

type CatalogRow =
  | { type: 'iap'; value: AdminIapProductDto }
  | { type: 'vip'; value: AdminVipPlanDto };

export function ConfigPage() {
  const t = useT();
  const catalog = useEconomyCatalog();
  const setIapActive = useSetIapProductActive();
  const setVipActive = useSetVipPlanActive();

  const rows: CatalogRow[] = [
    ...(catalog.data?.iapProducts ?? []).map((value): CatalogRow => ({
      type: 'iap',
      value,
    })),
    ...(catalog.data?.vipPlans ?? []).map((value): CatalogRow => ({
      type: 'vip',
      value,
    })),
  ];

  const togglePackage = (row: CatalogRow): void => {
    const active = !row.value.active;
    const mutation =
      row.type === 'iap'
        ? setIapActive.mutateAsync({ productId: row.value.productId, active })
        : setVipActive.mutateAsync({ id: row.value.id, active });
    void mutation
      .then(() =>
        showToast(
          t('config.packageUpdated', {
            action: active ? t('common.enabled') : t('common.hidden'),
            name: catalogName(row),
          }),
        ),
      )
      .catch(() => undefined);
  };

  const mutationError = setIapActive.error ?? setVipActive.error;

  return (
    <section className="space-y-4">
      <Card>
        <div className="mb-3.5 flex items-center gap-2.5">
          <h3 className="text-[14.5px] font-extrabold">
            {t('config.catalogTitle')}
          </h3>
        </div>
        {catalog.isPending && (
          <LoadingState label={t('config.loadingCatalog')} />
        )}
        {catalog.error !== null && <ErrorState error={catalog.error} />}
        {mutationError !== null && <ErrorState error={mutationError} />}
        {catalog.data !== undefined && (
          <div className="overflow-x-auto">
            <table className="responsive-table w-full border-collapse text-[13px] md:min-w-[640px]">
              <thead className="border-b border-border">
                <tr>
                  <HeaderCell>{t('config.packageName')}</HeaderCell>
                  <HeaderCell>{t('config.packageType')}</HeaderCell>
                  <HeaderCell>{t('config.value')}</HeaderCell>
                  <HeaderCell>{t('config.price')}</HeaderCell>
                  <HeaderCell>{t('config.status')}</HeaderCell>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const key =
                    row.type === 'iap'
                      ? `iap:${row.value.productId}`
                      : `vip:${row.value.id}`;
                  const busy = setIapActive.isPending || setVipActive.isPending;
                  return (
                    <tr
                      key={key}
                      className="border-b border-border last:border-0 hover:bg-muted"
                    >
                      <td
                        data-label={t('config.packageName')}
                        className="px-[18px] py-[13px] font-mono text-xs"
                      >
                        {catalogName(row)}
                      </td>
                      <td
                        data-label={t('config.packageType')}
                        className="px-[18px] py-[13px] uppercase"
                      >
                        {row.type === 'iap'
                          ? row.value.provider
                          : row.value.tier}
                      </td>
                      <td
                        data-label={t('config.value')}
                        className="px-[18px] py-[13px]"
                      >
                        {row.type === 'iap'
                          ? `${row.value.diamonds} 💎`
                          : t('config.days', { count: row.value.days })}
                      </td>
                      <td
                        data-label={t('config.price')}
                        className="px-[18px] py-[13px]"
                      >
                        {row.type === 'iap'
                          ? t('config.storeManaged')
                          : `${row.value.priceDiamond} 💎`}
                      </td>
                      <td
                        data-label={t('config.status')}
                        className="px-[18px] py-[13px]"
                      >
                        <div className="flex items-center gap-2.5">
                          <ToggleSwitch
                            checked={row.value.active}
                            onChange={() => togglePackage(row)}
                            disabled={busy}
                            label={t('config.togglePackage', {
                              name: catalogName(row),
                            })}
                          />
                          <span className="text-xs text-muted-foreground">
                            {row.value.active
                              ? t('config.onSale')
                              : t('common.hidden')}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <NotifyComposerCard />
    </section>
  );
}

function HeaderCell({ children }: { children: ReactNode }) {
  return (
    <th className="px-[18px] py-3 text-left text-[11px] font-bold tracking-wide text-muted-foreground uppercase">
      {children}
    </th>
  );
}

function catalogName(row: CatalogRow): string {
  return row.type === 'iap'
    ? row.value.productId
    : `${row.value.tier.toUpperCase()} · ${t('config.days', { count: row.value.days })}`;
}

function NotifyComposerCard() {
  const t = useT();
  const [title, setTitle] = useState('');
  const [audience, setAudience] = useState<BroadcastAudience>('all');
  const [body, setBody] = useState('');
  const broadcast = useBroadcastNotification();

  return (
    <Card>
      <div className="mb-1 flex items-center gap-2.5">
        <h3 className="text-[14.5px] font-extrabold">
          {t('config.composeNotification')}
        </h3>
      </div>
      <p className="pb-3.5 text-[11.5px] text-muted-foreground">
        {t('config.notificationHint')}
      </p>
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          const normalizedTitle = title.trim();
          const normalizedBody = body.trim();
          if (normalizedTitle === '' || normalizedBody === '') {
            showToast(t('config.requiredNotification'), 'warn');
            return;
          }
          broadcast.mutate(
            {
              title: normalizedTitle,
              body: normalizedBody,
              audience,
            },
            {
              onSuccess: (result) => {
                if (result === undefined) return;
                showToast(
                  t('config.notificationSent', {
                    count: result.recipientCount.toLocaleString(),
                  }),
                );
                setTitle('');
                setBody('');
              },
            },
          );
        }}
        noValidate
      >
        <div className="flex flex-wrap items-end gap-4">
          <label
            className="flex min-w-[260px] flex-col gap-1.5"
            htmlFor="notify-title"
          >
            <span className="text-xs font-bold text-muted-foreground">
              {t('config.title')}
            </span>
            <input
              id="notify-title"
              value={title}
              maxLength={120}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t('config.titlePlaceholder')}
              className="h-9 rounded-[9px] border border-border bg-muted px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-ring"
            />
          </label>
          <label className="flex flex-col gap-1.5" htmlFor="notify-audience">
            <span className="text-xs font-bold text-muted-foreground">
              {t('config.audience')}
            </span>
            <select
              id="notify-audience"
              value={audience}
              onChange={(event) =>
                setAudience(event.target.value as BroadcastAudience)
              }
              className="h-9 rounded-[9px] border border-border bg-muted px-3 text-[13px] focus-visible:outline-2 focus-visible:outline-ring"
            >
              <option value="all">{t('config.allUsers')}</option>
              <option value="vip">{t('config.vipUsers')}</option>
              <option value="free">{t('config.freeUsers')}</option>
            </select>
          </label>
        </div>
        <label className="flex flex-col gap-1.5" htmlFor="notify-body">
          <span className="text-xs font-bold text-muted-foreground">
            {t('config.body')}
          </span>
          <textarea
            id="notify-body"
            value={body}
            maxLength={500}
            onChange={(event) => setBody(event.target.value)}
            rows={3}
            placeholder={t('config.bodyPlaceholder')}
            className="resize-y rounded-[9px] border border-border bg-muted px-3 py-2.5 text-[13px] focus-visible:outline-2 focus-visible:outline-ring"
          />
        </label>
        <Button type="submit" disabled={broadcast.isPending}>
          {broadcast.isPending
            ? t('config.sending')
            : t('config.sendNotification')}
        </Button>
        {broadcast.error !== null && <ErrorState error={broadcast.error} />}
      </form>
    </Card>
  );
}
