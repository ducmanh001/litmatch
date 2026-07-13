import Link from 'next/link';

import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Trang chủ' };

/**
 * Placeholder vùng sau login — chat/party vào theo phase tính năng
 * (docs/12 § 12.8 bước 3), mỗi feature 1 thư mục trong features/.
 */
export default function HomePage() {
  return (
    <section className="space-y-4">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold">Chào mừng đến Litmatch</h1>
        <p className="text-muted-foreground">
          Bắt đầu bằng cách tìm người ghép đôi — chat và party room sẽ xuất hiện
          ở đây theo từng phase.
        </p>
      </div>
      <Link
        href="/matching"
        className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/90"
      >
        Tìm ghép đôi
      </Link>
    </section>
  );
}
