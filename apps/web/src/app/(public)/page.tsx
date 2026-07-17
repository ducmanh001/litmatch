import Link from 'next/link';

import { FeedIcon, MatchIcon, MicIcon, PartyIcon } from '../../shared/ui/icons';

import type { SVGProps } from 'react';

function GemIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M6 3h12l3 5-9 13L3 8z" />
      <path d="M3 8h18M9 3l3 5 3-5M12 8l-2 13M12 8l2 13" />
    </svg>
  );
}

const FEATURES = [
  {
    title: 'Soul Match',
    description:
      'Ghép ngẫu nhiên vào phòng chat ẩn danh 2–3 phút. Cả hai cùng "Thích" mới mở khoá hồ sơ thật.',
    Icon: MatchIcon,
    tint: 'bg-iris/10 text-irisl',
  },
  {
    title: 'Voice Match',
    description:
      'Nghe giọng nói thật qua cuộc gọi ngắn ~7 phút, trước khi quyết định kết nối tiếp.',
    Icon: MicIcon,
    tint: 'bg-aqua/10 text-aqua dark:text-aqual',
  },
  {
    title: 'Party Room',
    description:
      'Phòng voice nhiều người: lên mic, trò chuyện, tặng quà — cùng lúc với cả một nhóm lạ.',
    Icon: PartyIcon,
    tint: 'bg-iris/10 text-irisl',
  },
  {
    title: 'Feed',
    description:
      'Đăng trạng thái, ảnh, cảm xúc — kết nối với cộng đồng qua lượt thích và bình luận.',
    Icon: FeedIcon,
    tint: 'bg-aqua/10 text-aqua dark:text-aqual',
  },
  {
    title: 'Diamond & VIP',
    description:
      'Nạp Diamond, nâng cấp VIP để ưu tiên ghép nhanh và mở khoá đặc quyền riêng.',
    Icon: GemIcon,
    tint: 'bg-diamond/15 text-diamond',
  },
] as const;

const STEPS = [
  {
    title: 'Ghép ngẫu nhiên',
    description:
      'Vào hàng chờ, hệ thống ghép bạn với một người lạ ẩn danh theo bộ lọc tuổi/giới tính bạn chọn.',
  },
  {
    title: 'Trò chuyện thử',
    description:
      'Chat hoặc gọi thoại trong thời gian giới hạn — đủ để cảm nhận trước khi quyết định.',
  },
  {
    title: 'Cả hai cùng thích',
    description:
      'Nếu cả hai chọn "Thích", hồ sơ thật được mở khoá và các bạn chính thức thành bạn bè.',
  },
] as const;

const STATS = [
  { value: '200k+', label: 'lượt ghép mỗi ngày' },
  { value: '500k+', label: 'người dùng' },
  { value: '4.8/5', label: 'đánh giá người dùng' },
  { value: '63', label: 'tỉnh thành' },
] as const;

/** Landing SSR — vùng công khai duy nhất cần SEO ở V1 (docs/12 § 12.5), đúng layouts/web/index.html. */
export default function LandingPage() {
  return (
    <div className="relative">
      <div className="glow pointer-events-none absolute inset-x-0 top-0 h-[500px] overflow-hidden" />

      <section className="relative z-10 mx-auto grid max-w-6xl grid-cols-1 items-center gap-14 px-6 pb-16 pt-14 md:grid-cols-2 md:pb-24 md:pt-20">
        <div>
          <span className="mb-6 inline-block rounded-full border border-iris/20 bg-iris/10 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-irisl">
            Ra mắt 2026
          </span>
          <h1 className="font-display mb-6 text-4xl font-semibold leading-[1.12] tracking-tight md:text-6xl">
            Ẩn danh trước,
            <br />
            <em className="bg-gradient-to-br from-irisl to-aqual bg-clip-text font-medium not-italic text-transparent">
              chân thật sau.
            </em>
          </h1>
          <p className="mb-8 max-w-md text-lg leading-relaxed text-slate-600 dark:text-slate-400">
            Trò chuyện, gọi thoại, hay lên mic trong phòng voice cùng người lạ
            thú vị quanh bạn — không cần ảnh thật, không áp lực ngoại hình. Hợp
            nhau rồi mới mở khoá kết bạn thật.
          </p>
          <div className="mb-7 flex flex-wrap gap-4">
            <Link
              href="/login"
              className="rounded-full bg-irisl px-7 py-3.5 font-bold text-white shadow-xl shadow-iris/30 transition hover:-translate-y-0.5"
            >
              Bắt đầu miễn phí
            </Link>
            <a
              href="#how"
              className="rounded-full border border-black/10 px-7 py-3.5 font-bold transition hover:bg-black/5 dark:border-white/10 dark:hover:bg-white/5"
            >
              Xem cách hoạt động
            </a>
          </div>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            Hơn 200.000 lượt ghép ẩn danh diễn ra mỗi ngày.
          </p>
        </div>

        <div className="relative flex h-[420px] items-center justify-center">
          <span className="pulsering absolute h-40 w-40 rounded-full border border-iris/40" />
          <span className="pulsering2 absolute h-40 w-40 rounded-full border border-iris/40" />
          <div className="floatslow relative z-10 w-72 overflow-hidden rounded-[28px] border border-black/5 bg-white shadow-2xl shadow-black/20 dark:border-white/10 dark:bg-surf dark:shadow-black/40">
            <div className="relative flex h-60 items-center justify-center bg-gradient-to-br from-irisl to-aqual">
              <span className="font-display text-7xl text-white/90">L</span>
              <span className="absolute right-4 top-4 flex h-7 w-7 items-center justify-center rounded-full bg-white/90 text-iris">
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth={3}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3.5 w-3.5"
                >
                  <path d="m5 13 4 4L19 7" />
                </svg>
              </span>
              <span className="absolute bottom-4 left-4 flex items-center gap-1.5 rounded-full bg-black/35 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
                <MicIcon width={14} height={14} />
                Voice Match khả dụng
              </span>
            </div>
            <div className="p-5">
              <h3 className="text-lg font-bold">Linh, 26</h3>
              <p className="font-mono mt-1 text-xs text-slate-500 dark:text-slate-400">
                3 km · đang hoạt động
              </p>
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-300">
                Yêu du lịch, mê cà phê sáng sớm.
              </p>
              <div className="mt-3 flex gap-2">
                {['Du lịch', 'Cà phê', 'Indie'].map((tag) => (
                  <span
                    key={tag}
                    className="font-mono rounded-full bg-black/5 px-2.5 py-1 text-[11px] text-iris dark:bg-white/5 dark:text-irisl"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="features"
        className="relative z-10 mx-auto max-w-6xl border-t border-black/5 px-6 py-16 dark:border-white/5 md:py-20"
      >
        <div className="mb-12 max-w-xl">
          <span className="text-xs font-bold uppercase tracking-widest text-irisl">
            Tính năng
          </span>
          <h2 className="font-display mt-3 text-3xl font-semibold md:text-4xl">
            Nhiều cách để tìm đúng người
          </h2>
        </div>
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map(({ title, description, Icon, tint }) => (
            <div
              key={title}
              className="rounded-2xl border border-black/5 bg-white p-6 transition hover:border-iris/40 dark:border-white/10 dark:bg-surf dark:hover:border-irisl/40"
            >
              <div
                className={`mb-5 flex h-11 w-11 items-center justify-center rounded-xl ${tint}`}
              >
                <Icon width={20} height={20} />
              </div>
              <h3 className="mb-2 text-base font-bold">{title}</h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {description}
              </p>
            </div>
          ))}
          <div className="flex flex-col justify-center rounded-2xl bg-irisl p-6 text-white">
            <h3 className="font-display mb-2 text-lg font-semibold italic">
              Ẩn danh không có nghĩa là không an toàn.
            </h3>
            <p className="text-sm leading-relaxed text-white/85">
              Báo cáo, chặn, và bộ lọc tuổi/giới tính đi kèm mọi hình thức ghép
              đôi.
            </p>
          </div>
        </div>
      </section>

      <section
        id="how"
        className="relative z-10 mx-auto max-w-4xl border-t border-black/5 px-6 py-16 dark:border-white/5 md:py-20"
      >
        <div className="mx-auto mb-12 max-w-xl text-center">
          <span className="text-xs font-bold uppercase tracking-widest text-irisl">
            Cách hoạt động
          </span>
          <h2 className="font-display mt-3 text-3xl font-semibold md:text-4xl">
            Ba bước đơn giản
          </h2>
        </div>
        <div className="grid gap-10 md:grid-cols-3">
          {STEPS.map((step, index) => (
            <div key={step.title} className="text-center">
              <div className="font-display mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-full border border-black/5 bg-white text-lg italic text-irisl dark:border-white/10 dark:bg-surf">
                {index + 1}
              </div>
              <h3 className="mb-2 text-base font-bold">{step.title}</h3>
              <p className="text-sm leading-relaxed text-slate-500 dark:text-slate-400">
                {step.description}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 border-t border-black/5 bg-white/50 dark:border-white/5 dark:bg-surf/30">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 py-12 text-center md:grid-cols-4">
          {STATS.map((stat) => (
            <div key={stat.label}>
              <p className="font-display text-3xl font-semibold text-irisl">
                {stat.value}
              </p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {stat.label}
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="relative z-10 mx-auto max-w-4xl px-6 py-16 text-center md:py-24">
        <h2 className="font-display mb-5 text-3xl font-semibold md:text-4xl">
          Sẵn sàng ẩn danh làm quen?
        </h2>
        <p className="mb-8 text-slate-500 dark:text-slate-400">
          Miễn phí tạo hồ sơ. Không cần thẻ thanh toán.
        </p>
        <Link
          href="/login"
          className="inline-block rounded-full bg-irisl px-8 py-4 font-bold text-white shadow-xl shadow-iris/30 transition hover:-translate-y-0.5"
        >
          Đăng ký miễn phí
        </Link>
      </section>
    </div>
  );
}
