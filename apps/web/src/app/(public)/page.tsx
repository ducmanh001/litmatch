import Link from 'next/link';

const FEATURES = [
  {
    title: 'Ghép đôi ẩn danh',
    description:
      'Soul Match ghép bạn với người lạ hợp gu — danh tính chỉ mở khi cả hai cùng thích.',
  },
  {
    title: 'Voice call 1-1',
    description:
      'Trò chuyện bằng giọng nói chất lượng cao ngay sau khi ghép đôi thành công.',
  },
  {
    title: 'Party Room',
    description:
      'Phòng voice nhiều người: lên ghế speaker, tặng quà, kết bạn cùng cộng đồng.',
  },
] as const;

/** Landing SSR — vùng công khai duy nhất cần SEO ở V1 (docs/12 § 12.5). */
export default function LandingPage() {
  return (
    <main>
      <section className="mx-auto flex w-full max-w-5xl flex-col items-center gap-6 px-4 py-24 text-center">
        <h1 className="max-w-2xl text-4xl font-bold tracking-tight sm:text-5xl">
          Kết nối bằng giọng nói, bắt đầu từ một cuộc trò chuyện
        </h1>
        <p className="max-w-xl text-lg text-muted-foreground">
          Ghép đôi ẩn danh, voice call và party room — tìm người hợp gu mà không
          cần swipe.
        </p>
        <Link
          href="/login"
          className="rounded-md bg-primary px-6 py-3 font-medium text-primary-foreground hover:bg-primary/90"
        >
          Bắt đầu miễn phí
        </Link>
      </section>
      <section className="mx-auto grid w-full max-w-5xl gap-6 px-4 pb-24 sm:grid-cols-3">
        {FEATURES.map((feature) => (
          <article
            key={feature.title}
            className="rounded-md border border-border p-6"
          >
            <h2 className="font-semibold">{feature.title}</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {feature.description}
            </p>
          </article>
        ))}
      </section>
    </main>
  );
}
