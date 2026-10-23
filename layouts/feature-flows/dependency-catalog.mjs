// Existing implementation projection only. All modules below run inside core-api.
// review-module: N/A — diagram data; no business implementation changes.
const module = (name, uses, entities, actions) => ({
  name,
  uses,
  entities,
  actions,
});
const redis = (
  business = [],
  signaling = false,
  mediaCluster = false,
  httpThrottle = true,
) => ({
  business: httpThrottle
    ? [
        {
          role: 'rate limit',
          label: 'HTTP throttle nếu THROTTLE_STORAGE=redis',
          direction: 'both',
        },
        ...business,
      ]
    : business,
  signaling,
  mediaCluster,
});
const bus = (label) => ({ role: 'Pub/Sub', label, direction: 'write' });
const provider = (
  id,
  lines,
  request = '',
  callback = '',
  direct = '',
  direction = 'both',
  condition = '',
  redis = '',
) => ({ id, lines, request, callback, direct, direction, redis, condition });
const push = () =>
  provider(
    'push',
    ['FCM / APNs / Web Push', 'Notification push adapters'],
    'Push sau Notification commit',
    '',
    'Provider → device / Service Worker',
    'to-client',
    'Provider + credentials; native token cần caller; Web Push opt-in',
  );
const storage = () =>
  provider(
    'storage',
    ['S3 / R2 / MinIO', 'Ảnh: quarantine → final'],
    'Presign, kiểm tra object, promote',
    'Metadata + magic bytes khi resolve asset',
    'Client PUT presigned / đọc URL final',
    'both',
    'MEDIA_STORAGE_PROVIDER; dev không upload binary thật',
  );
const broker = () =>
  provider(
    'broker',
    ['Kafka', 'Economy events + dead letter'],
    'OutboxRelay → litmatch.economy.events / DLQ',
    '',
    '',
    'to-provider',
    'ECONOMY_OUTBOX_RELAY_ENABLED; chưa có domain consumer đăng ký',
  );
const livekit = (path) =>
  provider(
    'livekit',
    ['media-server / LiveKit', 'WebRTC audio + room control'],
    path.includes('/calling/')
      ? 'Delete room + listParticipantIdentities để reconciliation'
      : 'Create/delete room, roomExists, removeParticipant, update media grant',
    `${path}: signed participant/room events`,
    'Client ↔ LiveKit: audio WebRTC',
    'both',
    'Token JWT ký local trong core-api; LIVEKIT_URL / LIVEKIT_API_URL + API key/secret; ICE/TURN theo deployment',
    'LiveKit self-host: Redis cluster/message bus khi cấu hình; LiveKit Cloud do provider quản lý',
  );
const economyEntities = [
  'LedgerAccount',
  'LedgerTransaction',
  'LedgerEntry',
  'Wallet',
  'OutboxEvent',
];
const economy = () =>
  module('Economy', 'Diamond / PTS qua ledger writer', economyEntities, [
    'Lock Wallet; DB-unique idempotencyKey',
    'Double-entry append-only; snapshot + outbox',
  ]);
const notification = () =>
  module(
    'Notification',
    'In-app trước push; gọi qua DI',
    ['Notification', 'WebPushSubscription'],
    [
      'createWithManager hoặc create sau persist',
      'sendPush best-effort sau commit',
    ],
  );
const friend = () =>
  module(
    'Friend',
    'Quan hệ + chat lâu dài',
    ['Friendship', 'Conversation', 'Message'],
    [
      'ensureFriendship cùng transaction',
      'Import chat nếu flow có message seed',
    ],
  );
const safety = () =>
  module(
    'Safety',
    'Chặn block/report tại hành động',
    ['Block', 'Report'],
    ['canPair / isBlocked / hidden-set', 'Đọc log PostgreSQL hiện tại'],
  );

export const dependencyCatalog = {
  '04-party-room': {
    modules: [
      module(
        'PartyRoom',
        'Room, role và consent',
        ['PartyRoom', 'PartyRoomMember', 'PartyRoomComment'],
        [
          'Lock room; join/leave; invite → accept',
          'Audience canPublish=false; comments append-only',
        ],
      ),
      module(
        'User',
        'Chọn media region của host',
        ['User'],
        ['Đọc User.region lúc tạo room'],
      ),
      module(
        'Gift',
        'Nhánh REST tặng quà trong Party',
        ['Gift', 'GiftEvent'],
        [
          'Gift gọi PartyRoom kiểm tra active members',
          'Gift gọi Economy + Notification qua DI',
        ],
      ),
      economy(),
      notification(),
    ],
    entities: ['PartyRoom', 'PartyRoomMember', 'PartyRoomComment'],
    redis: redis([bus('party.* + gift.sent sau commit')], true, true),
    externals: [livekit('/api/v1/party/webhooks/livekit'), push(), broker()],
    operations: [
      'PartyRoomSweeperService: host/member disconnect grace',
      'Sweeper đối chiếu SFU, đóng phòng stale và dọn room',
      'REST host leave đóng ngay; reconnect trong grace giữ room',
      'Nhánh Gift: Economy outbox/reconciliation theo cấu hình',
    ],
    notes:
      'Party gọi User trực tiếp; nhánh Gift là endpoint context riêng và gọi ngược Party qua DI, không phải Party gọi Economy trực tiếp. PostgreSQL giữ membership/role; Gateway giữ presence/quota Redis, LiveKit có Redis riêng cho cluster; push chỉ thuộc nhánh Gift.',
    sources: [
      'apps/core-api/src/modules/party-room/party-room.module.ts',
      'apps/core-api/src/modules/gift/gift.module.ts',
      'apps/core-api/src/modules/gift/gift.service.ts',
      'apps/core-api/src/modules/party-room/jobs/party-room-sweeper.service.ts',
      'apps/media-server/livekit.yaml',
      'docs/services/realtime-gateway.md',
    ],
  },
  '02-soul-match': {
    modules: [
      module(
        'SoulMatch',
        'Chat ẩn danh + rating',
        ['SoulChatMessage', 'SoulMatchRating'],
        [
          'Message idempotent; phase theo giờ server',
          'Lock session; mỗi người một verdict',
        ],
      ),
      module(
        'Matching',
        'Session đầu vào và explicit end',
        ['MatchSession', 'MatchTicket'],
        [
          'Đọc confirmed soul session + membership',
          'Kết thúc session và nhả tickets',
        ],
      ),
      friend(),
      module(
        'User',
        'Ban guard và profile sau mutual',
        ['User'],
        [
          'Re-check user status khi gửi',
          'Chỉ trả partner profile khi Friendship tồn tại',
        ],
      ),
    ],
    entities: [
      'SoulChatMessage',
      'SoulMatchRating',
      'MatchSession',
      'Friendship',
      'Conversation',
      'Message',
    ],
    redis: redis([bus('soul.message / matched / ended')], true),
    externals: [],
    operations: [
      'Phase chatting/rating/closed xác định khi đọc',
      'Mutual-like import chat cùng transaction; giữ source append-only',
      'Không có Soul sweeper hay push notification cho Soul message',
    ],
    notes:
      'PostgreSQL giữ rating/message và Friendship; Redis chỉ HTTP throttle có điều kiện và realtime bus. Matching đã tạo session trước flow này; không vẽ lại matching queue. Notification của match confirmation thuộc flow Matching, không phải Soul message.',
    sources: [
      'apps/core-api/src/modules/soul-match/soul-match.module.ts',
      'apps/core-api/src/modules/soul-match/soul-match.service.ts',
      'apps/core-api/src/modules/matching/matching.service.ts',
      'apps/core-api/src/modules/friend/friend.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '03-voice-match': {
    modules: [
      module(
        'Calling',
        'Voice lifecycle + consent',
        ['CallSession', 'VoiceMatchReaction'],
        [
          'Join/mint token; lock CallSession',
          'Immutable likes; server end + cleanup',
        ],
      ),
      module(
        'Matching',
        'Voice session và nhả active state',
        ['MatchSession', 'MatchTicket'],
        [
          'Verify confirmed voice membership',
          'Chốt session/tickets ended khi call kết thúc',
        ],
      ),
      module(
        'Friend',
        'Mutual-like và friend call riêng',
        ['Friendship', 'Conversation', 'ProfileFollow'],
        [
          'ensureFriendship trong transaction likes',
          'Friend call: follow active hai chiều',
        ],
      ),
      module(
        'User',
        'LiveKit region và identity',
        ['User'],
        ['Đọc region để chọn media URL'],
      ),
    ],
    entities: [
      'CallSession',
      'VoiceMatchReaction',
      'MatchSession',
      'Friendship',
      'Conversation',
      'ProfileFollow',
    ],
    redis: redis([bus('call.ended sau commit')], true, true),
    externals: [livekit('/api/v1/calling/webhooks/livekit')],
    operations: [
      'CallTickerService: pending timeout, active 420s, reconnect grace',
      'GET call đối chiếu LiveKit participants khi webhook bị mất',
      'Mọi nhánh ended dọn LiveKit room best-effort',
    ],
    notes:
      'Calling không dùng Economy và không tính Diamond theo phút. Media cluster Redis thuộc LiveKit; Socket.IO Redis quota/presence thuộc signaling-gateway. PostgreSQL giữ CallSession và likes; pending chỉ active khi đủ hai participant.',
    sources: [
      'apps/core-api/src/modules/calling/calling.module.ts',
      'apps/core-api/src/modules/calling/calling.service.ts',
      'apps/core-api/src/modules/calling/jobs/call-ticker.service.ts',
      'apps/core-api/src/modules/calling/webhooks/livekit-webhook.controller.ts',
      'apps/media-server/livekit.yaml',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '05-movie-match-movie-night': {
    modules: [
      module(
        'MovieMatch',
        'Friend + anonymous watch',
        [
          'MovieSession',
          'MovieSessionActiveParticipant',
          'MovieMatchQueueEntry',
          'MovieSessionMessage',
        ],
        [
          'PG queue + advisory lock; participant slots',
          'Playback state; anonymous chat/rating/reactions',
        ],
      ),
      module(
        'Friend',
        'Friend guard, chat và mutual-like',
        ['Friendship', 'Conversation', 'Message'],
        [
          'areFriends cho friend mode',
          'Anonymous matched: ensureFriendship; không import chat',
        ],
      ),
      safety(),
    ],
    entities: [
      'MovieSession',
      'MovieSessionActiveParticipant',
      'MovieMatchQueueEntry',
      'MovieSessionMessage',
    ],
    redis: redis([bus('movie.* playback/chat/reaction')], true),
    externals: [
      provider(
        'video-source',
        ['YouTube', 'Client phát video trực tiếp'],
        '',
        '',
        'Client → YouTube: video playback',
        'to-provider',
        'Friend URL allowlist; anonymous server chọn video',
      ),
    ],
    operations: [
      'Lazy-expire anonymous queue/session khi đọc hoặc thao tác',
      'Friend mode chỉ explicit end, không ticker',
      'Anonymous reaction ephemeral; controller HTTP throttle',
    ],
    notes:
      'Queue, participants và playback durable đều ở PostgreSQL; Redis không phải queue Movie. Không có LiveKit/storage/transcode phía server; YouTube chỉ là video source ở client. Chat friend mode tiếp tục pipeline Friend riêng.',
    sources: [
      'apps/core-api/src/modules/movie-match/movie-match.module.ts',
      'apps/core-api/src/modules/movie-match/movie-match.service.ts',
      'apps/core-api/src/modules/movie-match/entities/movie-match-anon.entities.ts',
      'docs/services/movie-match-service.md',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '06-palm-match': {
    modules: [
      module(
        'PalmMatch',
        'Reading + anonymous session',
        [
          'PalmReadingTemplate',
          'PalmMatchQueueEntry',
          'PalmMatchSession',
          'PalmMatchActiveParticipant',
        ],
        [
          'Seed reading theo user/category/ngày UTC',
          'PG advisory lock; flip + immutable rating',
        ],
      ),
      friend(),
      safety(),
    ],
    entities: [
      'PalmReadingTemplate',
      'PalmMatchQueueEntry',
      'PalmMatchSession',
      'PalmMatchActiveParticipant',
    ],
    redis: redis(),
    externals: [],
    operations: [
      'Lazy-expire queue/session; dismiss active cancel cho cả hai',
      'Mutual-like tạo Friendship + Conversation cùng transaction',
      'Không realtime producer, không AI provider, không Economy',
    ],
    notes:
      'Palm có PostgreSQL queue, advisory lock và session snapshot; không có Redis matcher/queue riêng. Redis chỉ có HTTP throttle chung nếu bật. Sign hiện khi chủ lá flip; compatibility/fortune và rating cần đủ hai flip.',
    sources: [
      'apps/core-api/src/modules/palm-match/palm-match.module.ts',
      'apps/core-api/src/modules/palm-match/palm-match.service.ts',
      'apps/core-api/src/modules/palm-match/entities/palm-match-session.entity.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '07-feed-va-stories': {
    modules: [
      module(
        'Feed / Story',
        'Post audience + Story TTL',
        ['Post', 'Comment', 'Reaction', 'Story', 'StoryView'],
        [
          'Audience/block guard; atomic counters',
          'Story unique viewers + expiry lúc đọc',
        ],
      ),
      module(
        'Media',
        'Ảnh thuộc caller, object đã validate',
        ['ImageAsset'],
        [
          'resolve imageAssetId; kiểm tra owner/status',
          'Promote quarantine sang final key bất biến',
        ],
      ),
      module(
        'Friend',
        'Audience và Story reply thành DM',
        [
          'Friendship',
          'Conversation',
          'Message',
          'ConversationStreak',
          'ConversationMemberState',
        ],
        [
          'areFriends / listFriendIds cho audience/ring',
          'Reply: sendMessage + attachment snapshot',
        ],
      ),
      safety(),
      notification(),
      module(
        'User',
        'Public author profiles',
        ['User'],
        ['Batch hydrate tác giả post/comment'],
      ),
    ],
    entities: [
      'Post',
      'Comment',
      'Reaction',
      'Story',
      'StoryView',
      'ImageAsset',
    ],
    redis: redis([bus('Chỉ nhánh Story reply: friend.message / streak')], true),
    externals: [storage(), push()],
    operations: [
      'StorySweeperService dọn Story hết TTL + views cascade',
      'Like/comment ghi Notification cùng transaction; push sau commit',
      'Story reply: message persist rồi streak/notification riêng',
    ],
    notes:
      'Post/story feed không có fanout riêng; signaling chỉ thuộc Story reply đi qua Friend Chat. Feed toàn cục chỉ public, Story ring là mình + bạn bè. PostgreSQL giữ nội dung/counters; storage giữ ảnh, Redis không giữ timeline nguồn sự thật.',
    sources: [
      'apps/core-api/src/modules/feed/feed.module.ts',
      'apps/core-api/src/modules/feed/feed.service.ts',
      'apps/core-api/src/modules/feed/services/story.service.ts',
      'apps/core-api/src/modules/feed/jobs/story-sweeper.service.ts',
      'apps/core-api/src/modules/media/media.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '08-avatar-tuy-chinh': {
    modules: [
      module(
        'Avatar',
        'Layer catalog + inventory + equip',
        ['AvatarAsset', 'UserAvatarItem', 'UserAvatarConfig'],
        ['Free claim / paid buy', 'Equip check active + slot + ownership'],
      ),
      economy(),
    ],
    entities: ['AvatarAsset', 'UserAvatarItem', 'UserAvatarConfig'],
    redis: redis(),
    externals: [broker()],
    operations: [
      'Paid: Economy.spendDiamond idempotent → ownership idempotent',
      'Economy outbox relay/reconciliation theo cấu hình',
      'Không avatar job, không realtime producer',
    ],
    notes:
      'Layer imageUrl là catalog data, không có upload provider call trong Avatar flow. PostgreSQL giữ ownership/config; Wallet là ledger snapshot. Kafka chỉ nhánh outbox Economy nếu relay bật, không phải Avatar event bus.',
    sources: [
      'apps/core-api/src/modules/avatar/avatar.module.ts',
      'apps/core-api/src/modules/avatar/avatar.service.ts',
      'apps/core-api/src/modules/economy/services/ledger.service.ts',
      'apps/core-api/src/modules/economy/jobs/outbox-relay.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '09-diamond-top-up-va-vip': {
    modules: [
      module(
        'Economy',
        'Catalog + top-up + VIP + refund',
        [
          'IapProduct',
          'IapReceipt',
          'PayosPackage',
          'PayosPaymentOrder',
          'VipPlan',
        ],
        [
          'Verify receipt / verified payOS webhook',
          'Lock Wallet; credit/debit/VIP/reversal',
        ],
      ),
      module('Ledger', 'Writer duy nhất trong Economy', economyEntities, [
        'LedgerTransaction.idempotencyKey unique DB',
        'LedgerEntry append-only double-entry theo currency',
      ]),
      module(
        'Events infrastructure',
        'Relay outbox ra Kafka khi bật',
        ['OutboxEvent'],
        [
          'EventBusPort → KafkaEventBusAdapter',
          'SKIP LOCKED; retry + dead-letter marker',
        ],
      ),
    ],
    entities: [
      ...economyEntities,
      'IapProduct',
      'IapReceipt',
      'PayosPackage',
      'PayosPaymentOrder',
      'VipPlan',
    ],
    redis: redis(),
    externals: [
      provider(
        'payos',
        ['payOS', 'Payment link / VietQR'],
        'Tạo/cancel payment link theo server order',
        '/api/v1/economy/webhooks/payos: HMAC rồi credit',
        'Client → payOS checkout / payment',
        'both',
        'PAYOS credentials + redirect URL',
      ),
      provider(
        'apple-iap',
        ['Apple App Store', 'Receipt + refund history'],
        'Server verify receipt + Get Refund History',
        '/api/v1/economy/webhooks/apple: signed refund/revoke',
        'Client → Apple: IAP purchase',
        'both',
        'Store verifier + credentials; dev chỉ non-production',
      ),
      provider(
        'google-iap',
        ['Google Play', 'Purchase token + Voided Purchases'],
        'Verify token; poll Voided Purchases API',
        '/api/v1/economy/webhooks/google/rtdn: OIDC, tín hiệu phụ',
        'Client → Google: IAP purchase',
        'both',
        'Google service account; RTDN không tự refund',
      ),
      broker(),
    ],
    operations: [
      'OutboxRelayService: publish/retry/dead-letter nếu bật',
      'ReconciliationService: fast + deep read-only ledger checks',
      'IapRefundPollService: Apple refund lookup + Google voided purchases',
      'VIP active xác định khi đọc; corrections bằng reversal',
    ],
    notes:
      'PostgreSQL là nguồn tài chính; số dư không nằm Redis. LedgerTransaction là tên entity code cho bảng transactions. Google RTDN không đảo tiền, polling voided là nguồn refund chính. Outbox ghi dù relay tắt; chưa có domain consumer Kafka đăng ký.',
    sources: [
      'apps/core-api/src/modules/economy/economy.module.ts',
      'apps/core-api/src/modules/economy/entities/transaction.entity.ts',
      'apps/core-api/src/modules/economy/entities/iap.entities.ts',
      'apps/core-api/src/modules/economy/entities/payos.entities.ts',
      'apps/core-api/src/modules/economy/webhooks/economy-webhooks.controller.ts',
      'apps/core-api/src/modules/economy/jobs/outbox-relay.service.ts',
      'apps/core-api/src/modules/economy/jobs/reconciliation.service.ts',
      'apps/core-api/src/modules/economy/jobs/iap-refund-poll.service.ts',
      'apps/core-api/src/common/events/events.module.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '11-gift': {
    modules: [
      module(
        'Gift',
        'Catalog + đúng một context/event',
        ['Gift', 'GiftEvent'],
        [
          'Room / video / profile recipient guard',
          'GiftEvent cùng transaction với tiền',
        ],
      ),
      economy(),
      notification(),
      module(
        'PartyRoom',
        'Nhánh room context',
        ['PartyRoom', 'PartyRoomMember'],
        ['Kiểm tra phòng/member active', 'Lấy recipients cho gift.sent'],
      ),
      module(
        'ShortVideo',
        'Nhánh video context',
        ['Video'],
        ['getVideoOrThrow; suy author làm recipient'],
      ),
      module(
        'Friend.ProfileSocial',
        'Nhánh profile context',
        ['Conversation', 'ProfileChatContact'],
        ['Tạo profile chat/contact trong transaction Gift'],
      ),
      module(
        'User',
        'Guest recipient và eligibility',
        ['User'],
        ['Đọc người nhận; guest có PTS=0'],
      ),
    ],
    entities: ['Gift', 'GiftEvent', ...economyEntities],
    redis: redis([bus('gift.sent chỉ nhánh Party Room')], true),
    externals: [push(), broker()],
    operations: [
      'Ledger DIA/PTS và GiftEvent atomic; Notification cùng manager',
      'Sau commit: push; Party mới có room fanout',
      'Economy reconciliation/outbox theo cấu hình; chưa có Gift refund',
    ],
    notes:
      'Gift endpoint không gọi LiveKit để truyền quà và không gọi payment provider để trừ Diamond; nó gọi Economy trong process. PostgreSQL giữ ledger/event; Kafka chỉ Economy outbox, Notification vẫn DI, video/profile không fanout gift.sent phòng.',
    sources: [
      'apps/core-api/src/modules/gift/gift.module.ts',
      'apps/core-api/src/modules/gift/gift.service.ts',
      'apps/core-api/src/modules/economy/economy.service.ts',
      'apps/core-api/src/modules/friend/services/profile-social.service.ts',
      'apps/core-api/src/modules/notification/notification.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '12-mini-game': {
    modules: [
      module(
        'MiniGame',
        'Rock-paper-scissors',
        ['MiniGameSession', 'MiniGameActiveParticipant'],
        [
          'Unique active participant; one immutable move/user',
          'Resolve hai moves; cancel có điều kiện',
        ],
      ),
      module(
        'Friend',
        'Chỉ người đã có Friendship',
        ['Friendship'],
        ['areFriends trước khi tạo session'],
      ),
    ],
    entities: ['MiniGameSession', 'MiniGameActiveParticipant'],
    redis: redis([bus('minigame.session.started / resolved')], true),
    externals: [],
    operations: [
      'Conditional move/cancel transition; nhả active slots khi terminal',
      'Không timer/sweeper/reward trong slice này',
    ],
    notes:
      'Moves/result ở PostgreSQL; chỉ resolved mới công bố opponentMove. MiniGame không tạo message, không gọi Economy hay Notification. Signaling Redis giữ transport quota/presence, không game state.',
    sources: [
      'apps/core-api/src/modules/mini-game/mini-game.module.ts',
      'apps/core-api/src/modules/mini-game/mini-game.service.ts',
      'apps/core-api/src/modules/mini-game/entities/mini-game-active-participant.entity.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '13-trust-safety': {
    modules: [
      module(
        'Safety',
        'Report + Block nguồn sự thật',
        ['Report', 'Block'],
        ['Append report/block/unblock', 'canPair, isBlocked, hidden-set'],
      ),
      module(
        'User',
        'Report-user trust penalty',
        ['User'],
        ['adjustTrustScore cùng transaction Report'],
      ),
      module(
        'Matching / Discovery',
        'Consumers của Safety qua DI',
        ['MatchSession', 'MatchInvite', 'UserLocation'],
        [
          'Matching/Invite re-check canPair',
          'Discovery getHiddenUserIds khi browse/nearby',
        ],
      ),
      module(
        'Friend / Feed',
        'Consumers của block guard',
        ['Conversation', 'Post', 'Story'],
        ['Chat và nội dung kiểm tra block lúc hành động'],
      ),
      module(
        'ShortVideo / Admin',
        'Report nội dung + moderation',
        ['Video', 'AdminAuditLog', 'AdminRolePermission'],
        [
          'Video report distinct; auto-hide',
          'Admin ban/moderate có quyền + audit',
        ],
      ),
    ],
    entities: ['Report', 'Block', 'User'],
    redis: redis(),
    externals: [],
    operations: [
      'Report cooldown/daily cap; không auto-ban theo trustScore',
      'Video report không trừ trustScore tác giả',
      'Không Safety outbox/job/push producer trong flow report/block',
    ],
    notes:
      'Consumers gọi Safety, không phải Safety gọi ngược các domain. PostgreSQL giữ append-only evidence; block active xác định từ action mới nhất. Redis chỉ HTTP throttler chung có điều kiện, không cache quyền/report truth.',
    sources: [
      'apps/core-api/src/modules/safety/safety.module.ts',
      'apps/core-api/src/modules/safety/safety.service.ts',
      'apps/core-api/src/modules/matching/services/invite.service.ts',
      'apps/core-api/src/modules/discovery/discovery.service.ts',
      'apps/core-api/src/modules/admin/admin.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '15-runtime-availability': {
    modules: [
      module(
        'Capabilities',
        'Contract runtime read-only',
        [],
        [
          'Đọc ConfigService đã validate',
          'Provider credentials + maintenance → enabled/disabled/beta',
        ],
      ),
      module(
        'Config / provider factories',
        'Readiness theo environment',
        [],
        [
          'Auth, payOS/IAP, video, push config',
          'Endpoint nghiệp vụ giữ guard riêng',
        ],
      ),
    ],
    entities: [],
    redis: redis([], false, false, false),
    externals: [],
    operations: [
      'GET /capabilities không gọi provider network',
      'Public + SkipThrottle; không DB write hay job',
    ],
    notes:
      'Availability đọc config trong process, không query PostgreSQL/Redis và không phải health probe provider. Danh sách capability bao gồm provider readiness nhưng endpoint này không tạo network branch tới provider.',
    sources: [
      'apps/core-api/src/app/capabilities.controller.ts',
      'apps/core-api/src/app/capabilities.service.ts',
      'apps/core-api/src/config/capabilities.ts',
    ],
  },
  '16-friend-va-chat-1-1': {
    modules: [
      module(
        'Friend',
        'Quan hệ + Conversation + message',
        [
          'Friendship',
          'Conversation',
          'Message',
          'ConversationMemberState',
          'ConversationStreak',
          'ProfileFollow',
          'ProfileChatContact',
        ],
        [
          'Mutual-like; profile direct first-contact',
          'Idempotent message + read/mute + streak',
        ],
      ),
      safety(),
      notification(),
      module(
        'Media',
        'Nhánh ảnh chat',
        ['ImageAsset'],
        ['Resolve ảnh owner; immutable final URL'],
      ),
      module(
        'User',
        'Profile public + privacy/presence',
        ['User', 'PrivacySetting'],
        [
          'Hydrate profile; privacy check',
          'Endpoint profile presence đọc Redis lease',
        ],
      ),
      module(
        'Gift / Economy',
        'Nhánh vượt ngưỡng first-contact',
        ['Gift', 'GiftEvent', ...economyEntities],
        ['Gift mở Conversation/contact trong transaction tiền'],
      ),
      module(
        'Calling',
        'Friend call là nhánh riêng',
        ['CallSession', 'ProfileFollow'],
        ['Reciprocal follow trước join; không 420s limit'],
      ),
    ],
    entities: [
      'Friendship',
      'Conversation',
      'Message',
      'ConversationMemberState',
      'ConversationStreak',
      'ProfileFollow',
      'ProfileChatContact',
    ],
    redis: redis(
      [
        bus('friend.message / friend.streak.*'),
        {
          role: 'presence',
          label: 'User đọc realtime:presence khi xem profile',
          direction: 'read',
        },
      ],
      true,
      true,
    ),
    externals: [
      storage(),
      push(),
      broker(),
      livekit('/api/v1/calling/webhooks/livekit'),
    ],
    operations: [
      'StreakWarningJob: UTC warning + Notification/push',
      'Streak transaction riêng sau message persist; lỗi không rollback message',
      'Friend call: CallTicker pending/grace; không Voice Match free limit',
      'Profile Gift: Economy outbox/reconciliation theo cấu hình',
    ],
    notes:
      'Các provider là nhánh có điều kiện: storage cho ảnh, push khi không mute, Kafka cho Gift debit và LiveKit cho friend call. Message không cần follow; call cần follow hai chiều. PostgreSQL giữ chat/read/mute; Redis presence do signaling-gateway ghi, User chỉ đọc.',
    sources: [
      'apps/core-api/src/modules/friend/friend.module.ts',
      'apps/core-api/src/modules/friend/friend.service.ts',
      'apps/core-api/src/modules/friend/services/profile-social.service.ts',
      'apps/core-api/src/modules/friend/jobs/streak-warning.job.ts',
      'apps/core-api/src/modules/user/user.controller.ts',
      'apps/core-api/src/modules/user/services/user-presence.service.ts',
      'apps/core-api/src/modules/calling/calling.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '17-dang-ky-onboarding-va-guest': {
    modules: [
      module(
        'Auth',
        'Guest, OTP, social, upgrade',
        ['AuthIdentity', 'PhoneOtp', 'RefreshToken'],
        [
          'Verify provider identity; DB unique identity',
          'Refresh rotation/reuse; upgrade revoke old sessions',
        ],
      ),
      module(
        'User',
        'User/profile/privacy giữ userId',
        ['User', 'PrivacySetting'],
        [
          'Tìm/tạo User; PATCH me onboarding',
          'Profile privacy trong PostgreSQL',
        ],
      ),
    ],
    entities: [
      'User',
      'PrivacySetting',
      'AuthIdentity',
      'PhoneOtp',
      'RefreshToken',
    ],
    redis: redis(),
    externals: [
      provider(
        'identity',
        ['Google / Apple / Facebook', 'OIDC JWT / opaque token'],
        'JWKS verify issuer/audience; Facebook debug_token',
        'JWKS/Graph HTTP response; không backend OAuth webhook',
        'Client ↔ identity provider: sign-in',
        'both',
        'AUTH provider client/app credentials; guest/OTP không dùng provider này',
      ),
    ],
    operations: [
      'PhoneOtp quota theo DB count; attempts/consume conditional update',
      'OTP hiện trả code cho client, không có SMS send',
      'Guest upgrade giữ userId; identity conflict không merge',
      'Refresh/logout dùng httpOnly cookie + CSRF guard',
    ],
    notes:
      'Auth sessions/OTP/identity ở PostgreSQL; Redis chỉ HTTP/IP throttle chung nếu bật. OTP không có SMS provider trong implementation hiện tại; identity network branch chỉ social login/upgrade. Provider verification nhận token do client gửi qua REST.',
    sources: [
      'apps/core-api/src/modules/auth/auth.module.ts',
      'apps/core-api/src/modules/auth/auth.service.ts',
      'apps/core-api/src/modules/auth/services/otp.service.ts',
      'apps/core-api/src/modules/auth/services/social-verifier.ts',
      'apps/core-api/src/modules/auth/repositories/typeorm-refresh-session.adapter.ts',
      'apps/core-api/src/modules/user/user.controller.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '18-discovery-nearby-va-direct-invite': {
    modules: [
      module(
        'Discovery',
        'Browse + Nearby reciprocity',
        ['UserLocation', 'DiscoverySetting'],
        [
          'Quantize lúc ghi; jitter + distanceBucket',
          'Freshness/filter trực tiếp khi đọc',
        ],
      ),
      module(
        'User',
        'Profiles + Nearby privacy',
        ['User', 'PrivacySetting'],
        ['browsePage / findActiveByIds', 'PrivacySettingsService theo user'],
      ),
      safety(),
      module(
        'Matching.Invite',
        'Nhánh direct Soul/Voice consent',
        ['MatchInvite', 'MatchTicket', 'MatchSession'],
        [
          'Rate limit; TTL; pending pair unique',
          'Accept tạo session trực tiếp, không Redis queue',
        ],
      ),
      notification(),
      module(
        'Friend / Gift',
        'Nhánh profile direct chat',
        [
          'ProfileFollow',
          'ProfileChatContact',
          'Conversation',
          'Gift',
          'GiftEvent',
        ],
        [
          'First-contact dưới ngưỡng mở trực tiếp',
          'Vượt ngưỡng qua Gift + Economy transaction',
        ],
      ),
      economy(),
    ],
    entities: [
      'UserLocation',
      'DiscoverySetting',
      'MatchInvite',
      'MatchTicket',
      'MatchSession',
    ],
    redis: redis(
      [
        {
          role: 'rate limit',
          label: 'Nearby location updates + queries',
          direction: 'both',
        },
        {
          role: 'rate limit',
          label: 'Matching Invite per-user/hour',
          direction: 'both',
        },
        bus('match.confirmed / invite events'),
      ],
      true,
    ),
    externals: [push(), broker()],
    operations: [
      'InviteSweeperService housekeeping; lazy expiry tại endpoint',
      'Tắt nearbyVisible xoá location cùng transaction',
      'Safety fail accept → declined; busy → giữ pending',
      'Profile Gift nhánh riêng: Economy outbox/reconciliation',
    ],
    notes:
      'Discovery không gọi Matching service để browse; CTA Invite là request riêng tới Matching trong cùng core-api. Invites và location durable ở PostgreSQL; Redis chỉ rate counters/event bus. Push thuộc invite Notification hoặc Gift; Kafka chỉ profile Gift, không Discovery broker consumer.',
    sources: [
      'apps/core-api/src/modules/discovery/discovery.module.ts',
      'apps/core-api/src/modules/discovery/nearby.service.ts',
      'apps/core-api/src/modules/matching/services/invite.service.ts',
      'apps/core-api/src/modules/matching/jobs/invite-sweeper.service.ts',
      'apps/core-api/src/modules/friend/services/profile-social.service.ts',
      'apps/core-api/src/modules/gift/gift.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '19-mood-va-conversation-streak': {
    modules: [
      module(
        'Mood',
        'Preset-only status events',
        ['MoodPreset', 'MoodStatusEvent'],
        ['Append set/clear idempotent', 'Latest event + TTL quyết định active'],
      ),
      safety(),
      module(
        'Friend.Streak',
        'Streak là sub-service Friend',
        ['Conversation', 'Message', 'ConversationStreak'],
        [
          'Activity UTC sau message trong transaction riêng',
          'Hai chiều/ngày; gap grace; milestone realtime',
        ],
      ),
      notification(),
    ],
    entities: ['MoodPreset', 'MoodStatusEvent', 'ConversationStreak'],
    redis: redis([bus('friend.streak.increased / at_risk')], true),
    externals: [push()],
    operations: [
      'StreakWarningJob: advisory singleton job + warning Notification/push',
      'Warning chỉ ghi lastWarningSentAt, không tăng/reset streak',
      'Mood và displayed streak hết hạn xác định khi đọc; không mood cron',
    ],
    notes:
      'Mood không realtime/push riêng; các nhánh transport thuộc streak. Milestone hiện có realtime, code không tạo milestone Notification; warning có in-app/push. PostgreSQL giữ dates/counters; Redis không lưu streak nguồn sự thật.',
    sources: [
      'apps/core-api/src/modules/mood/mood.module.ts',
      'apps/core-api/src/modules/mood/mood.service.ts',
      'apps/core-api/src/modules/friend/services/streak.service.ts',
      'apps/core-api/src/modules/friend/friend.service.ts',
      'apps/core-api/src/modules/friend/jobs/streak-warning.job.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '20-short-video': {
    modules: [
      module(
        'ShortVideo',
        'Lifecycle + ranking + interactions',
        ['Video', 'VideoView', 'VideoReaction', 'VideoComment'],
        [
          'Conditional uploading/processing/review/published',
          'Qualified view unique; atomic counters',
        ],
      ),
      module(
        'Friend',
        'Video following feed là graph bạn',
        ['Friendship'],
        ['listFriendIds để lọc following'],
      ),
      module(
        'Safety',
        'Report nội dung video',
        ['Report'],
        ['Distinct video reporters; không trust penalty'],
      ),
      module(
        'User',
        'Public author profiles',
        ['User'],
        ['Batch hydrate Video/VideoComment author'],
      ),
      module(
        'Admin',
        'Nhánh approve/reject/remove',
        ['AdminAuditLog', 'AdminRolePermission'],
        ['Guard role+permission; moderation + audit atomic'],
      ),
      module(
        'Gift',
        'Nhánh tặng tác giả video',
        ['Gift', 'GiftEvent'],
        ['Recipient suy từ video; validate visibility'],
      ),
      economy(),
      notification(),
    ],
    entities: ['Video', 'VideoView', 'VideoReaction', 'VideoComment', 'Report'],
    redis: redis(),
    externals: [
      provider(
        'video-storage',
        ['VideoStoragePort', 'Dev / unavailable adapters'],
        'Issue upload URL, delete failed object',
        '',
        'Client → storage: video upload',
        'both',
        'VIDEO_UPLOAD_ENABLED; production chưa có real vendor',
      ),
      provider(
        'transcode',
        ['VideoTranscodePort', 'Dev / unavailable adapters'],
        'Transcode khi finalize',
        'Dev trả kết quả đồng bộ; chưa có vendor webhook',
        '',
        'both',
        'Production view-only; vendor integration còn deferred',
      ),
      push(),
      broker(),
    ],
    operations: [
      'VideoSweeperService: timeout uploading → failed, dọn failed storage',
      'VideoRankingService tính score derived; fallback recent',
      'Reports vượt threshold: conditional published → removed',
      'Gift nhánh riêng: Economy outbox/reconciliation + Notification',
    ],
    notes:
      'Video binary/storage/transcode ports là hạ tầng, không thêm backend deployable. Chưa có vendor transcode webhook thật; không vẽ tương lai thành flow đã chạy. Redis chỉ HTTP throttle; Gift video dùng push, không room gift realtime; Kafka chỉ outbox Economy khi tặng quà.',
    sources: [
      'apps/core-api/src/modules/short-video/short-video.module.ts',
      'apps/core-api/src/modules/short-video/short-video.service.ts',
      'apps/core-api/src/modules/short-video/ports/video-provider.factory.ts',
      'apps/core-api/src/modules/short-video/jobs/video-sweeper.service.ts',
      'apps/core-api/src/modules/short-video/jobs/video-ranking.service.ts',
      'apps/core-api/src/modules/admin/admin.service.ts',
      'apps/core-api/src/modules/gift/gift.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '21-notification': {
    modules: [
      module(
        'Notification',
        'In-app durable + push side effect',
        ['Notification', 'WebPushSubscription'],
        [
          'createWithManager / create qua DI',
          'List/unread/read owner; push sau commit',
        ],
      ),
      module(
        'Matching / Invite',
        'Producer gọi Notification qua DI',
        ['MatchSession', 'MatchInvite'],
        ['Match confirmation / direct invite trigger'],
      ),
      module(
        'Friend',
        'Producer message và streak warning',
        ['Message', 'ConversationMemberState', 'ConversationStreak'],
        [
          'FriendMessage sau persist, trừ người đang mute',
          'StreakWarningJob tạo warning',
        ],
      ),
      module(
        'Gift / Feed / Admin',
        'Các producer có transaction',
        ['GiftEvent', 'Reaction', 'Comment', 'AdminAuditLog'],
        [
          'Gift/like/comment atomic với notification',
          'Admin broadcast rows + audit',
        ],
      ),
      module(
        'Platform',
        'Global push/analytics ports',
        [],
        [
          'FCM/APNs/WebPush adapters theo config',
          'AnalyticsPort có sẵn; chưa có trigger gọi trackAnalytics',
        ],
      ),
    ],
    entities: ['Notification', 'WebPushSubscription'],
    redis: redis(),
    externals: [push()],
    operations: [
      'Sau commit gửi native/web push best-effort',
      'Web Push 404/410: xoá subscription invalid',
      'Không Notification outbox/Kafka consumer/Redis queue',
      'PostHog port có cấu hình nhưng chưa có domain call site',
    ],
    notes:
      'Arrows producer → Notification là internal DI calls, không Notification gọi ngược producer. PostgreSQL giữ in-app rows/subscriptions; push tùy provider, native token phải được caller truyền. Không vẽ PostHog network trigger chưa có call site trong source.',
    sources: [
      'apps/core-api/src/modules/notification/notification.module.ts',
      'apps/core-api/src/modules/notification/notification.service.ts',
      'apps/core-api/src/modules/notification/services/web-push-subscription.service.ts',
      'apps/core-api/src/common/platform/platform.module.ts',
      'apps/core-api/src/common/platform/web-push-notification.adapter.ts',
      'apps/core-api/src/modules/matching/services/invite.service.ts',
      'apps/core-api/src/modules/admin/admin.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
  '22-support-va-admin-operations': {
    modules: [
      module(
        'Support',
        'Ticket owner + lifecycle',
        ['SupportTicket'],
        [
          'Unique user/key; payload conflict',
          'Lock ticket; validate status transition',
        ],
      ),
      module(
        'Admin / Audit',
        'Staff quyền và action audit',
        ['AdminRolePermission', 'AdminAuditLog'],
        [
          'RolesGuard + AdminPermissionGuard',
          'Audit actor/reason cùng transaction khi phù hợp',
        ],
      ),
      module(
        'User / Safety',
        'Users, ban và report queue',
        ['User', 'Report', 'Block'],
        ['Admin list/ban/unban; inspect reports'],
      ),
      module(
        'Gift / ShortVideo',
        'Catalog + moderation',
        ['Gift', 'Video'],
        ['Gift CRUD; approve/reject/remove Video'],
      ),
      economy(),
      notification(),
      module(
        'PartyRoom',
        'Admin close-room branch',
        ['PartyRoom', 'PartyRoomMember'],
        ['Close + audit transaction; SFU cleanup sau commit'],
      ),
    ],
    entities: ['SupportTicket', 'AdminRolePermission', 'AdminAuditLog'],
    redis: redis([bus('Admin đóng Party: party.room.closed')], true, true),
    externals: [push(), broker(), livekit('/api/v1/party/webhooks/livekit')],
    operations: [
      'Support status transitions: Closed terminal; replay cùng status hợp lệ',
      'Admin broadcast Notification rows + audit rồi push',
      'Admin refund/reversal qua Economy; reconciliation/outbox theo config',
      'Admin close room qua Party owner; cleanup SFU/realtime sau commit',
    ],
    notes:
      'Support ticket riêng chỉ PostgreSQL/REST; transport/provider branches thuộc admin action tương ứng, không mọi action đều gọi LiveKit/Kafka/push. apps/admin là frontend; module Admin trong core-api không được sửa ledger cũ. Redis không giữ permission nguồn sự thật.',
    sources: [
      'apps/core-api/src/modules/support/support.module.ts',
      'apps/core-api/src/modules/support/support.service.ts',
      'apps/core-api/src/modules/admin/admin.module.ts',
      'apps/core-api/src/modules/admin/admin.service.ts',
      'apps/core-api/src/modules/admin/services/admin-permission.guard.ts',
      'apps/core-api/src/common/audit/audit-log.entity.ts',
      'apps/core-api/src/modules/economy/jobs/outbox-relay.service.ts',
      'apps/core-api/src/app/app.module.ts',
    ],
  },
};

// Explicit caller → callee rows. A module group represents separate calls, not a new service.
const moduleLinks = {
  '02-soul-match': [
    ['SoulMatch', 'Matching', 'Đọc/end MatchSession'],
    ['SoulMatch', 'Friend', 'Mutual-like + import chat trong transaction'],
    ['SoulMatch', 'User', 'Ban guard + partner profile sau mutual'],
  ],
  '03-voice-match': [
    ['Calling', 'Matching', 'Verify session + chốt terminal'],
    ['Calling', 'Friend', 'Mutual likes → ensureFriendship'],
    [
      'Calling',
      'Friend',
      'ProfileSocial reciprocal follow',
      'Chỉ nhánh friend call',
    ],
    ['Calling', 'User', 'Chọn region media'],
  ],
  '04-party-room': [
    ['PartyRoom', 'User', 'Chọn LiveKit region của host'],
    [
      'Gift',
      'PartyRoom',
      'Validate active members + fanout list',
      'Nhánh Gift trong Party',
    ],
    ['Gift', 'Economy', 'Atomic DIA / PTS + GiftEvent', 'Nhánh Gift'],
    ['Gift', 'Notification', 'gift_received trong transaction', 'Nhánh Gift'],
  ],
  '05-movie-match-movie-night': [
    ['MovieMatch', 'Friend', 'areFriends cho friend mode'],
    ['MovieMatch', 'Safety', 'canPair lúc anonymous ghép cặp'],
    [
      'MovieMatch',
      'Friend',
      'Mutual-like → ensureFriendship',
      'Anonymous rating',
    ],
  ],
  '06-palm-match': [
    ['PalmMatch', 'Safety', 'canPair tại thời điểm ghép'],
    ['PalmMatch', 'Friend', 'Hai likes → ensureFriendship'],
  ],
  '07-feed-va-stories': [
    ['Feed / Story', 'Safety', 'Block guard lúc đọc/tương tác'],
    ['Feed / Story', 'Friend', 'Audience/ring graph bạn bè'],
    ['Feed / Story', 'Media', 'Resolve imageAssetId thuộc owner'],
    ['Feed / Story', 'Notification', 'Post like/comment; cùng manager'],
    [
      'Feed / Story',
      'Friend',
      'Story reply → sendMessage snapshot',
      'Chỉ Story reply',
    ],
    ['Feed / Story', 'User', 'Batch hydrate public authors'],
  ],
  '08-avatar-tuy-chinh': [
    ['Avatar', 'Economy', 'spendDiamond theo idempotencyKey', 'Paid item'],
  ],
  '09-diamond-top-up-va-vip': [
    ['Economy', 'Ledger', 'Record entries + Wallet + metadata'],
    [
      'Economy',
      'Events infrastructure',
      'OutboxRelay gọi EventBusPort.publish',
      'ECONOMY_OUTBOX_RELAY_ENABLED',
    ],
    ['Economy', 'Ledger', 'Refund → reversal entries mới', 'Refund đã verify'],
  ],
  '11-gift': [
    ['Gift', 'PartyRoom', 'Validate sender/receiver active', 'Room context'],
    ['Gift', 'ShortVideo', 'Visible video → author recipient', 'Video context'],
    [
      'Gift',
      'Friend.ProfileSocial',
      'Open chat/contact trong transaction',
      'Profile context',
    ],
    ['Gift', 'User', 'Guest recipient → PTS = 0'],
    ['Gift', 'Economy', 'DIA / PTS + GiftEvent atomic'],
    ['Gift', 'Notification', 'gift_received cùng manager'],
  ],
  '12-mini-game': [['MiniGame', 'Friend', 'areFriends trước createSession']],
  '13-trust-safety': [
    ['Safety', 'User', 'adjustTrustScore cùng Report transaction'],
    ['Matching / Discovery', 'Safety', 'canPair / hidden-set đúng thời điểm'],
    ['Friend / Feed', 'Safety', 'Block guard khi gửi/đọc/tương tác'],
    ['ShortVideo / Admin', 'Safety', 'Video report / report inspection'],
    ['ShortVideo / Admin', 'User', 'Admin ban/unban qua User API'],
  ],
  '15-runtime-availability': [
    [
      'Capabilities',
      'Config / provider factories',
      'Đọc config/readiness; không provider I/O',
    ],
  ],
  '16-friend-va-chat-1-1': [
    ['Friend', 'Safety', 'Block guard hai chiều'],
    ['Friend', 'Media', 'Resolve ảnh đính kèm của sender'],
    ['Friend', 'Notification', 'Message sau persist; warning job'],
    ['Friend', 'User', 'Hydrate public profiles'],
    [
      'Gift / Economy',
      'Friend',
      'Gift mở profile Conversation/contact',
      'Vượt first-contact threshold',
    ],
    [
      'Calling',
      'Friend',
      'ProfileSocial reciprocal follow',
      'Friend call là request riêng',
    ],
  ],
  '17-dang-ky-onboarding-va-guest': [
    ['Auth', 'User', 'Tìm/tạo User và guest upgrade'],
  ],
  '18-discovery-nearby-va-direct-invite': [
    ['Discovery', 'User', 'Profile query + Nearby privacy'],
    ['Discovery', 'Safety', 'hidden-set block/report'],
    ['Matching.Invite', 'Safety', 'canPair khi accept'],
    ['Matching.Invite', 'Notification', 'Invite_received sau persist'],
    [
      'Friend / Gift',
      'Economy',
      'Gift mở chat profile',
      'Nhánh Gift; direct chat không debit',
    ],
  ],
  '19-mood-va-conversation-streak': [
    ['Mood', 'Safety', 'Block-filter mood khi đọc'],
    [
      'Friend.Streak',
      'Notification',
      'Warning job → streak_at_risk',
      'Không milestone notification hiện tại',
    ],
  ],
  '20-short-video': [
    ['ShortVideo', 'Friend', 'listFriendIds cho following feed'],
    ['ShortVideo', 'Safety', 'reportVideo distinct reporters'],
    ['ShortVideo', 'User', 'Batch hydrate public author'],
    ['Admin', 'ShortVideo', 'approve/reject/remove + audit'],
    ['Gift', 'ShortVideo', 'Video visible → author recipient'],
    ['Gift', 'Economy', 'Gift DIA/PTS + GiftEvent atomic'],
    ['Gift', 'Notification', 'gift_received sau video Gift'],
  ],
  '21-notification': [
    ['Matching / Invite', 'Notification', 'Match confirmation / direct invite'],
    ['Friend', 'Notification', 'Unmuted message / streak warning'],
    ['Gift / Feed / Admin', 'Notification', 'Gift/interaction/broadcast'],
    ['Notification', 'Platform', 'sendPush sau commit; adapters theo config'],
  ],
  '22-support-va-admin-operations': [
    ['Admin / Audit', 'Support', 'setStatusWithManager + staffResponse'],
    ['Admin / Audit', 'User / Safety', 'User ban / report inspection'],
    ['Admin / Audit', 'Gift / ShortVideo', 'Catalog / video moderation'],
    ['Admin / Audit', 'Economy', 'Refund/reversal/catalog qua domain API'],
    ['Admin / Audit', 'Notification', 'Broadcast trong transaction + push'],
    ['Admin / Audit', 'PartyRoom', 'closeRoom + audit; cleanup sau commit'],
  ],
};
for (const [id, rows] of Object.entries(moduleLinks)) {
  dependencyCatalog[id].links = rows.map(
    ([from, to, label, condition = '']) => ({ from, to, label, condition }),
  );
}

const relations = {
  '02-soul-match': [
    ['SoulMatchRating', 'MatchSession', 'sessionId + rater unique'],
    ['SoulChatMessage', 'Message', 'Mutual-like import theo stable key'],
  ],
  '03-voice-match': [
    ['CallSession', 'MatchSession', 'match_session_id unique'],
    ['VoiceMatchReaction', 'CallSession', 'callId + raterUserId unique'],
  ],
  '04-party-room': [
    ['PartyRoomMember', 'PartyRoom', 'roomId; active khi leftAt null'],
    ['GiftEvent', 'LedgerTransaction', 'transactionId unique'],
  ],
  '05-movie-match-movie-night': [
    [
      'MovieSessionActiveParticipant',
      'MovieSession',
      'sessionId; PK userId chặn hai vai trò',
    ],
  ],
  '08-avatar-tuy-chinh': [
    ['UserAvatarItem', 'AvatarAsset', 'userId + avatarAssetId unique'],
  ],
  '09-diamond-top-up-va-vip': [
    ['LedgerEntry', 'LedgerTransaction', 'transactionId; append-only'],
    ['LedgerEntry', 'LedgerAccount', 'accountId + currency'],
    ['Wallet', 'LedgerEntry', 'Snapshot dẫn xuất từ ledger'],
  ],
  '11-gift': [['GiftEvent', 'LedgerTransaction', 'transactionId unique']],
  '17-dang-ky-onboarding-va-guest': [
    ['AuthIdentity', 'User', 'userId; provider + providerUid unique'],
  ],
};
for (const [id, rows] of Object.entries(relations)) {
  dependencyCatalog[id].entityRelations = rows.map(([from, to, label]) => ({
    from,
    to,
    label,
  }));
}
