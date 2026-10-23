// Catalog "luồng + code thật". Mỗi snippet trỏ file + anchor (chuỗi con của dòng) — render đọc lại từ repo,
// anchor không còn khớp thì render fail (code đổi → ảnh không âm thầm sai). `hl` = dòng chứa chuỗi đó sẽ tô vàng.
const AV = 'apps/core-api/src/modules/avatar';
const CA = 'apps/core-api/src';
const LEDGER = 'apps/core-api/src/modules/economy/services/ledger.service.ts';
const MIG = 'apps/core-api/src/database/migrations/1753100000000-avatar.ts';

export const codeFlows = [
  {
    id: '08-avatar-tuy-chinh-buy',
    eyebrow: 'Litmatch · Avatar tùy chỉnh · đi theo code',
    title: 'POST /api/v1/avatar/items/:assetId/buy',
    subtitle:
      'Mua một item avatar trả phí: từ nút bấm trên web, qua từng lớp của NestJS, tới Postgres, Redis và Kafka. Các endpoint còn lại của Avatar xem bảng cuối trang.',
    rail: [
      { label: 'Client', layer: 'client', steps: '1–3' },
      { label: 'Middleware', layer: 'http', steps: '4' },
      { label: 'Guards', layer: 'guard', steps: '5–6' },
      { label: 'Interceptor (trước)', layer: 'interceptor', steps: '7' },
      { label: 'Pipes', layer: 'pipe', steps: '8' },
      { label: 'Controller', layer: 'controller', steps: '9' },
      { label: 'Service', layer: 'service', steps: '10, 12–13, 16' },
      { label: 'Repository', layer: 'repo', steps: '11' },
      { label: 'PostgreSQL', layer: 'db', steps: '11, 14–16' },
      { label: 'Redis', layer: 'redis', steps: '5' },
      { label: 'Outbox → Kafka', layer: 'kafka', steps: '15, 17' },
      { label: 'Interceptor (sau)', layer: 'interceptor', steps: '18' },
      { label: 'Exception Filter', layer: 'error', steps: '19' },
    ],
    parts: [
      {
        title: 'Từ trình duyệt đến cổng vào của Nest',
        steps: [
          {
            layers: ['client'],
            title: 'React: user bấm Mua',
            when: 'Sau khi user xác nhận hộp thoại',
            bullets: [
              '`useIdempotencyKey()` sinh 1 UUID cho MỘT ý định mua. Retry vẫn dùng key đó; chỉ `resetKey()` sau khi mua xong.',
              'Giá hiện trên UI chỉ để user xem. Server tự đọc lại giá từ DB, client không gửi giá.',
            ],
            snippets: [
              {
                file: 'apps/web/src/features/avatar/components/avatar-builder.tsx',
                ranges: [
                  'const { key, resetKey } = useIdempotencyKey();',
                  { at: 'const confirmed = await confirmAction', to: '{ assetId: item.id, idempotencyKey: key },' },
                ],
                hl: ['idempotencyKey', 'confirmAction'],
              },
            ],
          },
          {
            layers: ['client'],
            title: 'TanStack Query mutation → openapi-fetch',
            when: 'Hook `useBuyAvatarItem` gọi client REST duy nhất của app',
            bullets: [
              'Kiểu `ApiSchema<…>` và đường dẫn `/api/v1/avatar/items/{assetId}/buy` đều sinh từ OpenAPI của core-api (libs/api-client).',
              '`Idempotency-Key` đi trong header; `assetId` đi trong path.',
              'Thành công thì làm mới danh sách item và số dư ví.',
            ],
            snippets: [
              {
                file: 'apps/web/src/features/avatar/api.ts',
                ranges: [{ at: 'export function useBuyAvatarItem', to: '^}', pad: [1, 0] }],
                hl: ["'Idempotency-Key'", 'apiClient.POST', 'invalidateQueries'],
              },
            ],
          },
          {
            layers: ['client'],
            title: 'Middleware của api-client gắn Bearer + cookie',
            when: 'Mọi request đi qua `onRequest` trước khi gọi fetch',
            bullets: [
              '`Authorization: Bearer <access token>` lấy từ token store; refresh token là cookie httpOnly nên cần `credentials: include`.',
              '`Accept-Language` để server trả lỗi đúng ngôn ngữ (bước 19).',
            ],
            snippets: [
              {
                file: 'libs/api-client/src/lib/client.ts',
                ranges: [
                  { at: 'const authMiddleware: Middleware', to: 'retryClones.set(request, request.clone());', pad: [0, 1] },
                  { at: 'const client = createClient<paths>', to: "credentials: 'include',", pad: [0, 1] },
                ],
                hl: ["'authorization'", "'accept-language'", "credentials: 'include'"],
              },
            ],
            arrow: 'POST /api/v1/avatar/items/{assetId}/buy · Authorization: Bearer … · Idempotency-Key · Accept-Language · cookie',
          },
          {
            layers: ['http'],
            title: 'Middleware Express chạy trước mọi guard',
            when: 'Nest `bootstrap()` trong main.ts; lúc này chưa biết route nào, chưa biết user là ai',
            bullets: [
              'Body parser đọc JSON; global prefix `/api/v1` nối vào đường dẫn của controller.',
              '`helmet` đặt header bảo mật, `cookie-parser` đọc cookie, middleware metrics đo thời gian request, CORS chỉ cho origin trong whitelist.',
              '`pino-http` gắn `req.id` (lấy `x-request-id` hoặc sinh UUID). Về sau filter trả đúng id này làm `traceId` (bước 19).',
            ],
            snippets: [
              {
                file: `${CA}/main.ts`,
                ranges: [
                  { at: "app.useBodyParser('json'); //", lines: 1 },
                  { at: 'app.setGlobalPrefix(API_GLOBAL_PREFIX', to: 'exclude: API_PREFIX_EXCLUDES', pad: [0, 1] },
                  { at: 'app.use(helmet());', to: 'app.use(createHttpMetricsMiddleware' },
                  { at: 'app.enableCors({', to: '^  }\\);' },
                ],
                hl: ['helmet', 'cookieParser', 'createHttpMetricsMiddleware', 'setGlobalPrefix', 'enableCors'],
              },
              {
                file: 'libs/logger/src/lib/build-logger-options.ts',
                ranges: [{ at: 'genReqId:', to: '^    },' }],
                hl: ['x-request-id', 'randomUUID'],
              },
            ],
          },
        ],
      },
      {
        title: 'Guard → Interceptor → Pipe → Controller',
        steps: [
          {
            layers: ['guard', 'redis'],
            title: 'ThrottlerGuard: rate limit, bộ đếm nằm trong Redis',
            when: 'Guard global đầu tiên; thứ tự `APP_GUARD` là thứ tự chạy',
            bullets: [
              'Ba guard global chạy lần lượt: Throttler → JWT → Roles. Interceptor và Filter cũng được đăng ký ở đây.',
              '`THROTTLE_STORAGE=redis` thì bộ đếm dùng chung mọi pod qua một script Lua (INCR + khóa tạm khi vượt hạn mức).',
              'Redis lỗi thì pod tự đếm in-memory, request không fail (xem chú thích của `RedisThrottlerStorage`).',
            ],
            snippets: [
              {
                file: `${CA}/app/app.module.ts`,
                ranges: [
                  { at: 'Nhiều replica: hạn mức phải dùng chung qua Redis', to: ': {}),' },
                  { at: '{ provide: APP_GUARD, useClass: ThrottlerGuard }', to: 'APP_FILTER' },
                ],
                hl: ['RedisThrottlerStorage', 'APP_GUARD', 'APP_INTERCEPTOR', 'APP_FILTER'],
              },
              {
                file: `${CA}/common/throttle/redis-throttler-storage.ts`,
                lang: 'lua',
                ranges: [{ at: 'local blockTtl = redis.call', to: 'return { hits, ttl, 0, 0 }' }],
                hl: ["redis.call('INCR'", "redis.call('SET'"],
                label: 'Lua chạy trong Redis',
              },
            ],
          },
          {
            layers: ['guard'],
            title: 'JwtAuthGuard + RolesGuard: ai đang gọi?',
            when: 'Route không có `@Public()` nên bắt buộc có Bearer JWT',
            bullets: [
              'Verify chữ ký (hỗ trợ xoay `JWT_SECRET`) rồi gắn `req.user = { userId, isGuest, role }`; `@CurrentUser()` ở controller đọc lại giá trị này.',
              'Access token là stateless, guard không query DB mỗi request (trạng thái banned được kiểm ở refresh/login).',
              '`buy` không khai `@RequireRoles()` nên RolesGuard cho qua. Thiếu/sai token thì ném 401 (bước 19).',
            ],
            snippets: [
              {
                file: `${CA}/common/guards/jwt-auth.guard.ts`,
                ranges: [{ at: 'async canActivate', to: '^  }$' }],
                hl: ['IS_PUBLIC_KEY', "'Bearer '", 'req.user =', 'UnauthorizedException'],
              },
              {
                file: `${CA}/common/guards/roles.guard.ts`,
                ranges: [{ at: 'canActivate(context: ExecutionContext): boolean {', to: 'if (requiredRoles === undefined) return true;' }],
                hl: ['requiredRoles === undefined'],
              },
            ],
          },
          {
            layers: ['interceptor'],
            title: 'Interceptor (nửa trước): bọc quanh handler',
            when: 'Sau guard, TRƯỚC pipe và controller',
            bullets: [
              'Code đứng trước `next.handle()` chạy trước controller; code trong `.pipe(map(…))` chạy SAU controller (bước 18).',
              '`ClassSerializerInterceptor` serialize object trả về (xử lý `@Exclude/@Expose`).',
            ],
            snippets: [
              {
                file: `${CA}/common/interceptors/response-envelope.interceptor.ts`,
                ranges: [{ at: 'intercept(', to: 'return next.handle().pipe(' }],
                hl: ['markRuntimeActivity', 'next.handle()'],
              },
              {
                file: `${CA}/main.ts`,
                ranges: [{ at: 'app.useGlobalInterceptors(', lines: 1 }],
                hl: ['ClassSerializerInterceptor'],
              },
            ],
          },
          {
            layers: ['pipe'],
            title: 'Pipe + param decorator: kiểm tra đầu vào',
            when: 'Ngay trước khi gọi handler',
            bullets: [
              '`ValidationPipe` toàn cục: `whitelist` + `forbidNonWhitelisted` + `transform` áp cho DTO của `@Body/@Query`. `buy` không có body nên không có gì để validate.',
              '`ParseUUIDPipe` gắn ngay tại `@Param(\'assetId\')` ở controller; `assetId` không phải UUID thì trả 400 trước khi vào service.',
              '`@IdempotencyKey()` là param decorator: thiếu header hoặc dài quá 128 ký tự thì ném `DomainException` 400.',
            ],
            snippets: [
              {
                file: `${CA}/main.ts`,
                ranges: [{ at: 'app.useGlobalPipes(', to: '^  \\);' }],
                hl: ['whitelist', 'forbidNonWhitelisted', 'transform'],
              },
              {
                file: `${CA}/common/decorators/idempotency-key.decorator.ts`,
                ranges: [{ at: 'export function extractIdempotencyKey', to: '^}' }],
                hl: ['IDEMPOTENCY_KEY_MISSING', 'IDEMPOTENCY_KEY_INVALID'],
              },
            ],
          },
          {
            layers: ['controller'],
            title: 'AvatarController.buy: chỉ định tuyến và gom tham số',
            when: 'Handler của `POST avatar/items/:assetId/buy`',
            bullets: [
              'Không có nghiệp vụ ở đây. Controller lấy `userId` (guard đã gắn), `assetId` (đã qua ParseUUIDPipe), `idempotencyKey` (đã qua decorator) rồi giao cho service.',
              '`@HttpCode(OK)`: POST nhưng trả 200 vì idempotent replay vẫn là thành công.',
              '`@ApiOperation/@ApiOkResponse` sinh OpenAPI, từ đó sinh lại client TS ở bước 2.',
            ],
            snippets: [
              {
                file: `${AV}/avatar.controller.ts`,
                ranges: [
                  { at: "@ApiTags('avatar')", to: 'constructor(private readonly avatarService' },
                  { at: "@Post('items/:assetId/buy')", to: '^  }$' },
                ],
                hl: ["@Controller('avatar')", "@Post('items/:assetId/buy')", 'ParseUUIDPipe', '@IdempotencyKey()', '@CurrentUser()', 'this.avatarService.buy'],
              },
            ],
          },
        ],
      },
      {
        title: 'Service → Repository → gọi module Economy',
        steps: [
          {
            layers: ['service'],
            title: 'AvatarService.buy: thứ tự bắt buộc',
            when: 'Nghiệp vụ nằm ở service',
            bullets: [
              'Giá lấy từ DB (`asset.priceDiamond`). Item giá 0 thì từ chối và bảo dùng `claim()`.',
              'Thứ tự: trừ diamond (idempotent) rồi mới ghi sở hữu (idempotent). Retry an toàn ở cả hai nhánh.',
              'Key gửi sang Economy là `avatar:buy:{userId}:{key của client}`: prefix domain + userId để khác user không đụng key nhau.',
            ],
            snippets: [
              {
                file: `${AV}/avatar.service.ts`,
                ranges: [{ at: 'Item trả phí — spendDiamond generic', to: '^  }$', pad: [1, 0] }],
                hl: ['getAssetOrThrow', 'priceDiamond === 0', 'this.economy.spendDiamond', 'grantOwnership', 'avatarBuyIdempotencyKey'],
              },
              {
                file: `${AV}/avatar.constants.ts`,
                ranges: [{ at: 'export function avatarBuyIdempotencyKey', to: '^}' }],
                hl: ['avatar:buy'],
              },
            ],
          },
          {
            layers: ['repo', 'db'],
            title: 'Repository (TypeORM) đọc catalog từ PostgreSQL',
            when: '`getAssetOrThrow` trong service',
            bullets: [
              'Repository là `Repository<AvatarAsset>` do TypeORM cấp qua `@InjectRepository`, repo này không viết class repository riêng.',
              '`findOneBy({ id, active: true })` đọc đúng 1 dòng ở bảng `avatar_assets`. Không có hoặc đã tắt thì ném 404 `AVATAR_ASSET_NOT_FOUND`.',
              'Giá là dữ liệu trong DB (`price_diamond`, có CHECK ≥ 0), không phải cấu hình env.',
            ],
            snippets: [
              {
                file: `${AV}/avatar.service.ts`,
                ranges: [
                  { at: 'constructor(', to: ') {}' },
                  { at: 'private async getAssetOrThrow', to: '^  }$' },
                ],
                hl: ['@InjectRepository(AvatarAsset)', 'findOneBy({ id: assetId, active: true })', 'ASSET_NOT_FOUND'],
              },
              {
                file: MIG,
                lang: 'sql',
                ranges: [{ at: 'CREATE TABLE avatar_assets', to: '^      \\)$' }],
                hl: ['price_diamond', 'chk_avatar_assets_price_nonneg'],
                label: 'schema (migration)',
              },
            ],
          },
          {
            layers: ['service'],
            title: 'Gọi sang module Economy qua DI',
            when: '`this.economy.spendDiamond(...)`',
            bullets: [
              'Avatar không đụng bảng ví. Nó import `EconomyModule` và gọi facade `EconomyService`; ranh giới module có arch test (`module-boundaries.spec.ts`).',
              '`spendDiamond` dựng một giao dịch sổ kép: Nợ ví người dùng, Có doanh thu hệ thống.',
              'Mọi việc ghi sổ, khóa ví và idempotency do `ledger.record()` làm (bước 13–15).',
            ],
            snippets: [
              {
                file: `${AV}/avatar.module.ts`,
                ranges: [{ at: 'imports: [', to: '],' }],
                hl: ['EconomyModule'],
              },
              {
                file: `${CA}/modules/economy/economy.service.ts`,
                ranges: [{ at: 'async spendDiamond(', to: '^  }$' }],
                hl: ['this.ledger.record', 'LedgerDirection.Debit', 'LedgerDirection.Credit', 'idempotencyKey'],
              },
            ],
          },
        ],
      },
      {
        title: 'Ledger: một transaction Postgres ghi sổ, khóa ví, kiểm số dư',
        steps: [
          {
            layers: ['service', 'db'],
            title: 'ledger.record: idempotency chặn trừ tiền hai lần',
            when: 'Lớp đầu của `LedgerService.record`',
            bullets: [
              'Đã có giao dịch cùng `idempotencyKey` thì so `requestHash` rồi trả `replayed: true`, không trừ lần nữa.',
              'Chưa có thì mở một DB transaction. Hai request cùng key chạy song song: bên thua dính unique violation `UQ_TRANSACTIONS_IDEMPOTENCY_KEY`, đọc bản của bên thắng và trả replay.',
            ],
            snippets: [
              {
                file: LEDGER,
                ranges: [
                  { at: 'async record(input: RecordTransactionInput)', to: '^    }$' },
                  { at: 'const result = await this.dataSource.transaction((manager)', to: 'return result;', pad: [0, 0] },
                  { at: 'isUniqueViolation(err) &&', to: 'findOneByOrFail({ idempotencyKey: input.idempotencyKey });', pad: [1, 0] },
                ],
                hl: ['findOneBy({ idempotencyKey', 'this.dataSource.transaction', 'isUniqueViolation', 'UQ_TRANSACTIONS_IDEMPOTENCY_KEY', 'replayed: true'],
              },
            ],
          },
          {
            layers: ['db'],
            title: 'Ghi sổ và khóa ví bằng SELECT … FOR UPDATE',
            when: '`recordInManager`, nằm trong cùng một transaction Postgres',
            bullets: [
              '`INSERT … ON CONFLICT DO NOTHING` vào `transactions`: request trùng key chờ nhau thay vì làm hỏng transaction.',
              '`userIds` được sắp xếp trước khi khóa, để khóa ví theo thứ tự ổn định khi giao dịch có nhiều ví.',
              '`pessimistic_write` = `SELECT … FOR UPDATE`: mọi giao dịch cộng/trừ của cùng một user xếp hàng tuần tự.',
            ],
            snippets: [
              {
                file: LEDGER,
                ranges: [
                  { at: '// ON CONFLICT DO NOTHING avoids aborting', to: '.execute();' },
                  { at: 'const userIds = [', to: 'wallets.set(userId, await this.lockWallet(manager, userId));' },
                  { at: 'private async lockWallet(', to: '^  }$' },
                ],
                hl: ['.orIgnore()', '.sort()', "setLock('pessimistic_write')", 'ON CONFLICT (user_id) DO NOTHING'],
              },
            ],
          },
          {
            layers: ['db', 'kafka'],
            title: 'Kiểm số dư lúc trừ + ghi Outbox cùng transaction',
            when: '`applyWalletDeltas`, sau khi đã giữ khóa ví',
            bullets: [
              'Số dư được kiểm ĐÚNG LÚC trừ (đã giữ khóa), không tin lần kiểm ở đầu luồng. Thiếu thì ném 422 `ECONOMY_WALLET_INSUFFICIENT_BALANCE` và rollback tất cả.',
              'Event `economy.diamond.debited` ghi vào `outbox_events` trong CÙNG transaction, nên không thể có chuyện đã trừ tiền mà mất event.',
              'COMMIT ghi nguyên tử 4 nơi (xem danh sách bên dưới); xong mới trả về `AvatarService`.',
            ],
            chips: [
              'transactions: UNIQUE idempotency_key',
              'ledger_entries ×2: Nợ ví, Có doanh thu',
              'wallets: balance (đang FOR UPDATE)',
              'outbox_events: chưa publish',
            ],
            snippets: [
              {
                file: LEDGER,
                ranges: [
                  { at: 'const mayGoNegative', to: '^      }$' },
                  { at: 'wallet.balance = newBalance.toString();', to: 'await manager.save(wallet);' },
                  { at: '// Outbox: event ghi CÙNG transaction', to: '^      }$' },
                ],
                hl: ['newBalance < 0n', 'WALLET_INSUFFICIENT_BALANCE', 'await manager.save(wallet)', 'OutboxEvent', 'economy.diamond.debited'],
              },
            ],
          },
        ],
      },
      {
        title: 'Ghi sở hữu item, rồi Outbox → Kafka chạy nền',
        steps: [
          {
            layers: ['service', 'db'],
            title: 'Ghi sở hữu item: INSERT … ON CONFLICT DO NOTHING',
            when: 'Quay lại `AvatarService.buy` sau khi trừ tiền xong',
            bullets: [
              '`orIgnore()` + unique `uq_user_avatar_items_pair`: retry không tạo bản ghi sở hữu thứ hai.',
              'Lưu ý: trừ tiền và ghi sở hữu là HAI transaction riêng. Crash giữa chừng thì retry cùng `Idempotency-Key` sẽ `replayed: true` (không trừ lại) rồi ghi nốt sở hữu.',
            ],
            snippets: [
              {
                file: `${AV}/avatar.service.ts`,
                ranges: [{ at: 'private async grantOwnership', to: '^  }$' }],
                hl: ['.orIgnore()', 'UserAvatarItem'],
              },
              {
                file: MIG,
                lang: 'sql',
                ranges: [{ at: 'CREATE TABLE user_avatar_items', to: '^      \\)$' }],
                hl: ['uq_user_avatar_items_pair'],
                label: 'schema (migration)',
              },
            ],
          },
          {
            layers: ['kafka'],
            async: true,
            title: 'Outbox relay đẩy event sang Kafka',
            when: 'Job nền, KHÔNG nằm trong vòng đời request',
            bullets: [
              '`OutboxRelayService` chạy theo `ManagedInterval` (ScheduleModule), bật bằng `ECONOMY_OUTBOX_RELAY_ENABLED`.',
              '`FOR UPDATE SKIP LOCKED`: nhiều pod chạy relay song song không dẫm nhau.',
              'Publish Kafka thành công mới đánh dấu `publishedAt`; lỗi quá số lần cho phép thì chuyển dead-letter.',
              'Không tìm thấy consumer nào trong repo subscribe topic này; luồng mua avatar không phụ thuộc vào nó.',
            ],
            snippets: [
              {
                file: `${CA}/modules/economy/jobs/outbox-relay.service.ts`,
                ranges: [{ at: 'async flushOnce', to: 'await this.eventBus.publish(toEventEnvelope(event));' }],
                hl: ["setLock('pessimistic_write')", "setOnLocked('skip_locked')", 'this.eventBus.publish'],
              },
              {
                file: `${CA}/common/events/kafka-event-bus.adapter.ts`,
                ranges: [{ at: 'async publish(event: EventEnvelope)', to: 'value: JSON.stringify(event),', pad: [0, 3] }],
                hl: ['producer.send', 'event.key'],
              },
            ],
          },
        ],
      },
      {
        title: 'Đường về: Interceptor sau, Exception Filter, Client',
        steps: [
          {
            layers: ['interceptor'],
            title: 'Interceptor (nửa sau): bọc envelope { data }',
            when: 'Controller trả `{ replayed }`; `.pipe(map(…))` chạy ở đây',
            bullets: [
              'Mọi response thành công đều được bọc `{ data: … }` (chuẩn envelope). Controller đã trả sẵn `{ data }` thì giữ nguyên.',
              '`replayed: true` nghĩa là retry cùng `Idempotency-Key`; client coi là thành công, tiền không bị trừ lần hai.',
            ],
            snippets: [
              {
                file: `${CA}/common/interceptors/response-envelope.interceptor.ts`,
                ranges: [{ at: 'return next.handle().pipe(', to: '^    \\);$' }],
                hl: ['return { data: value };'],
              },
              {
                title: 'HTTP 200 · ví dụ response',
                lang: 'json',
                text: '{ "data": { "replayed": false } }',
                crumb: 'minh họa, theo AvatarBuyResultDto + envelope',
              },
            ],
          },
          {
            layers: ['error'],
            title: 'GlobalExceptionFilter: đường lỗi',
            when: 'Bất kỳ lỗi nào ném ra ở các bước trước (guard, pipe, service, ledger)',
            bullets: [
              '`DomainException` giữ nguyên `code` + HTTP status của domain; `HttpException` của Nest được map sang mã `COMMON_*`.',
              'Lỗi không lường trước trả 500 `COMMON_INTERNAL_ERROR`, log đầy đủ + gửi Sentry, nhưng body không lộ chi tiết nội bộ.',
              'Body lỗi luôn `{ error: { code, message, traceId } }`; `traceId` chính là `req.id` ở bước 4, `message` được dịch theo `Accept-Language`.',
            ],
            snippets: [
              {
                file: `${CA}/common/filters/global-exception.filter.ts`,
                ranges: [
                  { at: 'catch(exception: unknown, host: ArgumentsHost)', to: 'const locale = resolveApiLocale' },
                  { at: 'if (exception instanceof DomainException)', to: '} else if (exception instanceof HttpException) {', pad: [0, -1] },
                  { at: 'const payload: ApiErrorBody', to: 'res.status(status).json(payload);' },
                ],
                hl: ['instanceof DomainException', 'traceId', 'res.status(status).json(payload)', 'INTERNAL_ERROR'],
              },
            ],
            table: {
              head: ['HTTP', 'code', 'ném ra ở', 'khi nào'],
              rows: [
                ['401', 'COMMON_UNAUTHORIZED', 'JwtAuthGuard', 'thiếu, sai hoặc hết hạn Bearer token'],
                ['429', 'COMMON_RATE_LIMITED', 'ThrottlerGuard', 'vượt hạn mức request (đếm trong Redis)'],
                ['400', 'COMMON_IDEMPOTENCY_KEY_MISSING / _INVALID', '@IdempotencyKey()', 'thiếu header hoặc dài quá 128 ký tự'],
                ['400', 'COMMON_VALIDATION_FAILED', 'ParseUUIDPipe', '`assetId` không phải UUID'],
                ['404', 'AVATAR_ASSET_NOT_FOUND', 'AvatarService.getAssetOrThrow', 'item không có hoặc đã tắt'],
                ['400', 'AVATAR_ASSET_IS_FREE', 'AvatarService.buy', 'item giá 0, phải dùng claim'],
                ['422', 'ECONOMY_WALLET_INSUFFICIENT_BALANCE', 'LedgerService.applyWalletDeltas', 'không đủ diamond'],
                ['500', 'COMMON_INTERNAL_ERROR', 'GlobalExceptionFilter', 'lỗi không lường trước'],
              ],
            },
          },
          {
            layers: ['client'],
            title: 'Client nhận kết quả',
            when: 'Response về lại api-client rồi tới React',
            bullets: [
              'Response không ok thì `apiErrorFromResponse` ném `ApiError` mang `code`, `message`, `traceId` từ body lỗi (riêng 401 thì thử refresh token một lần, thuộc luồng auth).',
              'Thành công: `resetKey()` để lần mua sau dùng key mới, hiện toast, rồi tự trang bị item vừa mua. Lỗi: hiện `message` do server trả.',
            ],
            snippets: [
              {
                file: 'libs/api-client/src/lib/client.ts',
                ranges: [
                  { at: 'async onResponse({ request, response })', to: 'if (response.ok) return response;' },
                  { at: 'throw await apiErrorFromResponse(response);', nth: 1 },
                ],
                hl: ['response.ok', 'apiErrorFromResponse'],
              },
              {
                file: 'apps/web/src/features/avatar/components/avatar-builder.tsx',
                ranges: [{ at: 'buyItem.mutate(', to: '^    \\);' }],
                hl: ['resetKey()', 'showToast', 'isApiError(error)'],
              },
            ],
          },
        ],
      },
    ],
    otherEndpoints: {
      title: 'Các endpoint còn lại của Avatar (cùng pipeline, khác controller → service)',
      head: ['Endpoint', 'Service', 'Khác với buy'],
      rows: [
        ['GET /avatar/catalog', 'listCatalog', '`CatalogQueryDto` (`@IsEnum(AvatarSlot)`) được ValidationPipe kiểm; chỉ đọc `avatar_assets`'],
        ['GET /avatar/me/items', 'listMyItems', 'đọc `user_avatar_items` rồi nạp `avatar_assets`'],
        ['POST /avatar/items/:assetId/claim', 'claim', 'item free, không gọi Economy, trả 204; `ON CONFLICT DO NOTHING`'],
        ['PUT /avatar/me/equip', 'equip', '`EquipAvatarItemDto` qua ValidationPipe; chống IDOR: đúng slot + đã sở hữu rồi mới `configRepo.update`'],
        ['GET /avatar/me', 'getMyAvatar', 'lazy-init avatar mặc định trong một transaction; PK `userId` chặn race'],
        ['GET /avatar/users/:userId', 'getAvatarOf', 'công khai, không cần là bạn bè; chưa có config thì trả layers rỗng'],
      ],
    },
    notUsed: [
      { name: 'Signaling Gateway (Socket.IO)', why: 'không có mã avatar trong `apps/signaling-gateway`; đổi avatar chỉ hiện khi client refetch' },
      { name: 'Media Server', why: 'không có mã avatar trong `apps/media-server`; ảnh layer là `image_url` trỏ tới CDN' },
      { name: 'BullMQ', why: 'repo không dùng BullMQ; job nền dùng ScheduleModule + `ManagedInterval` (bước 17)' },
      { name: 'Redis làm cache / lock', why: 'avatar không cache; Redis chỉ xuất hiện ở rate-limit (bước 5)' },
      { name: 'Kafka consumer', why: 'chỉ có phía publish (bước 17); không thấy consumer trong repo' },
    ],
  },
];
