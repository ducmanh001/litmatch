// Bảo vệ tài nguyên ở 10M: admission HTTP theo pod (trả 503 sớm thay vì xếp hàng) và readiness không làm đầy pool.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-10m.mjs yêu cầu có.
const A = 'apps/core-api/src/app';
const C = 'apps/core-api/src/common';
const RI = `${C}/interceptors/request-concurrency.interceptor.ts`;
const CB = `${C}/scheduling/concurrency-budget.ts`;
const HC = `${A}/health.controller.ts`;
const RS = `${A}/readiness.service.ts`;
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '38-runtime-protection',
    short: 'Bảo vệ tài nguyên',
    title: 'Bảo vệ tài nguyên: admission HTTP và readiness',
    summary:
      'Quá tải phải trả lỗi sớm thay vì kéo dài hàng đợi: mỗi pod chỉ nhận một số request đang xử lý hữu hạn (hết chỗ thì 503 kèm Retry-After), và readiness không được tự làm đầy pool khi DB chậm. Số mặc định (4 × pool = 40 request đồng thời) là điểm khởi đầu thận trọng, chưa phải năng lực đã đo.',
    arch: 'protection',
    endpoints: [
      {
        n: '01',
        slug: 'http-request-admission',
        method: 'HTTP',
        short: 'admission HTTP',
        route: 'RequestConcurrencyInterceptor.intercept (APP_INTERCEPTOR: mọi request HTTP trừ health)',
        name: 'Admission HTTP: tối đa N request đang xử lý mỗi pod',
        title:
          'Mỗi request giữ một slot trong ngân sách của pod; hết chỗ thì trả 503 kèm Retry-After: 1 ngay, không xếp hàng; slot được nhả khi request xong, lỗi hoặc bị huỷ.',
        flow: '[CONTROLLER] → [SERVICE]',
        roles: [
          ['CONTROLLER', 'Interceptor toàn cục: bỏ qua handler gắn @SkipRequestConcurrency (health), còn lại lấy slot trước khi chạy handler và nhả slot khi Observable kết thúc.'],
          ['SERVICE', 'ConcurrencyBudget dùng chung trong process: tryAcquire không chờ và không xếp hàng; trần = HTTP_MAX_CONCURRENT_REQUESTS, hoặc 4 × DATABASE_POOL_MAX khi đặt 0.'],
        ],
        tables: [],
        related: [
          ['Readiness', 'trang 02: health và readiness được miễn admission này.'],
          ['Throttle và guard', 'rate limit, JWT và các guard chạy trước interceptor; admission này không thay thế ingress rate limit (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'intercept(context: ExecutionContext, next: CallHandler) {', text: 'Chạy cho mọi request HTTP; health được miễn' },
          { at: 'const release = this.budget.tryAcquire();', text: 'Lấy một slot của pod, không chờ' },
          { at: 'throw new ServiceUnavailableException(', text: 'Hết chỗ: 503 ngay trước khi handler chạy' },
          { at: 'return defer(() => next.handle()).pipe(finalize(release));', text: 'Chạy handler và nhả slot khi xong, lỗi hoặc bị huỷ' },
        ],
        items: [
          {
            tag: 'CONTROLLER',
            file: RI,
            dedent: true,
            ranges: [fn('intercept(')],
            inline: [
              {
                at: 'this.reflector.getAllAndOverride<boolean>(',
                text: ['Health probe được miễn (@SkipRequestConcurrency): nếu probe cũng bị từ chối khi quá tải thì kubelet sẽ đánh dấu pod không sẵn sàng và gây vòng lặp rollout đúng lúc hệ thống cần ổn định.'],
                src: 'k8s/README.md ("probe health được miễn để tránh vòng lặp rollout khi quá tải") + @SkipRequestConcurrency trên HealthController',
              },
              {
                at: 'const release = this.budget.tryAcquire();',
                text: ['Không chờ: đây là admission có trần, không phải một hàng đợi nữa. Hàng đợi ở ứng dụng chỉ che quá tải và làm mọi request chậm theo; PostgreSQL vẫn giữ giới hạn kết nối và truy vấn của riêng nó.'],
                src: 'doc RequestConcurrencyInterceptor request-concurrency.interceptor.ts ("Bounded admission, not another request queue") + k8s/README.md',
              },
              {
                at: ".setHeader('Retry-After', '1');",
                text: ['Báo cho client đây là bận tạm thời và nên thử lại sau 1 giây, thay vì để request treo trong hàng đợi.'],
                src: 'k8s/README.md ("Hết chỗ trả 503 + Retry-After: 1 trước khi chạy handler, không tạo thêm hàng chờ ứng dụng")',
              },
              {
                at: 'return defer(() => next.handle()).pipe(finalize(release));',
                text: ['finalize nhả slot khi request hoàn tất, lỗi hoặc Observable bị huỷ; defer bên trong còn nhả slot cả khi handle() ném lỗi trước khi trả về Observable.'],
                src: 'comment gốc request-concurrency.interceptor.ts ("Inner defer also releases the slot when handle() throws before returning an Observable") + k8s/README.md',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: CB,
            dedent: true,
            ranges: [fn('tryAcquire(')],
            inline: [
              {
                at: 'if (this.inFlight >= this.limit) return undefined;',
                text: ['Không chờ và không xếp hàng: caller HTTP nhận 503 khi hết chỗ, job nền thì bỏ tick và thử lại ở chu kỳ sau.'],
                src: 'doc ConcurrencyBudget concurrency-budget.ts (bản local: "HTTP caller trả 503 khi hết chỗ; job nền bỏ tick và thử lại sau")',
              },
            ],
          },
        ],
      },
      {
        n: '02',
        slug: 'get-health-ready',
        method: 'GET',
        short: '/health/ready',
        route: '/health/ready',
        name: 'Readiness: Postgres và Redis sẵn sàng nhận traffic',
        title:
          'Gộp các probe song song, cache kết quả 1 giây và chỉ giữ tối đa một SQL probe chưa xong, để kubelet thăm dò dày hoặc DB chậm không làm đầy pool.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [REDIS]',
        roles: [
          ['CONTROLLER', 'Trả 200 khi cả hai dependency up, 503 khi một trong hai down; miễn admission HTTP và throttle.'],
          ['SERVICE', 'Cache kết quả 1 giây, gộp các lượt gọi đồng thời vào một lượt kiểm tra, giới hạn mỗi probe 1 giây.'],
          ['POSTGRES', 'SELECT 1 qua pool; chỉ giữ một truy vấn chưa hoàn tất.'],
          ['REDIS', 'PING qua kết nối riêng không có hàng đợi offline và không thử lại, nên mất kết nối thì down ngay.'],
        ],
        tables: [],
        redis: [['PING', 'kết nối Redis riêng của readiness; lỗi hiện thành down trong response, không phát sự kiện lỗi chưa xử lý.']],
        related: [
          ['Admission HTTP', 'trang 01: health được miễn admission.'],
          ['Gateway readiness', 'gateway báo ready khi có ít nhất một shard Redis phục vụ (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async ready(', text: 'Endpoint readiness: 503 khi dependency chưa sẵn sàng' },
          { at: 'if (this.cached && Date.now() < this.cached.expiresAt) {', text: 'Kết quả còn mới (1 giây): dùng lại, không kiểm tra lại' },
          { at: 'if (this.inFlight) return this.inFlight;', text: 'Đã có một lượt kiểm tra đang chạy: các lời gọi đồng thời chờ chung kết quả' },
          { at: 'this.postgresProbe ??= this.dataSource', text: 'Chỉ một SQL probe chưa xong tại một thời điểm' },
          { at: 'await this.withTimeout(this.redis.ping(), PROBE_TIMEOUT_MS);', text: 'Redis PING có deadline 1 giây' },
          { at: "if (result.status !== 'ok') response.status(HttpStatus.SERVICE_UNAVAILABLE);", text: 'Ít nhất một dependency down thì trả 503 để pod bị rút khỏi Service' },
        ],
        items: [
          {
            tag: 'CONTROLLER',
            file: HC,
            dedent: true,
            ranges: [fn('async ready(')],
            inline: [
              {
                at: "if (result.status !== 'ok') response.status(HttpStatus.SERVICE_UNAVAILABLE);",
                text: ['503 để kubelet và load balancer ngừng gửi traffic vào pod này; chỉ khi cả Postgres lẫn Redis đều up pod mới được coi là ready.'],
                src: 'HealthController.ready health.controller.ts (@ApiOperation "Postgres và Redis sẵn sàng nhận traffic", @ApiResponse 503)',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: RS,
            dedent: true,
            ranges: [fn('check(): Promise<ReadinessResult> {'), fn('private async probe(')],
            inline: [
              {
                at: 'this.inFlight = this.probe()',
                text: ['Probe bỏ qua throttle chung của request nên phải tự gộp và cache cục bộ: nhiều kubelet hoặc proxy cùng thăm dò một lúc (thường chung địa chỉ IP khi số pod tăng) chỉ tạo một lượt kiểm tra, và không bị vòng lặp 429.'],
                src: 'comment gốc readiness.service.ts ("Probes bypass shared request throttling; coalesce and cache locally instead") + k8s/README.md (readiness coalesce probe theo process)',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: RS,
            dedent: true,
            ranges: [fn('private async checkPostgres(')],
            inline: [
              {
                at: 'this.postgresProbe ??= this.dataSource',
                text: ['Deadline HTTP không huỷ được SQL đang chạy: giữ lại chính truy vấn đó cho tới khi nó xong, để các probe quá hạn liên tiếp không mở thêm truy vấn và làm đầy pool kết nối.'],
                src: 'comment gốc readiness.service.ts ("The HTTP deadline does not cancel SQL. Retain the raw query until it settles")',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: RS,
            dedent: true,
            ranges: [fn('private async checkRedis('), fn('private async withTimeout<T>(')],
            inline: [
              {
                at: 'await this.withTimeout(this.redis.ping(), PROBE_TIMEOUT_MS);',
                text: ['Kết nối readiness không có hàng đợi offline và không thử lại lệnh (enableOfflineQueue: false, maxRetriesPerRequest: 0), nên khi Redis mất kết nối probe thất bại ngay và hiện thành down thay vì treo tới hết deadline.'],
                src: 'constructor ReadinessService readiness.service.ts (tuỳ chọn ioredis lazyConnect/commandTimeout/maxRetriesPerRequest/enableOfflineQueue)',
              },
            ],
          },
        ],
      },
    ],
  },
];
