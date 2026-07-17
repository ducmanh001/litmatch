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

const NUMBER_FORMATTER = new Intl.NumberFormat('vi-VN');
const DATE_FORMATTER = new Intl.DateTimeFormat('vi-VN', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
});

const ACTION_LABELS: Record<string, string> = {
  'user.banned': 'đã khoá tài khoản',
  'user.unbanned': 'đã mở khoá tài khoản',
  'report.resolved': 'đã xử lý báo cáo',
  'report.dismissed': 'đã bỏ qua báo cáo',
  'video.approved': 'đã duyệt video',
  'video.rejected': 'đã từ chối video',
  'video.removed': 'đã gỡ video',
  'gift.created': 'đã tạo quà tặng',
  'gift.updated': 'đã cập nhật quà tặng',
  'config.iap-product.updated': 'đã cập nhật gói Diamond',
  'config.vip-plan.updated': 'đã cập nhật gói VIP',
  'notification.broadcast': 'đã gửi thông báo hệ thống',
  'permission.updated': 'đã cập nhật phân quyền',
  'staff.role.updated': 'đã đổi vai trò nhân sự',
};

export function DashboardPage() {
  const dashboard = useAdminDashboard();
  const rooms = useLiveRooms();
  const topRooms = rooms.data?.data.slice(0, 5) ?? [];

  if (dashboard.isPending) {
    return <LoadingState label="Đang tổng hợp dashboard…" />;
  }
  if (dashboard.error !== null) {
    return <ErrorState error={dashboard.error} />;
  }
  if (dashboard.data === undefined) {
    return <EmptyState title="Chưa có dữ liệu dashboard" />;
  }

  const data = dashboard.data;
  const totalUsers =
    data.userTiers.free + data.userTiers.vip + data.userTiers.svip;
  const dailyDiamond = data.dailyDiamondSpent.map((point) => ({
    label: DATE_FORMATTER.format(new Date(`${point.date}T00:00:00Z`)),
    value: Number(point.amount),
  }));

  return (
    <section className="space-y-3.5">
      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatCard
          icon={<UserPlus className="size-[17px]" aria-hidden />}
          label="Người dùng mới hôm nay"
          value={NUMBER_FORMATTER.format(data.newUsersToday)}
          trend={formatDayComparison(
            data.newUsersToday,
            data.newUsersPreviousDay,
          )}
        />
        <StatCard
          icon={<Activity className="size-[17px]" aria-hidden />}
          label="Tài khoản đang hoạt động"
          value={NUMBER_FORMATTER.format(data.activeUsers)}
          trend="Không bị khoá hoặc xoá"
        />
        <StatCard
          icon={<Gem className="size-[17px]" aria-hidden />}
          label="Diamond đã tiêu · 7 ngày"
          value={formatDiamond(data.totalDiamondSpentSevenDays)}
          trend="Theo ledger double-entry"
        />
        <StatCard
          icon={<Radio className="size-[17px]" aria-hidden />}
          label="Phòng Party đang live"
          value={NUMBER_FORMATTER.format(data.activeRoomCount)}
          trend="Cập nhật từ Party Room"
        />
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1.9fr_1fr]">
        <Card>
          <div className="mb-3">
            <h3 className="text-[14.5px] font-extrabold">
              Diamond đã tiêu theo ngày
            </h3>
            <div className="mt-0.5 text-[11.5px] text-muted-foreground">
              Tổng 7 ngày: {formatDiamond(data.totalDiamondSpentSevenDays)}
            </div>
          </div>
          <div className="mb-2 flex gap-4">
            <span className="flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
              <span className="inline-block h-0 w-3.5 border-t-[2.5px] border-primary" />
              Diamond đã ghi nhận
            </span>
          </div>
          <WeeklyRevenueChart data={dailyDiamond} />
        </Card>

        <Card>
          <div className="mb-1 flex items-center justify-between gap-2.5">
            <h3 className="text-[14.5px] font-extrabold">Phòng đang live</h3>
            <span className="text-[11.5px] font-semibold text-muted-foreground">
              {NUMBER_FORMATTER.format(data.activeRoomCount)} phòng
            </span>
          </div>
          {rooms.isPending && <LoadingState />}
          {rooms.error !== null && <ErrorState error={rooms.error} />}
          {rooms.data !== undefined && topRooms.length === 0 && (
            <EmptyState title="Không có phòng nào đang hoạt động" />
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
                  <b className="text-destructive">LIVE</b>
                </div>
              </div>
            </div>
          ))}
          <Link
            to="/rooms"
            className="mt-2.5 block w-full text-center text-xs font-bold text-primary hover:underline"
          >
            Xem tất cả →
          </Link>
        </Card>
      </div>

      <div className="grid gap-3.5 lg:grid-cols-[1fr_1.3fr]">
        <Card>
          <div className="mb-3">
            <h3 className="text-[14.5px] font-extrabold">Cơ cấu người dùng</h3>
            <div className="text-[11.5px] text-muted-foreground">
              Theo gói đang hiệu lực
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
              centerValue={NUMBER_FORMATTER.format(totalUsers)}
              centerSub="Người dùng"
            />
            <div className="min-w-[140px] flex-1 space-y-2.5">
              <LegendRow
                name="Miễn phí"
                value={tierLabel(data.userTiers.free, totalUsers)}
                color="var(--dimmer)"
              />
              <LegendRow
                name="VIP"
                value={tierLabel(data.userTiers.vip, totalUsers)}
                color="var(--accent)"
              />
              <LegendRow
                name="SVIP"
                value={tierLabel(data.userTiers.svip, totalUsers)}
                color="var(--primary)"
              />
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="mb-3 text-[14.5px] font-extrabold">
            Hoạt động quản trị
          </h3>
          {data.recentActivities.length === 0 && (
            <EmptyState title="Chưa có hoạt động quản trị" />
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
                  {ACTION_LABELS[item.action] ?? item.action}{' '}
                  <span className="font-mono text-[11px] text-muted-foreground">
                    {item.targetId}
                  </span>
                </div>
                <div className="mt-0.5 text-[11px] font-semibold text-muted-foreground">
                  {new Date(item.createdAt).toLocaleString('vi-VN')}
                </div>
              </div>
            </div>
          ))}
        </Card>
      </div>
    </section>
  );
}

function formatDayComparison(current: number, previous: number): string {
  if (previous === 0) {
    return current === 0
      ? 'Bằng ngày hôm qua'
      : `+${NUMBER_FORMATTER.format(current)} so với hôm qua`;
  }
  const percentage = ((current - previous) / previous) * 100;
  return `${percentage >= 0 ? '▲' : '▼'} ${Math.abs(percentage).toLocaleString('vi-VN', { maximumFractionDigits: 1 })}% so với hôm qua`;
}

function formatDiamond(value: string): string {
  return `${NUMBER_FORMATTER.format(BigInt(value))} Diamond`;
}

function tierLabel(value: number, total: number): string {
  const percentage = total === 0 ? 0 : (value / total) * 100;
  return `${NUMBER_FORMATTER.format(value)} · ${percentage.toLocaleString('vi-VN', { maximumFractionDigits: 1 })}%`;
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
