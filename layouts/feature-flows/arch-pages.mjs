// Danh sách trang kiến trúc 10M (dùng chung cho engine-10m.mjs và arch-10m.mjs): slug → tiêu đề.
// Mỗi tính năng trong annotated-*.mjs khai `arch: '<slug>'` để trang code có nút "Kiến trúc" và tổng quan có cột kiến trúc.
export const ARCH_PAGES = [
  {
    slug: 'realtime-gateway',
    title: 'Realtime gateway: admission, quota, fanout, ngân sách gửi',
  },
  {
    slug: 'matching',
    title: 'Matching: hàng đợi Redis chia shard, matcher, repair, speed-up',
  },
  {
    slug: 'calling-recovery',
    title: 'Calling: worker có lease, reconnect grace, cleanup bền vững',
  },
  {
    slug: 'data-lifecycle',
    title: 'Vòng đời dữ liệu: retention, sweeper, admission cho job nền',
  },
  {
    slug: 'ledger-integrity',
    title: 'Sổ cái: đối soát phân trang, checkpoint, outbox relay',
  },
  {
    slug: 'batch-jobs',
    title: 'Việc nền theo lô: broadcast, xếp hạng video, bộ đệm đếm',
  },
  {
    slug: 'hot-paths',
    title: 'Đường nóng trong Postgres: khoá, một kết nối, SKIP LOCKED',
  },
  {
    slug: 'protection',
    title: 'Bảo vệ tài nguyên: admission HTTP, timeout, readiness, HPA/PDB',
  },
];
export const archTitle = (slug) =>
  ARCH_PAGES.find((a) => a.slug === slug)?.title ?? slug;
