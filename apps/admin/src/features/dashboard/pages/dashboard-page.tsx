import { Activity, Gem, Radio, UserPlus } from 'lucide-react';
import { Link } from 'react-router-dom';

import { useLiveRooms } from '../../rooms/api';
import { Card } from '../../../shared/ui/card';
import { DonutChart } from '../../../shared/ui/donut-chart';
import { WeeklyRevenueChart } from '../../../shared/ui/line-chart';
import { StatCard } from '../../../shared/ui/stat-card';
import {
  EmptyState,
  ErrorState,
  LoadingState,
} from '../../../shared/ui/states';
import { useAdminDashboard } from '../api';
import { translate, useT } from '../../../shared/i18n/catalog';
import { useLocale } from '../../../shared/i18n/locale-store';

const ACTION_LABEL_KEYS = {
  'user.banned': 'dashboard.action.userBanned',
  'user.unbanned': 'dashboard.action.userUnbanned',
  'report.resolved': 'dashboard.action.reportResolved',
  'report.dismissed': 'dashboard.action.reportDismissed',
  'video.approved': 'dashboard.action.videoApproved',
  'video.rejected': 'dashboard.action.videoRejected',
  'video.removed': 'dashboard.action.videoRemoved',
  'gift.created': 'dashboard.action.giftCreated',
  'gift.updated': 'dashboard.action.giftUpdated',
  'config.iap-product.updated': 'dashboard.action.iapUpdated',
  'config.vip-plan.updated': 'dashboard.action.vipUpdated',
  'notification.broadcast': 'dashboard.action.broadcast',
  'permission.updated': 'dashboard.action.permissionUpdated',
  'staff.role.updated': 'dashboard.action.staffRoleUpdated',
} as const;

export function DashboardPage() {
  const t = useT();
  const locale = useLocale();
  const numberFormatter = new Intl.NumberFormat(
    locale === 'vi' ? 'vi-VN' : 'en-US',
  );
  const dateFormatter = new Intl.DateTimeFormat(
    locale === 'vi' ? 'vi-VN' : 'en-US',
    {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
    },
  );
  const dashboard = useAdminDashboard();
  const rooms = useLiveRooms();
  const topRooms = rooms.data?.data.slice(0, 5) ?? [];

  if (dashboard.isPending) {
    return <LoadingState label={t('dashboard.loading')} />;
  }
  if (dashboard.error !== null) {
    return <ErrorState error={dashboard.error} />;
  }
  if (dashboard.data === undefined) {
    return <EmptyState title={t('dashboard.empty')} />;
  }

  const data = dashboard.data;
  const totalUsers =
    data.userTiers.free + data.userTiers.vip + data.userTiers.svip;
  const dailyDiamond = data.dailyDiamondSpent.map((point) => ({
    label: dateFormatter.format(new Date(`${point.date}T00:00:00Z`)),
    value: Number(point.amount),
  }));

  return (
    <section className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          icon={<UserPlus className="size-[17px]" aria-hidden />}
          label={t('dashboard.newUsers')}
          value={numberFormatter.format(data.newUsersToday)}
          trend={formatDayComparison(
            locale,
            data.newUsersToday,
            data.newUsersPreviousDay,
          )}
        />
        <StatCard
          icon={<Activity className="size-[17px]" aria-hidden />}
          label={t('dashboard.activeUsers')}
          value={numberFormatter.format(data.activeUsers)}
          trend={t('dashboard.activeUsersHint')}
        />
        <StatCard
          icon={<Gem className="size-[17px]" aria-hidden />}
          label={t('dashboard.diamondSpent')}
          value={formatDiamond(locale, data.totalDiamondSpentSevenDays)}
          trend={t('dashboard.ledgerHint')}
        />
        <StatCard
          icon={<Radio className="size-[17px]" aria-hidden />}
          label={t('dashboard.liveRooms')}
          value={numberFormatter.format(data.activeRoomCount)}
          trend={t('dashboard.roomsHint')}
        />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.9fr_1fr]">
        <Card>
          <div className="mb-3">
            <h3 className="text-[14.5px] font-extrabold">
              {t('dashboard.dailyDiamond')}
            </h3>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              {t('dashboard.totalSevenDays', {
                value: formatDiamond(locale, data.totalDiamondSpentSevenDays),
              })}
            </div>
          </div>
          <div className="mb-2 flex gap-4">
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
              <span className="inline-block h-0 w-3.5 border-t-[2.5px] border-primary" />
              {t('dashboard.recordedDiamond')}
            </span>
          </div>
          <WeeklyRevenueChart data={dailyDiamond} />
        </Card>

        <Card>
          <div className="mb-1 flex items-center justify-between gap-2.5">
            <h3 className="text-[14.5px] font-extrabold">
              {t('dashboard.liveRooms')}
            </h3>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              {t('dashboard.roomsCount', {
                count: numberFormatter.format(data.activeRoomCount),
              })}
            </span>
          </div>
          {rooms.isPending && <LoadingState />}
          {rooms.error !== null && <ErrorState error={rooms.error} />}
          {rooms.data !== undefined && topRooms.length === 0 && (
            <EmptyState title={t('dashboard.noRooms')} />
          )}
          {topRooms.map((room) => (
            <div
              key={room.id}
              className="flex items-center gap-2.5 border-b border-border py-2.5 last:border-0"
            >
              <div className="flex size-[34px] shrink-0 items-center justify-center rounded-[10px] bg-accent text-[11.5px] font-extrabold text-white">
                {room.hostUserId.slice(0, 2).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[13px] font-bold">
                  {room.title}
                </div>
                <div className="mt-0.5 text-[11.5px] font-semibold text-muted-foreground">
                  <b className="text-destructive">{t('common.live')}</b>
                </div>
              </div>
            </div>
          ))}
          <Link
            to="/rooms"
            className="mt-2.5 block w-full text-center text-xs font-bold text-primary hover:underline"
          >
            {t('dashboard.viewAll')}
          </Link>
        </Card>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <div className="mb-3">
            <h3 className="text-[14.5px] font-extrabold">
              {t('dashboard.userComposition')}
            </h3>
            <div className="text-[11.5px] text-muted-foreground">
              {t('dashboard.activePlans')}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <DonutChart
              segments={[
                {
                  value: data.userTiers.free,
                  strokeClassName: 'stroke-dimmer',
                },
                { value: data.userTiers.vip, strokeClassName: 'stroke-accent' },
                {
                  value: data.userTiers.svip,
                  strokeClassName: 'stroke-primary',
                },
              ]}
              centerValue={numberFormatter.format(totalUsers)}
              centerSub={t('dashboard.users')}
            />
            <div className="min-w-[140px] flex-1 space-y-2.5">
              <LegendRow
                name={t('dashboard.free')}
                value={tierLabel(locale, data.userTiers.free, totalUsers)}
                color="var(--dimmer)"
              />
              <LegendRow
                name="VIP"
                value={tierLabel(locale, data.userTiers.vip, totalUsers)}
                color="var(--accent)"
              />
              <LegendRow
                name="SVIP"
                value={tierLabel(locale, data.userTiers.svip, totalUsers)}
                color="var(--primary)"
              />
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-[14.5px] font-extrabold">
            {t('dashboard.activities')}
          </h3>
          {data.recentActivities.length === 0 && (
            <EmptyState title={t('dashboard.noActivities')} />
          )}
          {data.recentActivities.map((item) => (
            <div
              key={item.id}
              className="flex gap-2.5 border-b border-border py-2.5 last:border-0"
            >
              <div className="flex size-8 shrink-0 items-center justify-center rounded-[9px] border border-border bg-muted text-muted-foreground">
                <Activity className="size-[15px]" aria-hidden />
              </div>
              <div>
                <div className="text-[12.5px] font-bold">
                  {item.actorNickname}{' '}
                  {ACTION_LABEL_KEYS[
                    item.action as keyof typeof ACTION_LABEL_KEYS
                  ] !== undefined
                    ? t(
                        ACTION_LABEL_KEYS[
                          item.action as keyof typeof ACTION_LABEL_KEYS
                        ],
                      )
                    : item.action}{' '}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.targetId}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString(
                    locale === 'vi' ? 'vi-VN' : 'en-US',
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

function formatDayComparison(
  locale: 'vi' | 'en',
  current: number,
  previous: number,
): string {
  const numberFormatter = new Intl.NumberFormat(
    locale === 'vi' ? 'vi-VN' : 'en-US',
  );
  if (previous === 0) {
    return current === 0
      ? translate(locale, 'dashboard.sameAsYesterday')
      : translate(locale, 'dashboard.countComparedToYesterday', {
          value: numberFormatter.format(current),
        });
  }
  const percentage = ((current - previous) / previous) * 100;
  return translate(locale, 'dashboard.comparedToYesterday', {
    sign: percentage >= 0 ? '▲' : '▼',
    value: Math.abs(percentage).toLocaleString(
      locale === 'vi' ? 'vi-VN' : 'en-US',
      { maximumFractionDigits: 1 },
    ),
  });
}

function formatDiamond(locale: 'vi' | 'en', value: string): string {
  return `${new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(BigInt(value))} Diamond`;
}

function tierLabel(locale: 'vi' | 'en', value: number, total: number): string {
  const percentage = total === 0 ? 0 : (value / total) * 100;
  return `${new Intl.NumberFormat(locale === 'vi' ? 'vi-VN' : 'en-US').format(value)} · ${percentage.toLocaleString(locale === 'vi' ? 'vi-VN' : 'en-US', { maximumFractionDigits: 1 })}%`;
}

function LegendRow({
  color,
  name,
  value,
}: {
  color: string;
  name: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span
        className="size-[9px] shrink-0 rounded-[3px]"
        style={{ background: color }}
      />
      <span className="font-bold">{name}</span>
      <span className="ml-auto pl-2.5 font-semibold whitespace-nowrap text-muted-foreground">
        {value}
      </span>
    </div>
  );
}
