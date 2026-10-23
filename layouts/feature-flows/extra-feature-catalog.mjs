// Six extra diagram sections, backed by current source; original protected images stay intact.
// review-module: N/A — data for documentation, no business-code changes.
const s = (actor, text, edge = '') => ({ actor, text, edge });
const fe = (text, edge = '') => s('Frontend', text, edge);
const c = (domain, text, edge = '') => s(`core-api · ${domain}`, text, edge);
const pg = (text) => s('PostgreSQL', text, 'SQL result · trả core-api');
const branch = (actor, question, ...options) => ({
  actor,
  branch: question,
  options,
});
const o = (label, steps, continues = true) => ({ label, steps, continues });
const m = (name, uses, entities, actions) => ({
  name,
  uses,
  entities,
  actions,
});
const r = (business = [], signaling = false) => ({
  business,
  signaling,
  mediaCluster: false,
});
const role = (role, label, direction = 'both') => ({ role, label, direction });
const external = (
  id,
  lines,
  request,
  callback,
  direct,
  direction,
  condition,
) => ({
  id,
  lines,
  request,
  callback,
  direct,
  direction,
  condition,
  redis: '',
});
const ledger = [
  'LedgerAccount',
  'LedgerTransaction',
  'LedgerEntry',
  'Wallet',
  'OutboxEvent',
];
const broker = () =>
  external(
    'broker',
    ['Kafka', 'Economy outbox'],
    'Outbox relay publish economy events',
    '',
    '',
    'to-provider',
    'ECONOMY_OUTBOX_RELAY_ENABLED; chưa có domain consumer đăng ký',
  );
const push = () =>
  external(
    'push',
    ['FCM / APNs / Web Push', 'Notification sau commit'],
    'Gửi push best-effort sau commit',
    '',
    'Provider → device/browser',
    'to-client',
    'Provider credentials + endpoint/token theo contract',
  );
const feature = (id, title, values) => ({
  id,
  title,
  sources: [],
  core: [],
  rest: '',
  dataLabel: '',
  redisLabel: '',
  realtime: false,
  external: null,
  archNotes: {},
  flowNotes: {},
  flow: [],
  ...values,
});

export const extraFeatures = {
  '01-matching-engine': feature('01-matching-engine', 'Matching Engine', {
    sources: [
      'docs/services/matching-service.md',
      'docs/services/realtime-gateway.md',
    ],
    core: [
      'Matching: ticket + matcher',
      'User / Safety / Economy',
      'Notification qua DI',
    ],
    rest: 'REST: tickets, current, cancel',
    dataLabel: 'MatchTicket, MatchSession',
    redisLabel: 'Sorted Set + shard index + bus',
    realtime: true,
    archNotes: {
      important:
        'Matching là module trong core-api. PostgreSQL giữ ticket, quota và session; Redis Sorted Set giữ hàng đợi cùng shard index, Pub/Sub vận chuyển event sau commit.',
      caution:
        'Matcher phải kiểm tra lại ticket, user status, gender preference hai chiều và Safety trong transaction. Một user không được có nhiều ticket active; Redis không thay PostgreSQL làm nguồn state.',
    },
    flowNotes: {
      important:
        'Flow mới tạo hai tickets confirmed và MatchSession confirmed atomically; không yêu cầu bước confirm client mới. Notification in-app được ghi cùng transaction, push best-effort sau commit.',
      caution:
        'Quota guest dùng HMAC user/device/IP và quota registered theo ngày UTC ở PostgreSQL. Cancel/expire không hoàn lượt; Pub/Sub mất event thì client đọc lại qua REST.',
    },
  }),
  '10-matching-speed-up-detail': feature(
    '10-matching-speed-up-detail',
    'Matching Speed-up',
    {
      sources: [
        'docs/services/matching-service.md',
        'apps/core-api/src/modules/matching/matching.service.ts',
        'docs/services/economy-service.md',
      ],
      core: [
        'Matching: queued ticket boost',
        'Economy: spendDiamond',
        'Ledger: append-only',
      ],
      rest: 'REST: ticket speedup',
      dataLabel: 'MatchTicket, ledger',
      redisLabel: 'Sorted Set score; ZADD XX',
      archNotes: {
        important:
          'Matching gọi Economy qua DI để debit DIA, rồi tăng priorityBoostMs trong PostgreSQL và đặt score Redis từ tổng boost. Wallet là ledger snapshot; LedgerTransaction.idempotencyKey unique ở DB.',
        caution:
          'Speed-up chỉ nhận ticket queued, giá server theo tier. Không có quota speed-up nghiệp vụ; technical HTTP throttle là hạ tầng chung. Kafka chỉ nhánh Economy outbox khi relay được bật.',
      },
      flowNotes: {
        important:
          'Debit mới tăng boost có điều kiện khi ticket còn queued; Redis ZADD XX không tái tạo member đã rời queue. Retry cập nhật Redis từ boost đã lưu và không debit lần hai.',
        caution:
          'Ticket có thể vừa được ghép sau lúc kiểm tra; code không có refund tự động cho race đó. Không mô tả toàn bộ debit và boost như một transaction atomic: spend và ticket increment là hai bước.',
      },
    },
  ),
  '14-preference-matching-detail': feature(
    '14-preference-matching-detail',
    'Preference khi Matching',
    {
      sources: [
        'docs/services/matching-service.md',
        'apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts',
        'apps/core-api/src/modules/user/dto/update-profile.dto.ts',
      ],
      core: [
        'Matching: preference snapshot',
        'Matcher: gender hai chiều',
        'User / Safety tại lúc ghép',
      ],
      rest: 'REST: join với genderPreference',
      dataLabel: 'User, MatchTicket, Session',
      redisLabel: 'Queue shard: region + ageBand',
      realtime: true,
      archNotes: {
        important:
          'genderPreference snapshot trên MatchTicket; region và ageBand xác định shard queue. Matcher đọc gender user mới nhất trong transaction để kiểm tra cả hai chiều cùng Safety.',
        caution:
          'Không shard theo gender. SeekingAgeMin/Max lưu trên profile không phải bộ lọc age range đang được matcher áp dụng; tuổi ở Matching là ageBand shard. Direct invite accept có consent cụ thể và không check genderPreference.',
      },
      flowNotes: {
        important:
          'Đổi preference của ticket cần cancel rồi join lại; retry cùng key với payload khác là conflict. Cặp không khớp được requeue với score gốc.',
        caution:
          'Unknown/other chỉ khớp preference any. Profile có seeking fields không chứng minh matcher áp dụng tất cả saved preferences; sơ đồ mô tả code hiện tại.',
      },
    },
  ),
  '23-user-profile-va-privacy': feature(
    '23-user-profile-va-privacy',
    'User Profile và Privacy',
    {
      sources: [
        'apps/core-api/src/modules/user/user.controller.ts',
        'apps/core-api/src/modules/user/user.service.ts',
        'apps/core-api/src/modules/user/services/privacy-settings.service.ts',
        'docs/services/discovery-service.md',
      ],
      core: [
        'User: profile + privacy',
        'PresenceReader: Redis read',
        'Auth phone search / Discovery',
      ],
      rest: 'REST: users/me, privacy, presence',
      dataLabel: 'User, PrivacySetting',
      redisLabel: 'Presence đọc từ gateway leases',
      archNotes: {
        important:
          'User và PrivacySetting thuộc PostgreSQL. Profile update validate tại backend; privacy PUT lưu đầy đủ bốn cờ. UserPresenceReader đọc Redis presence do signaling-gateway ghi, không tự quyết user online.',
        caution:
          'hideProfile không làm GET /users/:id thành endpoint có block/privacy gate; controller hiện trả PublicProfileDto trực tiếp. showDistance tác động Nearby bucket, searchableByPhone tác động phone search; không suy quyền toàn hệ thống từ một cờ.',
      },
      flowNotes: {
        important:
          'PrivacySetting có default khi chưa có row; PUT upsert toàn bộ preferences. showOnlineStatus=false trả offline mà không đọc presence, showDistance=false ẩn distanceBucket của target.',
        caution:
          'Nearby opt-in là DiscoverySetting riêng, tắt opt-in mới xoá UserLocation; không đánh đồng với showDistance. Public profile DTO không chứa birthDate, region, trustScore hoặc seeking preferences.',
      },
    },
  ),
  '24-analytics-consent': feature(
    '24-analytics-consent',
    'Analytics và thông báo privacy',
    {
      sources: [
        'apps/web/src/instrumentation-client.ts',
        'apps/web/src/shared/analytics/product-analytics.ts',
        'apps/web/src/shared/analytics/product-analytics-components.tsx',
        'apps/web/src/shared/analytics/web-vitals.tsx',
      ],
      core: [],
      rest: '',
      dataLabel: '',
      redisLabel: '',
      realtime: false,
      external: {
        lines: ['PostHog', 'Frontend telemetry'],
        control: '',
        direct: 'Frontend → PostHog',
        kind: 'provider',
      },
      archNotes: {
        important:
          'Telemetry hiện được khởi tạo trực tiếp trong browser khi có PostHog config. Frontend gửi pageview/autocapture, identity và Core Web Vitals sample; flow này không đi qua core-api, PostgreSQL hoặc Redis.',
        caution:
          'Mục privacy hiện hiển thị switch luôn bật khi configured và không có handler đổi consent. Consent cookie/helper tồn tại nhưng startup không kiểm cookie đó; server AnalyticsPort không có domain call site hiện hành.',
      },
      flowNotes: {
        important:
          'instrumentation-client gọi initializeProductAnalytics; SDK opt_in_capturing sau init. Identity chỉ gửi userId/account_type, Web Vitals chỉ LCP/INP/CLS trong bucket sample 10%.',
        caution:
          'Không mô tả active consent gate: UI switch hiện static, helper accepted/declined chưa được wire vào UI/startup. Recording config maskAllInputs=false, sample 20%, minimum 3000ms; không claim privacy masking/production consent đã được xác minh.',
      },
    },
  ),
  '25-realtime-fanout': feature('25-realtime-fanout', 'Realtime Fanout', {
    sources: [
      'docs/services/realtime-gateway.md',
      'apps/signaling-gateway/src/app/signaling.gateway.ts',
      'apps/signaling-gateway/src/app/connection-quota.service.ts',
      'apps/signaling-gateway/src/app/redis-adapter.service.ts',
    ],
    core: [
      'Domain publish sau commit',
      'Recipient payload đã authorize',
      'Gateway chỉ transport',
    ],
    rest: 'REST: đọc lại durable state',
    dataLabel: 'State của domain producer',
    redisLabel: 'Pub/Sub + presence + quota',
    realtime: true,
    archNotes: {
      important:
        'core-api quyết recipient/payload và publish sau durable commit; Redis Pub/Sub đưa envelope tới Gateway. Gateway verify JWT, quản lý Redis connection lease/presence và fanout room user từ JWT, không query DB hay quyết business.',
      caution:
        'Pub/Sub at-most-once không giữ lịch sử. Cluster adapter Socket.IO dùng connection Redis riêng; relay dùng server.local để tránh mỗi pod nhân đôi cùng event. Quota Redis lỗi thì handshake fail closed.',
    },
    flowNotes: {
      important:
        'Socket handshake hợp lệ acquire quota atomically và cập nhật presence lease. Domain event không cần internal API Core→Gateway; subscriber nhận per-user channel và emit cục bộ.',
      caution:
        'Socket reconnect cần REST refetch state; lease TTL dọn pod chết. LiveKit media có control/transport riêng, không đi qua signaling-gateway fanout này.',
    },
  }),
};

export const extraDependencies = {
  '01-matching-engine': {
    modules: [
      m(
        'Matching',
        'Ticket/queue/matcher',
        ['MatchTicket', 'MatchSession', 'MatchDailyQuota', 'GuestMatchQuota'],
        ['Join/cancel; lock ticket; tryPair'],
      ),
      m(
        'User',
        'Profile/status mới nhất',
        ['User'],
        ['Read current user gender/status'],
      ),
      m('Safety', 'Pair guard', ['Block', 'Report'], ['canPair lúc ghép']),
      m('Economy', 'Paid extra match khi hết quota', ledger, [
        'Debit trong ticket transaction khi useDiamond',
      ]),
      m(
        'Notification',
        'Match notification',
        ['Notification', 'WebPushSubscription'],
        ['createWithManager + push sau commit'],
      ),
    ],
    entities: [
      'MatchTicket',
      'MatchSession',
      'MatchDailyQuota',
      'GuestMatchQuota',
    ],
    redis: r(
      [
        role('queue', 'Sorted Set matching:queue shards'),
        role('index', 'matching:shards:active'),
        role('Pub/Sub', 'match.confirmed', 'write'),
      ],
      true,
    ),
    externals: [push(), broker()],
    operations: [
      'MatcherWorker wakeup + backstop interval',
      'TicketSweeper queued expiry + legacy pending cleanup',
      'Economy outbox/reconciliation chỉ nhánh paid extra match',
    ],
    notes:
      'Matching chính dùng Redis queue; quota là PostgreSQL. Push là notification sau commit; Kafka chỉ Economy outbox nhánh mua thêm lượt. Không có fourth backend.',
    sources: [
      'apps/core-api/src/modules/matching/matching.module.ts',
      'apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts',
      'apps/core-api/src/modules/matching/jobs/ticket-sweeper.service.ts',
      'apps/core-api/src/modules/matching/matching.service.ts',
    ],
  },
  '10-matching-speed-up-detail': {
    modules: [
      m(
        'Matching',
        'Boost queued ticket',
        ['MatchTicket'],
        ['Ownership + queued guard; conditional boost'],
      ),
      m('Economy', 'Diamond debit', ledger, ['spendDiamond theo unique key']),
    ],
    entities: ['MatchTicket', ...ledger],
    redis: r([role('queue', 'Cập nhật score Sorted Set bằng ZADD XX')]),
    externals: [broker()],
    operations: [
      'Score tuyệt đối từ priorityBoostMs trong PostgreSQL',
      'Economy outbox/reconciliation theo config; không speed-up job riêng',
    ],
    notes:
      'Không có business speed-up rate-limit theo giờ/ngày, không Pub/Sub speedup producer và không payment provider call cho debit ví.',
    sources: [
      'apps/core-api/src/modules/matching/matching.service.ts',
      'apps/core-api/src/modules/matching/entities/match-ticket.entity.ts',
      'apps/core-api/src/modules/economy/services/ledger.service.ts',
      'apps/core-api/src/modules/economy/jobs/outbox-relay.service.ts',
    ],
  },
  '14-preference-matching-detail': {
    modules: [
      m(
        'Matching',
        'Ticket snapshot + matcher',
        ['MatchTicket', 'MatchSession'],
        ['Snapshot genderPreference, region/ageBand'],
      ),
      m(
        'User',
        'Fresh gender đọc lúc ghép',
        ['User'],
        ['Profile owns birthDate/region/seeking fields'],
      ),
      m(
        'Safety',
        'Final pair guard',
        ['Block', 'Report'],
        ['canPair trong matcher'],
      ),
    ],
    entities: ['MatchTicket', 'MatchSession', 'User'],
    redis: r(
      [
        role('queue', 'Shard matchType/region/ageBand'),
        role('index', 'active shards'),
        role('Pub/Sub', 'match.confirmed', 'write'),
      ],
      true,
    ),
    externals: [],
    operations: [
      'Matcher verify gender hai chiều; mismatch requeue score gốc',
      'Không shard gender, không saved age-range filter hiện hành',
    ],
    notes:
      'Preference snapshot thuộc ticket; gender đối phương đọc fresh. Queue Redis là Matching chính, không phải queue Palm/Movie PostgreSQL.',
    sources: [
      'apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts',
      'apps/core-api/src/modules/matching/matching.constants.ts',
      'apps/core-api/src/modules/user/dto/update-profile.dto.ts',
    ],
  },
  '23-user-profile-va-privacy': {
    modules: [
      m(
        'User',
        'Profile + privacy + presence API',
        ['User', 'PrivacySetting'],
        ['PATCH me; PUT privacy; public profile'],
      ),
      m(
        'Auth.PhoneSearch',
        'Search theo phone nếu opt-in',
        ['AuthIdentity'],
        ['Privacy-off/nonexistent/banned đều null'],
      ),
      m(
        'Discovery.Nearby',
        'Consumer showDistance + hideProfile',
        ['UserLocation', 'DiscoverySetting'],
        ['Nearby opt-in riêng; filter privacy khi đọc'],
      ),
    ],
    entities: ['User', 'PrivacySetting'],
    redis: r([
      role(
        'presence',
        'UserPresenceReader đọc realtime:presence leases',
        'read',
      ),
    ]),
    externals: [],
    operations: [
      'Presence reader dọn expired members rồi ZCARD; lỗi trả offline',
      'Privacy defaults derive khi chưa có row; full PUT upsert',
    ],
    notes:
      'Privacy không phải active telemetry consent. Gateway owns presence write/quota; User reader không tạo lease. Nearby opt-in tắt xoá location, khác showDistance chỉ ẩn bucket.',
    sources: [
      'apps/core-api/src/modules/user/user.module.ts',
      'apps/core-api/src/modules/user/user.controller.ts',
      'apps/core-api/src/modules/user/services/privacy-settings.service.ts',
      'apps/core-api/src/modules/user/redis/redis-presence-reader.adapter.ts',
      'apps/core-api/src/modules/auth/services/phone-search.service.ts',
      'apps/core-api/src/modules/discovery/nearby.service.ts',
    ],
  },
  '24-analytics-consent': {
    frontendOnly: true,
    modules: [],
    entities: [],
    redis: r(),
    externals: [
      external(
        'analytics',
        ['PostHog', 'Browser product telemetry'],
        '',
        '',
        'Frontend → PostHog: pageview/autocapture/identity/RUM',
        'to-provider',
        'NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN + HOST; configured startup auto-opt-in',
      ),
    ],
    operations: [
      'instrumentation-client khởi tạo SDK',
      'Providers identify/reset current user; WebVitals sample 10%',
      'Consent helper có code nhưng không UI/startup call site',
    ],
    notes:
      'Configured frontend telemetry hoạt động độc lập core-api; PostHog server AnalyticsPort không có domain caller. UI privacy switch luôn bật, không chứng minh user đã consent.',
    sources: [
      'apps/web/src/instrumentation-client.ts',
      'apps/web/src/shared/analytics/product-analytics.ts',
      'apps/web/src/shared/analytics/product-analytics-components.tsx',
      'apps/web/src/shared/analytics/web-vitals.tsx',
      'apps/web/src/app/providers.tsx',
      'apps/core-api/src/modules/notification/notification.service.ts',
    ],
  },
  '25-realtime-fanout': {
    modules: [
      m(
        'Core domain producers',
        'Authorize payload trước publish',
        ['MatchSession', 'Message', 'PartyRoomComment'],
        ['Persist domain state rồi publish per-recipient'],
      ),
      m(
        'User',
        'Consumer presence riêng',
        ['PrivacySetting'],
        ['Read presence khi showOnlineStatus'],
      ),
    ],
    entities: ['MatchSession', 'Message', 'PartyRoomComment'],
    redis: r([role('Pub/Sub', 'realtime:user:{userId}', 'write')], true),
    externals: [],
    operations: [
      'Gateway quota lease acquire/refresh/release + TTL',
      'PSUBSCRIBE connection riêng; Redis adapter pub/sub riêng',
      'Relay server.local; socket reconnect cần REST refetch',
    ],
    notes:
      'PostgreSQL minh họa durable state của domain producer, Gateway không query PostgreSQL. Redis quota/presence thuộc Gateway; LiveKit WebRTC không đi qua flow này.',
    sources: [
      'apps/core-api/src/common/realtime/publish-realtime.ts',
      'apps/signaling-gateway/src/app/signaling.gateway.ts',
      'apps/signaling-gateway/src/app/connection-quota.service.ts',
      'apps/signaling-gateway/src/app/redis-adapter.service.ts',
      'docs/services/realtime-gateway.md',
    ],
  },
};

export const extraLayerFlows = {
  '01-matching-engine': {
    stages: [
      fe(
        'Người dùng chọn Soul / Voice và nhấn Match',
        'REST · POST /matching/tickets',
      ),
      c(
        'Matching',
        'Kiểm tra quyền, quota, active ticket, idempotency và preference',
        'SQL · INSERT ticket + quota',
      ),
      pg(
        'Lưu MatchTicket queued và quota atomically; paid extra có ledger cùng transaction',
      ),
      c(
        'Matching',
        'Chọn shard từ matchType, region, ageBand và ticket score',
        'Redis · ZADD + SADD',
      ),
      s(
        'Redis · Sorted Set',
        'Enqueue ticket; active shard index được cập nhật',
        'Redis result · enqueue xong',
      ),
      c(
        'Matching',
        'Đánh thức MatcherWorker sau enqueue',
        'in-process · wakeup',
      ),
      c(
        'MatcherWorker',
        'Quét active shards và lấy hai ticket ưu tiên',
        'Redis · ZPOPMIN key 2',
      ),
      s(
        'Redis · Sorted Set',
        'Pop hai ticketId có score thấp nhất atomically',
        'Redis result · ticketId',
      ),
      c(
        'Matching',
        'Mở transaction để verify hai tickets',
        'SQL · SELECT FOR UPDATE',
      ),
      pg('Lock tickets theo thứ tự ổn định; trả ticket và user state hiện tại'),
      branch(
        'core-api · Matching',
        'Hai ticket hợp lệ và có thể ghép?',
        o('CÓ', [
          c(
            'Matching',
            'Re-check preference hai chiều + Safety; yêu cầu ghi confirmed',
            'SQL · session/tickets/notification + COMMIT',
          ),
        ]),
        o(
          'KHÔNG',
          [
            c(
              'Matching',
              'Expire ticket stale; giữ ticket hợp lệ để requeue',
              'SQL · transition + COMMIT',
            ),
            pg('Commit ticket transitions, không tạo session'),
            c(
              'Matching',
              'Enqueue lại candidate hợp lệ bằng score gốc',
              'Redis · ZADD',
            ),
            s(
              'Redis · Sorted Set',
              'Ticket hợp lệ tiếp tục chờ, không mất lượt chờ',
              'Redis result · requeue',
            ),
          ],
          false,
        ),
      ),
      pg(
        'Commit MatchSession + hai tickets confirmed + Notification trong cùng transaction',
      ),
      c(
        'Matching',
        'Sau commit: publish match.confirmed; push tùy adapter',
        'Redis · PUBLISH',
      ),
      s(
        'Redis · Pub/Sub',
        'Chuyển match.confirmed trên per-user channels',
        'Pub/Sub · PSUBSCRIBE',
      ),
      s(
        'signaling-gateway',
        'Fanout envelope tới room user của hai clients',
        'WebSocket · match.confirmed',
      ),
      fe('Nhận event; REST refetch rồi mở Soul / Calling'),
    ],
    sources: [
      'docs/services/matching-service.md',
      'docs/services/realtime-gateway.md',
    ],
  },
  '10-matching-speed-up-detail': {
    stages: [
      fe(
        'Đọc speedupPriceDiamond do server trả; bấm Speed-up',
        'REST · POST ticket speedup + key',
      ),
      c(
        'Matching',
        'Check ownership, queued và giá theo tier hiện tại',
        'in-process · Economy.spendDiamond',
      ),
      c(
        'Economy',
        'Claim LedgerTransaction key; lock Wallet và kiểm tra balance',
        'SQL · entries + Wallet + OutboxEvent',
      ),
      pg(
        'Commit double-entry debit DIA, Wallet snapshot và transaction; replay cùng key không debit lại',
      ),
      c(
        'Matching',
        'Giao dịch mới: tăng priorityBoostMs chỉ nếu ticket còn queued',
        'SQL · conditional increment + đọc ticket',
      ),
      pg(
        'Lưu tổng boost trên MatchTicket; ticket vừa ghép có thể không tăng boost',
      ),
      c(
        'Matching',
        'Tính score tuyệt đối từ enqueuedAt + tổng boost hiện tại',
        'Redis · ZADD XX',
      ),
      s(
        'Redis · Sorted Set',
        'Cập nhật member còn trong queue; không recreate ticket đã bị pop',
        'Redis result · score update',
      ),
      c(
        'Matching',
        'Trả transactionId, replayed và ticket mới nhất',
        'REST result · SpeedupResult',
      ),
      fe('Hiển thị state server; retry lỗi Redis bằng cùng key'),
    ],
    caution:
      'Debit và increment boost không chung một transaction; không claim crash ở giữa hai bước được bù đầy đủ. Completion Redis retry an toàn từ boost đã lưu; không tự refund race ghép.',
    sources: [
      'apps/core-api/src/modules/matching/matching.service.ts',
      'docs/services/matching-service.md',
    ],
  },
  '14-preference-matching-detail': {
    stages: [
      fe(
        'Chọn genderPreference cho lần join này',
        'REST · POST /matching/tickets',
      ),
      c(
        'Matching',
        'Validate preference; đọc profile cho shard region/ageBand',
        'SQL · INSERT snapshot ticket',
      ),
      pg('Lưu genderPreference snapshot và shard fields trên MatchTicket'),
      c('Matching', 'Enqueue theo shard, không shard gender', 'Redis · ZADD'),
      s(
        'Redis · Sorted Set',
        'Ticket chờ trong shard matchType/region/ageBand',
        'Redis result · enqueue thành công',
      ),
      c(
        'MatcherWorker',
        'Yêu cầu pop hai candidates ưu tiên',
        'Redis · ZPOPMIN key 2',
      ),
      s(
        'Redis · Sorted Set',
        'Pop candidates atomically',
        'Redis result · candidate IDs',
      ),
      c(
        'MatcherWorker',
        'Yêu cầu dữ liệu fresh để verify',
        'SQL · SELECT FOR UPDATE + User read',
      ),
      pg(
        'Trả ticket snapshot và gender/status user mới nhất trong transaction',
      ),
      branch(
        'core-api · Matching',
        'Preference hai chiều và Safety cùng đạt?',
        o(
          'ĐẠT',
          [
            c(
              'Matching',
              'Xác nhận pair trong transaction',
              'SQL · COMMIT MatchSession/tickets',
            ),
            pg('Commit confirmed pair'),
            c('Matching', 'Phát match.confirmed sau commit', 'Redis · PUBLISH'),
            s(
              'Redis · Pub/Sub',
              'Đưa event tới Gateway',
              'Pub/Sub · PSUBSCRIBE',
            ),
            s(
              'signaling-gateway',
              'Fanout cho hai user',
              'WebSocket · match.confirmed',
            ),
            fe('REST refetch rồi vào Soul / Voice'),
          ],
          false,
        ),
        o(
          'KHÔNG KHỚP',
          [
            c(
              'Matching',
              'Không pair; candidate hợp lệ giữ thời điểm chờ gốc',
              'Redis · requeue',
            ),
            s(
              'Redis · Sorted Set',
              'Requeue bằng score gốc; tiếp tục chờ',
              'Redis result · queued',
            ),
          ],
          false,
        ),
      ),
    ],
    caution:
      'SeekingAgeMin/Max trên profile chưa phải matcher age-range filter; actual filter là gender hai chiều và ageBand/region shard. Đổi ticket preference phải cancel/join; direct invite accept không check gender preference.',
    sources: [
      'docs/services/matching-service.md',
      'apps/core-api/src/modules/matching/jobs/matcher-worker.service.ts',
    ],
  },
  '23-user-profile-va-privacy': {
    stages: [
      fe('Mở profile/settings; chọn hành động'),
      branch(
        'Frontend',
        'Sửa profile, privacy hay xem presence?',
        o(
          'PROFILE',
          [
            fe('Gửi fields được phép của chính mình', 'REST · PATCH /users/me'),
            c(
              'User',
              'Validate birthDate, interests, region, seekingAgeMin ≤ Max',
              'SQL · UPDATE User',
            ),
            pg('Lưu User profile'),
            c('User', 'Trả MyProfileDto của chính caller', 'REST result'),
            fe('Hiển thị profile server; public DTO chỉ có fields công khai'),
          ],
          false,
        ),
        o(
          'PRIVACY',
          [
            fe('Gửi đủ bốn cờ privacy', 'REST · PUT /users/me/privacy'),
            c(
              'User.Privacy',
              'Upsert settings theo userId JWT',
              'SQL · UPSERT PrivacySetting',
            ),
            pg(
              'Lưu showOnlineStatus, showDistance, searchableByPhone và hideProfile',
            ),
            c(
              'User.Privacy',
              'Trả settings đã lưu; defaults khi chưa có row',
              'REST result',
            ),
            fe('Hiển thị settings; Nearby opt-in là hành động riêng'),
          ],
          false,
        ),
        o(
          'PRESENCE',
          [
            fe(
              'Xem presence trên profile được mở',
              'REST · GET /users/:id/presence',
            ),
            c('User', 'Đọc showOnlineStatus', 'SQL · SELECT PrivacySetting'),
            pg('Trả flag, default true khi chưa có setting'),
            c(
              'User',
              'Nếu flag true: đọc lease; false trả offline ngay',
              'Redis · ZREMRANGEBYSCORE + ZCARD khi cho phép',
            ),
            s(
              'Redis · Presence',
              'Dọn expired lease members và trả số lease còn sống',
              'Redis result · count',
            ),
            c(
              'User',
              'Trả isOnline; Redis lỗi cũng trả offline',
              'REST result',
            ),
            fe('Hiển thị trạng thái theo server'),
          ],
          false,
        ),
      ),
    ],
    followup:
      'Phone search kiểm searchableByPhone và user active; Nearby kiểm hideProfile/showDistance theo scope. Tắt nearbyVisible thuộc Discovery, xoá UserLocation cùng transaction.',
    sources: [
      'apps/core-api/src/modules/user/user.controller.ts',
      'apps/core-api/src/modules/user/services/privacy-settings.service.ts',
      'apps/core-api/src/modules/user/redis/redis-presence-reader.adapter.ts',
    ],
  },
  '24-analytics-consent': {
    stages: [
      fe(
        'Browser khởi động instrumentation-client',
        'in-browser · initializeProductAnalytics',
      ),
      branch(
        'Frontend',
        'Có PostHog project token và host?',
        o(
          'THIẾU CONFIG',
          [fe('Không khởi tạo SDK và không gửi telemetry')],
          false,
        ),
        o('ĐÃ CONFIG', [
          fe(
            'posthog.init: autocapture/pageview bật; opt_in_capturing',
            'SDK · HTTPS telemetry',
          ),
          s(
            'PostHog',
            'Nhận telemetry browser qua host đã cấu hình',
            'HTTP result · SDK',
          ),
        ]),
      ),
      fe(
        'Providers có current user thì identify id + account_type',
        'SDK · identify → PostHog',
      ),
      s(
        'PostHog',
        'Nhận identified user events; không qua core-api',
        'HTTP result · SDK',
      ),
      fe(
        'WebVitals nhận LCP / INP / CLS; hash metric id chọn bucket <10%',
        'SDK · capture web_vital nếu được sample',
      ),
      s(
        'PostHog',
        'Nhận web_vital sampled; ingestion production chưa được chứng minh',
        'HTTP result · SDK',
      ),
      fe(
        'Privacy UI hiển thị switch luôn enabled khi có config; không handler toggle',
        'in-browser · static presentation',
      ),
      fe(
        'Logout: Providers gọi posthog.reset nếu SDK loaded',
        'SDK · reset identity',
      ),
    ],
    caution:
      'Consent helper/cookie accepted/declined là code chưa wire vào active startup/UI; không có bước user accept trước init. Session recording: maskAllInputs=false, sample20%, min3000ms. Server AnalyticsPort chưa có domain call site.',
    sources: [
      'apps/web/src/instrumentation-client.ts',
      'apps/web/src/shared/analytics/product-analytics.ts',
      'apps/web/src/shared/analytics/product-analytics-components.tsx',
      'apps/web/src/app/providers.tsx',
    ],
  },
  '25-realtime-fanout': {
    stages: [
      fe(
        'Có access token; mở Socket.IO /signaling bằng WebSocket',
        'WebSocket · auth.token',
      ),
      s(
        'signaling-gateway',
        'Verify JWT; user room chỉ từ payload.sub',
        'Redis · quota acquire Lua',
      ),
      s(
        'Redis · Quota/Presence',
        'Acquire global connection lease atomically; TTL và presence lease',
        'Redis result · admitted / quota exceeded',
      ),
      branch(
        'signaling-gateway',
        'JWT và quota Redis cho phép?',
        o(
          'BỊ CHẶN',
          [
            s(
              'signaling-gateway',
              'Reject handshake; Redis/quota lỗi fail closed',
              'WebSocket · connect_error',
            ),
            fe('Hiển thị lỗi/retry transport, không coi là business failure'),
          ],
          false,
        ),
        o('ADMITTED', [
          s(
            'signaling-gateway',
            'Join room user của JWT; bắt đầu refresh lease',
            'WebSocket · connected',
          ),
          fe(
            'Nhận connected; gửi thao tác nghiệp vụ qua REST',
            'REST · hành động domain',
          ),
        ]),
      ),
      c(
        'Domain producer',
        'Xử lý nghiệp vụ; yêu cầu lưu state trước realtime',
        'SQL · domain writes + COMMIT',
      ),
      pg('Commit durable domain state; Gateway không đọc bảng này'),
      c(
        'Domain producer',
        'Authorize recipient/payload; publish sau commit',
        'Redis · PUBLISH realtime:user:{userId}',
      ),
      s(
        'Redis · Pub/Sub',
        'Đưa envelope tới subscriber từng Gateway pod; không lưu history',
        'Pub/Sub · PSUBSCRIBE',
      ),
      s(
        'signaling-gateway',
        'Parse envelope; server.local.to(user room).emit để tránh duplicate',
        'WebSocket · domain event',
      ),
      fe(
        'Nhận event và invalidate/refetch state theo contract',
        'REST · domain state API',
      ),
      c(
        'Domain producer',
        'Trả durable state theo quyền caller',
        'REST result',
      ),
      fe(
        'Reconnect dùng REST phục hồi event đã mất; disconnect giải phóng lease',
        'WebSocket disconnect / Redis lease release tại Gateway',
      ),
    ],
    caution:
      'Socket.IO cluster adapter có Redis pub/sub connections riêng, không chung subscriber. Pub/Sub at-most-once; quota lease TTL xử lý pod chết. Core API quyết business, Gateway không query PostgreSQL.',
    sources: [
      'docs/services/realtime-gateway.md',
      'apps/signaling-gateway/src/app/signaling.gateway.ts',
      'apps/signaling-gateway/src/app/connection-quota.service.ts',
    ],
  },
};
