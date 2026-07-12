import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Trang chủ' };

/**
 * Placeholder vùng sau login — matching/chat/party vào theo phase tính năng
 * (docs/12 § 12.8 bước 3), mỗi feature 1 thư mục trong features/.
 */
export default function HomePage() {
  return (
    <section className="space-y-2">
      <h1 className="text-2xl font-semibold">Chào mừng đến Litmatch</h1>
      <p className="text-muted-foreground">
        Khung core/base đã sẵn sàng — matching, chat và party room sẽ xuất hiện
        ở đây theo từng phase.
      </p>
    </section>
  );
}
