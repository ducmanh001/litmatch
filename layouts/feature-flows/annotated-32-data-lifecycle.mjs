// Vòng đời dữ liệu ở 10M: bảng nào tăng theo hoạt động thì phải có người xoá, và việc xoá không được tranh kết nối với request.
// Một tick retention đi qua: lịch (cluster-singleton + ngân sách đồng thời) → quy tắc của module → xoá theo lô → metric.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-annotated.mjs yêu cầu có.
const C = 'apps/core-api/src/common';
const RJ = `${C}/retention/retention-job.ts`;
const BP = `${C}/retention/batched-purge.ts`;
const RM = `${C}/retention/retention-metrics.ts`;
const MI = `${C}/scheduling/managed-interval.ts`;
const CB = `${C}/scheduling/concurrency-budget.ts`;
const BA = `${C}/scheduling/background-database-admission.ts`;
const AR = 'apps/core-api/src/modules/auth/jobs/auth-retention.job.ts';
const SW = 'apps/core-api/src/modules/feed/jobs/story-sweeper.service.ts';
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const top = (anchor) => ({ at: anchor, to: '^}' });

export const annotatedFeatures = [
  {
    id: '32-data-lifecycle',
    short: 'Vòng đời dữ liệu',
    title: 'Vòng đời dữ liệu: xoá theo lô mà không tranh kết nối',
    summary:
      'Ở 10 triệu đồng thời, bảng refresh_tokens nhận ≈ 290 triệu hàng/ngày (mô hình ADR 0014). Nếu không ai xoá, bảng không bao giờ ổn định; nếu xoá bằng một lệnh lớn, nó chiếm khoá và kết nối của request. Các trang này là cách xoá đều đặn, có trần, có công tắc an toàn.',
    arch: 'data-lifecycle',
    endpoints: [
      {
        n: '01',
        slug: 'job-retention-tick',
        method: 'JOB',
        short: 'retention tick',
        route: 'RetentionJob.runOnce (mỗi RETENTION_INTERVAL_MS, một pod duy nhất)',
        name: 'Một tick retention',
        title:
          'Xếp hàng admission theo DataSource (chờ mà không giữ kết nối), chạy dưới ngân sách đồng thời và khoá cluster-singleton, lấy quy tắc của module, xoá theo lô bằng câu lệnh ngắn tự commit, ghi metric.',
        flow: '[WORKER] → [POSTGRES]',
        roles: [
          ['WORKER', 'Lên lịch tick: xếp hàng admission FIFO theo DataSource (người chờ không giữ kết nối), bỏ tick nếu hết ngân sách đồng thời, giữ khoá cluster-singleton, xoay vòng các quy tắc, dừng ở trần thời gian 30 giây hoặc khi shutdown.'],
          ['POSTGRES', 'Mỗi lô là MỘT câu lệnh ngắn: chọn hàng đủ điều kiện FOR UPDATE SKIP LOCKED rồi xoá, tự commit; không giữ transaction hay khoá hàng lâu.'],
        ],
        tables: [
          ['refresh_tokens', 'ví dụ quy tắc: xoá token hết hạn quá AUTH_REFRESH_RETENTION_GRACE_DAYS (theo expires_at). Bảng này nhận ≈ 290 triệu hàng/ngày ở quy mô đề bài.'],
          ['phone_otps', 'quy tắc thứ hai của cùng job: OTP cũ hơn AUTH_OTP_RETENTION_DAYS.'],
        ],
        related: [
          ['Các job retention khác', 'matching quota, outbox, video_views, bình luận video xoá mềm, mood: cùng khung, mỗi module khai báo quy tắc của mình (không chép).'],
          ['Bảng sổ cái', 'transactions, ledger_entries, wallets… bị chặn cấu trúc: khung từ chối dựng SQL xoá cho chúng.'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<PurgeResult[]> {', text: 'Một tick retention; không chạy chồng nhau trong cùng process' },
          { at: 'const steps = this.steps();', text: 'Lấy các quy tắc của module (module sở hữu bảng tự khai báo SQL của nó)' },
          { at: 'const start = steps.length === 0 ? 0 : this.rotation % steps.length;', text: 'Xoay vòng quy tắc đầu tiên để một backlog lớn không bỏ đói các quy tắc sau' },
          { at: 'const result = await purgeInBatches(this.dataSource, step, {', text: 'Xoá theo lô cho một quy tắc, có trần thời gian và dừng khi shutdown' },
          { at: 'const [row] = (await dataSource.query(sql, [', text: 'Chọn lô rồi xoá trong MỘT câu lệnh (FOR UPDATE SKIP LOCKED)' },
          { at: 'assertDeletable(step.table);', text: 'Chốt chặn cấu trúc: không bao giờ xoá bảng sổ cái, ví, chứng từ' },
          { at: 'recordRetention(this.meter, result);', text: 'Ghi metric: dry-run chỉ ghi gauge số hàng đủ điều kiện, delete ghi counter số hàng đã xoá' },
          { at: 'predicate: ', in: 'AuthRetentionJob', text: 'Quy tắc của module: điều kiện, thứ tự xoá và tham số (SQL tĩnh, không nội suy input)' },
          { at: 'const admission = acquireBackgroundDatabaseAdmission(', text: 'Admission FIFO theo DataSource: đợi lượt mà KHÔNG giữ kết nối pool (làn thường và làn riêng cho calling timer)' },
          { at: 'const release = databaseAdmission.budget?.tryAcquire();', text: 'Ngân sách đồng thời dùng chung: hết chỗ thì BỎ tick trước khi lấy kết nối pool' },
          { at: 'const rows = (await runner.query(', text: 'Chỉ một pod chạy mỗi tick: advisory lock theo transaction, tự nhả khi kết nối đóng kể cả pod chết' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: RJ,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'const deadlineAt =',
                text: ['Mỗi tick bị chặn ở tối đa 30 giây (và không quá chu kỳ): cluster-singleton giữ một transaction + một kết nối pool suốt tick nên tick không được kéo dài vô hạn. Hết ngân sách thì dừng ở ranh giới lô, backlog còn lại để tick sau.'],
                src: 'doc RETENTION_TICK_BUDGET_MS retention-job.ts',
              },
              {
                at: 'const start = steps.length === 0 ? 0 : this.rotation % steps.length;',
                text: ['Xoay vòng điểm bắt đầu: nếu quy tắc đầu luôn có backlog lớn thì các quy tắc sau không bao giờ tới lượt.'],
                src: 'doc field rotation retention-job.ts',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: AR,
            dedent: true,
            ranges: [fn('protected steps(')],
            inline: [
              {
                at: "predicate: 'expires_at < now() - make_interval(days => $2)',",
                text: ['Theo expires_at (không theo created_at): đổi AUTH_REFRESH_TTL_DAYS không làm xoá nhầm token còn hạn. ORDER BY cùng cột để mỗi lô lấy hàng cũ nhất, khớp index B-tree idx_refresh_tokens_expires_at (B-tree thay BRIN: BRIN mất chọn lọc khi bảng bị xoá rồi chèn lại, ≈ 430–540 ms so với ≈ 0,6 ms mỗi lô sau 4 vòng xoá-rồi-chèn-lại, đo lab).'],
                src: 'ADR 0014 mục 3 + comment migration 1758800000000-lifecycle-btree-indexes.ts',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: BP,
            dedent: true,
            ranges: [top('export async function purgeInBatches(')],
            inline: [
              {
                at: 'const [row] = (await dataSource.query(sql, [',
                text: ['Mỗi lô là một câu lệnh ngắn tự commit: không giữ transaction dài và không giữ khoá hàng lâu. Dừng khi hết hàng hoặc chạm maxBatches; phần còn lại để tick sau.'],
                src: 'doc purgeInBatches batched-purge.ts',
              },
              {
                at: 'if (options.pauseMs > 0 && batches < options.maxBatches) {',
                text: ['Nghỉ giữa các lô để vacuum và replica theo kịp.'],
                src: 'doc PurgeOptions.pauseMs batched-purge.ts',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: BP,
            dedent: true,
            ranges: [top('export function buildDeleteSql(')],
            inline: [
              {
                at: "const keyColumns =",
                text: ['ctid chỉ định danh hàng trong MỘT bảng con: với bảng phân vùng phải kèm tableoid, nếu không `t.ctid = d.ctid` khớp cả hàng cùng ctid ở partition khác và xoá nhầm.'],
                src: 'comment gốc batched-purge.ts (buildDeleteSql)',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: BP,
            dedent: true,
            ranges: [top('function assertDeletable(')],
            inline: [
              {
                at: 'const protectedName = [...PROTECTED_TABLES].find(',
                text: ['Khớp cả bảng con phân vùng (transactions_2026_01): ADR 0014 dự kiến phân vùng theo tháng cho chính các bảng này. Tiền tố `<tên>_` có thể chặn nhầm một bảng khác tên giống: hướng lỗi an toàn (từ chối), thấy ngay lúc dựng SQL.'],
                src: 'comment gốc batched-purge.ts (assertDeletable)',
              },
            ],
          },
          { tag: 'WORKER', file: RM, dedent: true, ranges: [top('export function recordRetention(')] },
          {
            tag: 'WORKER',
            file: MI,
            dedent: true,
            ranges: [fn('private async runScheduled(')],
            inline: [
              {
                at: 'const admission = acquireBackgroundDatabaseAdmission(',
                text: ['Chờ lượt TRƯỚC khi mở bất kỳ kết nối nào: hàng đợi FIFO theo DataSource, người chờ không giữ kết nối pool nên nhiều job nền cùng đến hạn không chiếm hết pool của request. Mỗi job chỉ có một người chờ vì scheduledRunInFlight chặn tick chồng.'],
                src: 'doc AdmissionLane + doc acquireBackgroundDatabaseAdmission (background-database-admission.ts), cờ scheduledRunInFlight (managed-interval.ts)',
              },
              {
                at: 'if (releaseAdmission === undefined || generation !== this.generation)',
                text: ['stop() phải phủ cả khoảng vi tác vụ giữa lúc được cấp lượt và lúc mở runner: kiểm lại thế hệ rồi mới làm tiếp, nếu không một job đã dừng vẫn chạy thêm một tick.'],
                src: 'comment gốc managed-interval.ts ("stop() also covers the microtask between granting admission and opening the runner")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: BA,
            dedent: true,
            ranges: [top('export function acquireBackgroundDatabaseAdmission(')],
            inline: [
              {
                at: 'const jobCost =',
                text: ['Mỗi slot của làn thường được tính là một lượt claim cộng bằng đó worker song song (pool/4): pool 5 có 1 slot, pool 10 có 2 slot. Phần còn lại của pool là một kết nối dành cho HTTP và hai cho calling timer.'],
                src: 'doc acquireBackgroundDatabaseAdmission + hằng HTTP_RESERVED_CONNECTIONS/CRITICAL_RESERVED_CONNECTIONS/WORKER_POOL_FRACTION (background-database-admission.ts); docs/services/calling-service.md',
              },
              {
                at: 'critical: new AdmissionLane(1),',
                text: ['Calling timer đi làn riêng chỉ có một slot: cleanup/SFU chậm của các job thường không chặn được timer kết thúc cuộc gọi.'],
                src: 'ClusterSingletonOptions.priority "critical" (managed-interval.ts) + docs/services/calling-service.md (lane critical riêng)',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: BA,
            dedent: true,
            ranges: [fn('acquire(): Admission {'), fn('private permit(): Release {')],
            inline: [
              {
                at: 'this.pending.push(resolve);',
                text: ['Hết slot thì chỉ xếp một hàm resolve vào hàng đợi: không có kết nối hay timer nào bị giữ trong lúc chờ, và cancel() gỡ đúng người chờ đó (stop() huỷ được).'],
                src: 'doc AdmissionLane ("FIFO waiters hold no connection") + cancel() trong acquire (background-database-admission.ts)',
              },
              {
                at: 'if (next !== undefined) next(this.permit());',
                text: ['Nhả slot thì trao ngay cho người chờ lâu nhất: thứ tự FIFO nên không job nào bị bỏ đói.'],
                src: 'permit() background-database-admission.ts',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: CB,
            dedent: true,
            ranges: [fn('tryAcquire(')],
            inline: [
              {
                at: 'if (this.inFlight >= this.limit) return undefined;',
                text: ['Không chờ và không xếp hàng: hết ngân sách thì job nền bỏ tick và thử lại ở chu kỳ sau (caller HTTP thì trả 503). Job cluster-singleton còn giữ một kết nối cho advisory lock nên ngân sách của job phải dành chỗ cho cả lock lẫn task; RETENTION_MAX_CONCURRENT_JOBS giới hạn số tick retention chạy cùng lúc trong process.'],
                src: 'doc ConcurrencyBudget concurrency-budget.ts (bản local) + doc retentionBudget retention-job.ts',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: MI,
            dedent: true,
            ranges: [fn('private async runClusterSingleton(')],
            inline: [
              {
                at: 'this.clusterRetryAfter = Date.now() + retryMs;',
                text: ['DB hỏng không được làm mọi replica thử giành khoá ở mỗi tick ngắn: nhớ thời điểm được phép thử lại.'],
                src: 'comment gốc managed-interval.ts ("A broken DB should not make every replica retry…")',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: BP,
            dedent: true,
            ranges: [{ at: 'const PROTECTED_TABLES: ReadonlySet<string> = new Set([', to: '^\\]\\);$' }],
          },
        ],
      },
      {
        n: '02',
        slug: 'job-story-sweeper-tick',
        method: 'JOB',
        short: 'story sweeper',
        route: 'StorySweeperService.runOnce (mỗi STORY_SWEEPER_INTERVAL_MS)',
        name: 'Story sweeper: xoá story hết hạn cùng lượt xem',
        title:
          'Xoá story hết hạn theo lô 500; story_views tự xoá theo FK ON DELETE CASCADE; tick lặp lô tới hết backlog hoặc hết ngân sách 30 giây.',
        flow: '[WORKER] → [POSTGRES]',
        roles: [
          ['WORKER', 'Lặp lô tới hết backlog hoặc hết ngân sách thời gian, nghỉ giữa các lô, dừng khi shutdown, log khi còn backlog.'],
          ['POSTGRES', 'DELETE ... WHERE id IN (SELECT ... ORDER BY expires_at LIMIT 500): mỗi story kéo theo hàng trăm story_views xoá cascade.'],
        ],
        tables: [
          ['stories', 'story hết hạn sau 24 giờ; đọc/ring đã tự lọc expires_at nên job này chỉ dọn rác.'],
          ['story_views', 'xoá cascade theo story; ở mô hình là ≈ 96 triệu hàng/ngày.'],
        ],
        related: [
          ['Khung retention', 'sweeper KHÔNG chịu RETENTION_*: lô (500), ngân sách (30 giây) và nghỉ (50 ms) là hằng số trong mã; chỉ STORY_SWEEPER_INTERVAL_MS điều chỉnh được.'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<number> {', text: 'Một tick: lặp lô tới hết backlog hoặc hết ngân sách thời gian' },
          { at: 'const deadline = Date.now() + STORY_SWEEP_TICK_BUDGET_MS;', text: 'Trần thời gian của tick (30 giây)' },
          { at: 'const [row] = (await this.dataSource.query(', text: 'Xoá một lô story hết hạn cũ nhất (story_views xoá cascade theo FK)' },
          { at: 'if (!capped || this.stopping || Date.now() >= deadline) break;', text: 'Hết backlog, shutdown hoặc hết ngân sách thì dừng' },
          { at: 'await sleep(STORY_SWEEP_PAUSE_MS);', text: 'Nghỉ giữa các lô để vacuum và replica theo kịp' },
          { at: 'if (total > 0) {', text: 'Log số story đã xoá và cờ "còn backlog"' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: SW,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'const [row] = (await this.dataSource.query(',
                text: [
                  '[POSTGRES] Mỗi story kéo theo hàng trăm story_views xoá cascade nên lô giữ ở 500 story để mỗi câu DELETE ngắn. Trước đây mỗi tick chỉ xoá ĐÚNG 1 lô (cứng 500 story/giờ): tạo story nhanh hơn mức đó thì backlog tăng vô hạn.',
                  'Đo lab (12.000 story × 100 lượt xem, hàng xen kẽ, dữ liệu trong cache): một lô p50 ≈ 88 ms. Chu kỳ mặc định 1 giờ chỉ đủ nếu một lô ≤ ~325 ms ở quy mô đề bài; ở đĩa chậm hơn lab 10 lần cần hạ STORY_SWEEPER_INTERVAL_MS xuống ≈ 24 phút.',
                ],
                src: 'comment gốc story-sweeper.service.ts + ADR 0014 mục 5 + scripts/capacity/bench/story-sweeper.mjs',
              },
              {
                at: 'if (!capped || this.stopping || Date.now() >= deadline) break;',
                text: ['Shutdown: lô đang chạy xong rồi dừng, không bắt đầu lô mới — SIGTERM không phải chờ hết ngân sách 30 giây.'],
                src: 'comment gốc story-sweeper.service.ts (onApplicationShutdown)',
              },
            ],
          },
        ],
      },
    ],
  },
];
