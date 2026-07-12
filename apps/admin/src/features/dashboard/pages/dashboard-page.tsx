import { Card } from '../../../shared/ui/card';

/**
 * Placeholder tổng quan — feature thật (users, moderation, economy ops, gift catalog)
 * vào theo từng phase sau khi backend có role admin (docs/12 § 12.7 Task 0).
 */
export function DashboardPage() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Tổng quan</h1>
      <Card>
        <p className="text-muted-foreground">
          Khung core/base đã sẵn sàng. Các màn quản trị sẽ được triển khai theo
          từng phase — xem apps/admin/AGENTS.md.
        </p>
      </Card>
    </section>
  );
}
