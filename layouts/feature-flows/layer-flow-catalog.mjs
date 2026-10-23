// Actor assignment is explicit; no layer is inferred from action text.
// review-module: N/A — projection of implemented flows, no business changes.
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
const realtime = (domain, event, next) => [
  c(
    domain,
    `Sau commit: phát ${event} cho recipients đã authorize`,
    'Redis · PUBLISH',
  ),
  s(
    'Redis · Pub/Sub',
    `Chuyển ${event} trên per-user channel`,
    'Pub/Sub · PSUBSCRIBE',
  ),
  s(
    'signaling-gateway',
    'Relay envelope tới socket room từ JWT',
    `WebSocket · ${event}`,
  ),
  fe(next),
];

export const layerFlowCatalog = {
  '02-soul-match': {
    stages: [
      fe(
        'MatchSession soul confirmed; gửi message trong phòng ẩn danh',
        'REST · POST Soul messages + key',
      ),
      c(
        'SoulMatch',
        'Membership + ban + phase chatting; kiểm tra idempotency',
        'SQL · INSERT SoulChatMessage',
      ),
      pg('Lưu message append-only; replay trả message cũ'),
      ...realtime(
        'SoulMatch',
        'soul.message',
        'Đọc message; chọn verdict rude / boring / like',
      ),
      fe('Gửi rating; mỗi người một verdict', 'REST · POST Soul rating'),
      c(
        'SoulMatch',
        'Lock session; rating còn trong window và immutable',
        'SQL · INSERT rating + đọc hai verdict',
      ),
      pg(
        'Insert SoulMatchRating dưới session lock; trả verdicts trong transaction',
      ),
      branch(
        'core-api · SoulMatch',
        'Đã đủ hai like?',
        o(
          'MUTUAL-LIKE',
          [
            c(
              'SoulMatch → Friend',
              'Ensure Friendship + Conversation và import chat cùng transaction',
              'SQL · relations/messages + COMMIT',
            ),
            pg('Commit rating, Friendship, Conversation và Message seeds'),
            ...realtime(
              'SoulMatch',
              'soul.matched',
              'REST refetch; profile mở, Friend Chat bền vững',
            ),
          ],
          false,
        ),
        o(
          'CHƯA MUTUAL',
          [
            c(
              'SoulMatch',
              'Commit verdict; không mở profile hay Friendship',
              'SQL · COMMIT',
            ),
            pg('Giữ rating đã nhận, không tạo quan hệ mới'),
            c(
              'SoulMatch',
              'Trả phase/deadline và myVerdict; không lộ verdict đối phương',
              'REST result',
            ),
            fe('Còn window: chờ; hết chat: chỉ đọc/rate; hết rating: closed'),
          ],
          false,
        ),
      ),
    ],
    important:
      'Mutual-like giữ phase chatting vô thời hạn tới explicit end. End qua Matching chốt MatchSession và phát soul.ended; Friendship/Conversation không bị xoá.',
    caution:
      'Closed chưa mutual không đọc anonymous history; source messages vẫn append-only cho T&S. REST phục hồi event mất; replay message không tạo row thứ hai.',
    sources: [
      'docs/services/soul-match-service.md',
      'apps/core-api/src/modules/soul-match/soul-match.service.ts',
    ],
  },
  '03-voice-match': {
    stages: [
      fe(
        'MatchSession voice confirmed; gọi Calling join',
        'REST · POST Calling join',
      ),
      c(
        'Calling',
        'Verify member/session; tạo hoặc lấy call chưa terminal',
        'SQL · UPSERT CallSession pending',
      ),
      pg('Một CallSession cho match_session_id; state pending'),
      c(
        'Calling',
        'Ký LiveKit token local; identity/room do server chọn',
        'REST result · token + LiveKit URL',
      ),
      fe('Dùng token kết nối audio trực tiếp', 'WebRTC · Client ↔ LiveKit'),
      s(
        'media-server · LiveKit',
        'Participant vào/rời room; gửi signed lifecycle event',
        'Webhook · Calling LiveKit endpoint',
      ),
      c(
        'Calling',
        'Verify chữ ký; đủ hai participant mới active, disconnect mở grace',
        'SQL · conditional call state',
      ),
      pg('Ghi participant/start/grace state; terminal transition idempotent'),
      c(
        'CallTicker / Calling',
        'Pending timeout, active 420s, explicit end hoặc grace timeout chốt call',
        'SQL · end CallSession + MatchSession',
      ),
      pg('Commit ended và giải phóng voice MatchSession'),
      ...realtime(
        'Calling',
        'call.ended',
        'Nhận end; REST đọc lại call và gửi like nếu muốn',
      ),
      branch(
        'core-api · Calling',
        'Sau POST like, đã có like của cả hai?',
        o(
          'MUTUAL-LIKE',
          [
            c(
              'Calling → Friend',
              'Lock call; reaction unique; ensureFriendship cùng transaction',
              'SQL · likes/relations + COMMIT',
            ),
            pg('Commit VoiceMatchReaction, Friendship và Conversation'),
            c(
              'Calling',
              'Trả matched và friendUserId chỉ sau mutual',
              'REST result',
            ),
            fe('Mở Friend Chat'),
          ],
          false,
        ),
        o(
          'CHƯA MUTUAL',
          [
            c(
              'Calling',
              'Lưu một immutable like; không reveal friendUserId',
              'SQL · COMMIT reaction',
            ),
            pg('Giữ like để bên kia còn có thể like khi active/ended'),
            c('Calling', 'Trả liked/matched state của caller', 'REST result'),
            fe('Call đã ended vẫn chưa có quan hệ mutual'),
          ],
          false,
        ),
      ),
    ],
    caution:
      'Call pending chưa chạy active timer; reconnect grace được loại khỏi thời lượng. Mọi end gọi deleteRoom best-effort ngoài DB transaction; không debit Diamond theo phút.',
    followup:
      'Friend call riêng cần ProfileFollow active hai chiều, không chịu 420s limit.',
    sources: [
      'docs/services/calling-service.md',
      'apps/core-api/src/modules/calling/jobs/call-ticker.service.ts',
    ],
  },
  '04-party-room': {
    stages: [
      fe('Host tạo Party Room', 'REST · POST Party room'),
      c(
        'PartyRoom',
        'Validate và tạo room + host membership atomically',
        'SQL · INSERT room/member + COMMIT',
      ),
      pg('Commit PartyRoom active, speaker limit snapshot và host membership'),
      c(
        'PartyRoom',
        'Tạo LiveKit room sau DB commit',
        'LiveKit API · createRoom',
      ),
      s(
        'media-server · LiveKit',
        'Tạo room với participant cap; trả API result',
        'HTTP result · core-api',
      ),
      c(
        'PartyRoom',
        'Ký token theo role; audience canPublish=false',
        'REST result · token + room',
      ),
      fe(
        'Member join LiveKit; host gửi speaker invite cho audience',
        'WebRTC audio; REST · speaker invite',
      ),
      c(
        'PartyRoom',
        'Lock room; ghi pending invite, chưa cấp quyền nói',
        'SQL · UPDATE member invite',
      ),
      pg('Lưu speakerInvitePending; role vẫn audience'),
      c(
        'PartyRoom',
        'Sau commit: trả member cho host và phát invite tới target khi state mới đổi',
        'Redis · PUBLISH party.speaker.invite.received',
      ),
      s(
        'Redis · Pub/Sub',
        'Chuyển speaker invite trên channel của target',
        'Pub/Sub · PSUBSCRIBE',
      ),
      s(
        'signaling-gateway',
        'Fanout lời mời tới socket room của target',
        'WebSocket · party.speaker.invite.received',
      ),
      branch(
        'Frontend',
        'Người nhận chấp nhận lời mời?',
        o('ACCEPT', [
          fe('Target tự accept', 'REST · accept speaker invite'),
          c(
            'PartyRoom',
            'Lock room; check speaker limit; đổi role',
            'SQL · COMMIT speaker role',
          ),
          pg('Commit role speaker'),
          c(
            'PartyRoom',
            'Cập nhật grant ngoài transaction',
            'LiveKit API · updateParticipant',
          ),
          s(
            'media-server · LiveKit',
            'Áp dụng canPublish=true theo grant server',
            'HTTP result · core-api',
          ),
          c(
            'PartyRoom',
            'Trả kết quả role; realtime sau commit',
            'REST result',
          ),
          fe('Tiếp tục room với quyền speaker'),
        ]),
        o('CHƯA ACCEPT', [
          fe('Chờ hoặc decline; vẫn chỉ nghe', 'REST · decline khi user chọn'),
          c('PartyRoom', 'Không đổi role thành speaker', 'REST result'),
          fe('Tiếp tục room với audience grant'),
        ]),
      ),
      branch(
        'Frontend',
        'Host rời chủ động hay mất kết nối?',
        o(
          'REST LEAVE',
          [
            fe('Host gửi leave', 'REST · leaveRoom'),
            c(
              'PartyRoom',
              'Lock room; đóng ngay host_left và chốt members',
              'SQL · close room + COMMIT',
            ),
            pg('Commit closed; không transfer host'),
            ...realtime(
              'PartyRoom',
              'party.room.closed',
              'REST refetch; rời room',
            ),
          ],
          false,
        ),
        o(
          'DISCONNECT',
          [
            s(
              'media-server · LiveKit',
              'Host connection bị rớt; báo participant_left',
              'Signed webhook · core-api',
            ),
            c(
              'PartyRoom',
              'Ghi host_disconnected_at; giữ membership để reconnect',
              'SQL · UPDATE grace state',
            ),
            pg('Giữ room active trong grace'),
            c(
              'PartyRoom / Sweeper',
              'Reconnect trong grace: giữ room; chỉ quá grace mới close dưới lock',
              'SQL · re-check + transition',
            ),
            pg('Clear disconnect khi reconnect hoặc commit closed khi timeout'),
            c(
              'PartyRoom',
              'Trả/refetch state và fanout event tương ứng',
              'REST / Pub/Sub · trạng thái room',
            ),
          ],
          false,
        ),
      ),
    ],
    important:
      'Comment/Gift là REST branches riêng: comment persist trước party.comment.created; Gift đi qua Economy và Notification trước gift.sent. Member thường cũng có disconnect grace.',
    caution:
      'SFU create fail compensate close(error). Grant update fail có conditional compensation theo transition mới nhất; closeRoom dọn LiveKit ngoài transaction.',
    sources: [
      'docs/services/party-room-service.md',
      'docs/services/gift-service.md',
    ],
  },
  '05-movie-match-movie-night': {
    stages: [
      fe('Chọn friend mode hoặc anonymous mode'),
      branch(
        'Frontend',
        'Entry point xem chung?',
        o('FRIEND', [
          fe('Chọn bạn và URL video', 'REST · POST Movie session'),
          c(
            'MovieMatch → Friend',
            'areFriends + exact hostname allowlist; reserve hai participants',
            'SQL · session + active slots',
          ),
          pg(
            'Commit MovieSession friend active; same pair replay lấy session cũ',
          ),
        ]),
        o('ANONYMOUS', [
          fe('Vào queue người lạ', 'REST · anonymous enqueue'),
          c(
            'MovieMatch → Safety',
            'PG advisory lock; candidate FIFO; canPair lúc ghép',
            'SQL · queue + anonymous session',
          ),
          pg(
            'Commit MovieMatchQueueEntry/session snapshot + active slots; video do server chọn',
          ),
        ]),
      ),
      c(
        'MovieMatch',
        'Trả session view đúng mode; anonymous chưa lộ partnerUserId',
        'REST result · playback state',
      ),
      fe(
        'Phát video trực tiếp từ source; thay playback position/play-pause',
        'YouTube playback; REST · PATCH state',
      ),
      c(
        'MovieMatch',
        'Membership; cập nhật state last-write-wins bằng giờ server',
        'SQL · UPDATE playback',
      ),
      pg('Lưu positionSeconds/isPlaying/positionUpdatedAt'),
      ...realtime(
        'MovieMatch',
        'movie.state.changed',
        'Đồng bộ player; chat theo đúng mode',
      ),
      branch(
        'Frontend',
        'Kết thúc theo mode nào?',
        o(
          'FRIEND END',
          [
            fe('Một member explicit end', 'REST · Movie end'),
            c(
              'MovieMatch',
              'Chốt ended và nhả hai slots',
              'SQL · COMMIT session/participants',
            ),
            pg('Commit ended; không có ticker tự hết hạn'),
          ],
          false,
        ),
        o(
          'ANON RATING',
          [
            fe(
              'End watch hoặc deadline; gửi rating sau watch_ended_at',
              'REST · anonymous end/rating',
            ),
            c(
              'MovieMatch',
              'Lock session; immutable rating; non-like terminal ngay',
              'SQL · ratings/outcome; Friend nếu hai like',
            ),
            pg(
              'Commit matched + Friendship/Conversation khi mutual; một like vẫn chờ',
            ),
            c(
              'MovieMatch',
              'Trả outcome; chỉ matched lộ partnerUserId',
              'REST result',
            ),
            fe('Matched mở Friend Chat; non-like không mở profile'),
          ],
          false,
        ),
      ),
    ],
    caution:
      'Anonymous chat append-only riêng theo session, không tự import sang Friend trong code hiện tại. Friend chat tái dùng Conversation. Reaction là ephemeral realtime, không persist.',
    sources: [
      'docs/services/movie-match-service.md',
      'apps/core-api/src/modules/movie-match/movie-match.service.ts',
    ],
  },
  '06-palm-match': {
    stages: [
      fe('Chọn daily reading hoặc ghép ẩn danh'),
      branch(
        'Frontend',
        'Entry point Palm?',
        o(
          'READING',
          [
            fe('Chọn category/targetName', 'REST · GET reading'),
            c(
              'PalmMatch',
              'Lấy templates active; seed theo user/category/ngày UTC',
              'SQL · SELECT templates',
            ),
            pg('Trả PalmReadingTemplate catalog'),
            c(
              'PalmMatch',
              'Chọn nội dung deterministic trong ngày',
              'REST result',
            ),
            fe('Hiển thị reading; không có history riêng'),
          ],
          false,
        ),
        o('ANONYMOUS', [
          fe('Enqueue Palm', 'REST · enqueue'),
          c(
            'PalmMatch → Safety',
            'Advisory transaction lock; FIFO candidate; canPair',
            'SQL · queue/session snapshot + COMMIT',
          ),
          pg('Commit PalmMatchSession và active participants'),
        ]),
      ),
      c('PalmMatch', 'Trả current state ẩn danh', 'REST result'),
      fe('Mỗi người chỉ flip lá của mình', 'REST · flip'),
      c(
        'PalmMatch',
        'JWT xác định lá; lock session; lazy-expire nếu quá hạn',
        'SQL · UPDATE flippedAt',
      ),
      pg('Lưu flip; sign mỗi người hiện khi người đó flip'),
      c(
        'PalmMatch',
        'Chỉ đủ hai flip mới có compatibility/fortune và mở rating',
        'REST result',
      ),
      fe('Gửi like hoặc skip sau khi rating mở', 'REST · rate'),
      c(
        'PalmMatch',
        'Lock session; verdict immutable; skip terminal, mutual tạo Friend',
        'SQL · ratings/outcome + relations',
      ),
      pg(
        'Commit result snapshot; một like chưa matched, skip not_matched, hai like matched',
      ),
      c(
        'PalmMatch',
        'Trả outcome; partnerUserId chỉ khi matched',
        'REST result',
      ),
      fe('REST reload giữ kết quả; dismiss active sẽ cancel cho cả hai'),
    ],
    caution:
      'Palm không có realtime producer, AI hay Economy. Queue và advisory lock ở PostgreSQL; dismiss terminal nhả pointer để enqueue lần mới.',
    sources: [
      'docs/services/palm-match-service.md',
      'apps/core-api/src/modules/palm-match/palm-match.service.ts',
    ],
  },
  '07-feed-va-stories': {
    stages: [
      fe(
        'Soạn Post/Story; nếu có ảnh xin upload intent',
        'REST · Media upload intent',
      ),
      c(
        'Media',
        'Validate owner/purpose/type/size; gọi ImageStoragePort',
        'in-process · issueUploadUrl',
      ),
      c(
        'Media adapter',
        'Tạo presigned URL bằng getSignedUrl tại server',
        'in-process result · upload URL',
      ),
      c(
        'Media',
        'Yêu cầu lưu ImageAsset upload intent',
        'SQL · INSERT ImageAsset',
      ),
      pg('Lưu ImageAsset thuộc caller và metadata intent'),
      c('Media', 'Trả assetId/uploadUrl sau khi intent đã lưu', 'REST result'),
      fe('Upload ảnh trực tiếp bằng presigned URL', 'HTTP · PUT object'),
      s(
        'S3 / R2 / MinIO',
        'Lưu object quarantine; trả kết quả upload',
        'HTTP result · upload',
      ),
      fe(
        'Gửi imageAssetId cùng nội dung Post/Story',
        'REST · Post/Story create',
      ),
      c(
        'Feed / Story → Media',
        'Check asset owner/purpose; yêu cầu metadata và magic bytes',
        'Storage API · HEAD / GET / promote',
      ),
      s(
        'S3 / R2 / MinIO',
        'Trả metadata/bytes; promote object hợp lệ qua Media adapter',
        'HTTP result · core-api',
      ),
      c(
        'Feed / Story → Media',
        'Ảnh validated; enforce guest/audience và yêu cầu lưu content',
        'SQL · INSERT content',
      ),
      pg('Commit Post idempotent hoặc Story riêng với expiresAt'),
      c(
        'Feed / Story',
        'Compose và trả PostDto/StoryDto từ dữ liệu đã lưu',
        'REST result · create response',
      ),
      fe(
        'Yêu cầu feed/timeline/ring hoặc tương tác',
        'REST · read/like/comment/view',
      ),
      c(
        'Feed / Story',
        'Enforce audience + block; Story phải chưa hết TTL',
        'SQL · SELECT / atomic interaction writes',
      ),
      pg(
        'Trả nội dung có quyền; persist reaction/comment/counter hoặc unique StoryView',
      ),
      c(
        'Feed / Story',
        'Trả DTO; post interaction Notification atomic, push sau commit',
        'REST result / optional push',
      ),
      branch(
        'Frontend',
        'Story reply hay chỉ đọc?',
        o(
          'REPLY',
          [
            fe('Bạn của tác giả gửi reply', 'REST · Story reply'),
            c(
              'Story → Friend',
              'Snapshot mediaUrl; membership/block/idempotency qua sendMessage',
              'SQL · INSERT Message',
            ),
            pg('Lưu DM thật; Story hết hạn không xoá message'),
            ...realtime(
              'Friend',
              'friend.message',
              'Hiển thị DM từ Story reply',
            ),
          ],
          false,
        ),
        o(
          'ĐỌC',
          [fe('Hiển thị nội dung theo quyền; Story hết TTL bị ẩn ngay')],
          false,
        ),
      ),
    ],
    caution:
      'Text-only Post bỏ qua upload branch. Global feed chỉ public; Story ring mình + bạn. StorySweeper hard-delete rác nhưng read TTL là chốt correctness; feed không có fanout riêng.',
    sources: [
      'docs/services/feed-service.md',
      'docs/services/media-service.md',
    ],
  },
  '08-avatar-tuy-chinh': {
    stages: [
      fe(
        'Mở catalog active, chọn avatar layer',
        'REST · catalog / claim / buy',
      ),
      c('Avatar', 'Đọc giá active asset từ server'),
      branch(
        'core-api · Avatar',
        'Item free hay paid?',
        o('FREE', [
          c('Avatar', 'Claim không gọi Economy', 'in-process · ghi ownership'),
        ]),
        o('PAID', [
          c(
            'Avatar → Economy',
            'spendDiamond theo client key và giá server',
            'SQL · ledger debit + Wallet',
          ),
          pg(
            'Commit double-entry, LedgerTransaction unique key và Wallet snapshot',
          ),
          c(
            'Avatar',
            'Debit mới/replay thành công; tiếp tục ownership',
            'in-process · ghi ownership',
          ),
        ]),
      ),
      c(
        'Avatar',
        'Insert ownership idempotent theo user + asset',
        'SQL · INSERT UserAvatarItem ON CONFLICT',
      ),
      pg('Lưu UserAvatarItem; retry không tạo ownership đôi'),
      c('Avatar', 'Trả item thuộc sở hữu', 'REST result'),
      fe('Chọn equip vào slot', 'REST · equip'),
      c(
        'Avatar',
        'Check active, đúng slot và ownership user',
        'SQL · UPSERT UserAvatarConfig',
      ),
      pg('Lưu một asset mỗi slot'),
      c('Avatar', 'Resolve layers theo zIndex', 'REST result'),
      fe('Ghép hình avatar theo config server'),
    ],
    caution:
      'Paid debit và ownership là hai bước idempotent, không một transaction chung. Không equip asset chưa sở hữu; User.avatarId cũ vẫn riêng với multi-layer config.',
    sources: [
      'docs/services/avatar-service.md',
      'docs/services/economy-service.md',
    ],
  },
  '09-diamond-top-up-va-vip': {
    stages: [
      fe('Yêu cầu products/plans và capabilities', 'REST · Economy catalog'),
      c('Economy', 'Trả catalog và capability đang áp dụng', 'REST result'),
      fe('Hiển thị catalog; chọn phương thức mua', 'Chọn thao tác'),
      branch(
        'Frontend',
        'Nạp IAP, payOS hay mua VIP bằng Diamond?',
        o('IAP', [
          fe('Mua product qua IAP store', 'StoreKit / Play Billing'),
          s('Apple / Google', 'Trả receipt/purchase token', 'Store result'),
          fe('Gửi receipt/purchase token và key', 'REST · IAP purchase'),
          c('Economy', 'Gọi IapVerifier ở server', 'Provider HTTP · verify'),
          s('Apple / Google', 'Trả verification result', 'HTTP result'),
          c(
            'Economy',
            'Xác định provider transaction và Diamond từ catalog',
            'in-process · credit chuẩn bị ledger',
          ),
        ]),
        o('PAYOS', [
          fe('Gửi packageId + Idempotency-Key', 'REST · payOS order'),
          c(
            'Economy',
            'Snapshot giá/Diamond; tạo order idempotent',
            'SQL · INSERT order',
          ),
          pg('Lưu order và unique order_code'),
          c(
            'Economy',
            'Yêu cầu payment link theo order',
            'payOS HTTP · create link',
          ),
          s('payOS', 'Trả checkout URL/QR', 'HTTP result'),
          c('Economy', 'Trả checkout URL/QR cho caller', 'REST result'),
          fe('Mở checkout và thanh toán', 'HTTPS · checkout'),
          s('payOS', 'Gửi payment webhook có HMAC', 'HTTP · signed webhook'),
          c(
            'Economy',
            'Verify HMAC tại server; lock và đối chiếu order snapshot',
            'in-process · credit chuẩn bị ledger',
          ),
        ]),
        o('VIP', [
          fe('Gửi planId + Idempotency-Key', 'REST · VIP purchase'),
          c(
            'Economy',
            'Đọc plan active/giá; lock Wallet và đủ balance',
            'in-process · debit chuẩn bị ledger',
          ),
        ]),
      ),
      c(
        'Ledger',
        'Claim unique LedgerTransaction key; snapshot giá và ghi entries cân currency',
        'SQL · entries + Wallet + metadata/outbox',
      ),
      pg(
        'Commit append-only double-entry, Wallet snapshot, receipt/order credit hoặc VIP expiry',
      ),
      c(
        'Economy',
        'Hoàn tất credit/VIP; trả kết quả cho API caller hoặc ACK webhook',
        'Giai đoạn Frontend đọc lại trạng thái',
      ),
      fe(
        'Yêu cầu đọc Wallet/VIP sau mua hoặc khi quay lại checkout',
        'REST · Wallet / VIP',
      ),
      c(
        'Economy',
        'Đọc số dư/VIP đã commit theo user',
        'SQL · SELECT Wallet / VIP',
      ),
      pg('Trả Wallet snapshot và VIP expiry hiện tại'),
      c(
        'Economy',
        'Trả trạng thái hiện tại; pending chưa được credit',
        'REST result',
      ),
      fe('Hiển thị số dư/VIP từ server; pending payment không phải đã credit'),
      branch(
        'core-api · Economy',
        'Có refund/chargeback được verify sau này?',
        o(
          'REFUND',
          [
            c(
              'RefundService',
              'Tạo reversal mới; không sửa ledger cũ',
              'SQL · reversal + Wallet/receipt state',
            ),
            pg('Commit đảo entries; wallet có thể âm khi đã tiêu'),
            c(
              'Economy',
              'Giữ debt đúng ledger; chặn spend khi thiếu balance',
              'REST result · debt state',
            ),
          ],
          false,
        ),
        o(
          'KHÔNG',
          [
            c(
              'Reconciliation',
              'Job read-only kiểm double-entry, receipts và wallet',
              'SQL · reconciliation reads',
            ),
            pg('Trả ledger-derived checks; không auto-correct'),
          ],
          false,
        ),
      ),
    ],
    caution:
      'Apple signed refund/revoke và polling refund history; Google RTDN chỉ tín hiệu, Voided Purchases polling mới refund. Outbox relay Kafka tùy config; không Notification consumer Kafka giả.',
    sources: [
      'docs/services/economy-service.md',
      'apps/core-api/src/modules/economy/webhooks/economy-webhooks.controller.ts',
    ],
  },
  '11-gift': {
    stages: [
      fe('Chọn quà active và context', 'REST · room/video/profile Gift + key'),
      c(
        'Gift',
        'Giá từ catalog; xác định recipient và kiểm tra self-gift/guest',
      ),
      branch(
        'core-api · Gift',
        'Ngữ cảnh Gift nào?',
        o('PARTY', [
          c(
            'Gift → PartyRoom',
            'Sender và receiver phải active cùng room',
            'in-process · getActiveRoomMembers',
          ),
        ]),
        o('VIDEO', [
          c(
            'Gift → ShortVideo',
            'Video phải visible; recipient suy từ author',
            'in-process · getVideoOrThrow',
          ),
        ]),
        o('PROFILE', [
          c(
            'Gift → ProfileSocial',
            'Recipient từ profile; chuẩn bị mở Conversation/contact',
            'in-process · profile eligibility',
          ),
        ]),
      ),
      c(
        'Gift → Economy',
        'Lock wallets; unique key; DIA debit và PTS credit theo tỷ lệ',
        'SQL · entries + GiftEvent + Notification',
      ),
      pg(
        'Commit các chân currency tự cân, GiftEvent/Wallet; profile còn có Conversation/contact',
      ),
      c(
        'Gift',
        'Sau commit: chuẩn bị GiftEvent result và nhánh context fanout',
        'in-process · context side effects',
      ),
      branch(
        'core-api · Gift',
        'Có Party room fanout?',
        o(
          'PARTY',
          [
            ...realtime(
              'Gift',
              'gift.sent',
              'Chỉ bắn hiệu ứng sau xác nhận server',
            ),
          ],
          false,
        ),
        o(
          'VIDEO / PROFILE',
          [
            c(
              'Notification',
              'In-app đã durable; push chỉ best-effort',
              'Push adapter · provider nếu configured',
            ),
            s(
              'FCM / APNs / Web Push',
              'Giao push nếu endpoint/token có và provider thành công',
              'Push · recipient device',
            ),
            fe('Hiển thị REST result / notification; không giả room event'),
          ],
          false,
        ),
      ),
    ],
    caution:
      'Guest recipient có PTS=0, Diamond không chuyển user→user 1:1. Ledger append-only, correction bằng reversal; chưa có Gift refund. Profile Gift mở chat một lần, không fee từng message.',
    sources: [
      'docs/services/gift-service.md',
      'docs/services/economy-service.md',
    ],
  },
  '12-mini-game': {
    stages: [
      fe(
        'Chọn bạn và tạo rock-paper-scissors session',
        'REST · POST MiniGame session',
      ),
      c(
        'MiniGame → Friend',
        'areFriends; reserve active participant slots',
        'SQL · INSERT session/participants',
      ),
      pg('Commit waiting_moves; same pair replay lấy session cũ'),
      c(
        'MiniGame',
        'Trả session và phát started sau commit',
        'REST result / Pub/Sub · started',
      ),
      fe(
        'Mỗi participant submit rock/paper/scissors của chính mình',
        'REST · POST move',
      ),
      c(
        'MiniGame',
        'Participant guard; conditional move IS NULL, status waiting_moves',
        'SQL · UPDATE move + đọc session',
      ),
      pg('Lưu move immutable; trả session trong transaction'),
      branch(
        'core-api · MiniGame',
        'Đủ hai moves?',
        o(
          'ĐỦ HAI',
          [
            c(
              'MiniGame',
              'Tính winner/tie; yêu cầu resolved và nhả slots',
              'SQL · COMMIT result',
            ),
            pg('Commit resolved + winnerUserId, cả hai moves'),
            ...realtime(
              'MiniGame',
              'minigame.session.resolved',
              'Đọc lại kết quả; chỉ bây giờ thấy opponentMove',
            ),
          ],
          false,
        ),
        o(
          'CHƯA ĐỦ',
          [
            c(
              'MiniGame',
              'Không resolve và không publish move trung gian',
              'SQL · COMMIT một move',
            ),
            pg('Giữ waiting_moves'),
            c(
              'MiniGame',
              'Trả myMove/opponentHasMoved; không opponentMove',
              'REST result',
            ),
            fe('Tiếp tục chờ hoặc cancel ván waiting'),
          ],
          false,
        ),
      ),
    ],
    caution:
      'Cancel conditional ngăn ghi đè resolved; không có timer, Economy reward hay tự động chat message cho kết quả.',
    sources: [
      'docs/services/mini-game-service.md',
      'apps/core-api/src/modules/mini-game/mini-game.service.ts',
    ],
  },
  '13-trust-safety': {
    stages: [
      fe('Chọn Report User, Block hoặc Unblock', 'REST · Safety action'),
      c('Safety', 'Validate target; chặn tự report/block chính mình'),
      branch(
        'core-api · Safety',
        'Report hay block state?',
        o('REPORT USER', [
          c(
            'Safety → User',
            'Cooldown + daily cap; append evidence và trust delta cùng transaction',
            'SQL · Report + User trustScore',
          ),
          pg('Commit Report và trustScore adjustment nếu có'),
        ]),
        o('BLOCK / UNBLOCK', [
          c(
            'Safety',
            'Đọc log mới nhất; append action chỉ khi state thay đổi',
            'SQL · INSERT Block event',
          ),
          pg('Commit action append-only; không xoá lịch sử'),
        ]),
      ),
      c(
        'Safety',
        'Trả action result; không auto-ban chỉ vì trust score',
        'REST result',
      ),
      fe(
        'Tiếp tục dùng các chức năng; mỗi request áp lại guard',
        'REST · Matching/Discovery/Friend/Feed request',
      ),
      c(
        'Domain → Safety',
        'canPair, hidden-set hoặc block guard đúng ngữ cảnh',
        'SQL · read Report/Block hiện tại',
      ),
      pg('Trả report/block evidence, không cached permission truth'),
      c(
        'Domain',
        'Matching có cooldown; Discovery mọi report ẩn vĩnh viễn; chat/feed block hai chiều',
        'REST result · allowed / oracle-safe denial',
      ),
      fe('Hiển thị kết quả theo quyền server'),
    ],
    important:
      'Video report là API/backend branch riêng: distinct reporter có thể auto-hide Video, không trừ trustScore user. Admin moderation có role/permission và audit riêng.',
    caution:
      'User report không đồng nghĩa admin đã duyệt; Report luôn giữ evidence kể cả không trừ thêm điểm. Safety không tạo outbox/push trong report/block.',
    sources: [
      'docs/services/safety-service.md',
      'docs/services/discovery-service.md',
      'docs/services/short-video-service.md',
    ],
  },
  '15-runtime-availability': {
    stages: [
      fe('Khởi động/refresh Web hoặc Admin', 'REST · GET /capabilities'),
      c(
        'Capabilities',
        'Public + SkipThrottle; đọc validated runtime config',
        'in-process · ConfigService',
      ),
      c(
        'Capabilities',
        'Xác định provider credentials, environment và maintenance flags',
        'in-process · capability projection',
      ),
      c(
        'Capabilities',
        'Trả enabled/disabled/beta theo từng provider/platform',
        'REST result · CapabilitiesDto',
      ),
      branch(
        'Frontend',
        'Entry point capability khả dụng?',
        o(
          'ENABLED / BETA',
          [
            fe(
              'Hiện CTA; beta được thể hiện là thử nghiệm',
              'REST · nghiệp vụ khi user chọn',
            ),
            c(
              'Domain',
              'Backend kiểm tra lại quyền, provider/config trước side effect',
              'REST result · action outcome',
            ),
            fe('Hiển thị outcome request thật'),
          ],
          false,
        ),
        o('DISABLED', [fe('Ẩn/vô hiệu CTA và hiện lý do contract')], false),
      ),
    ],
    caution:
      'Không PG/Redis write, không provider network probe; configured enabled không đảm bảo request provider thành công hay production readiness.',
    sources: [
      'apps/core-api/src/app/capabilities.controller.ts',
      'apps/core-api/src/app/capabilities.service.ts',
    ],
  },
  '16-friend-va-chat-1-1': {
    stages: [
      fe('Mở chat từ mutual-like hoặc profile'),
      branch(
        'core-api · Friend',
        'Conversation được mở qua đâu?',
        o('MUTUAL-LIKE', [
          c(
            'Source domain → Friend',
            'ensureFriendship cùng transaction của rating/likes',
            'SQL · Friendship + Conversation',
          ),
          pg('Commit relation và Conversation; import seeds nếu source có'),
        ]),
        o('PROFILE', [
          c(
            'ProfileSocial',
            'First-contact policy; dưới threshold mở trực tiếp, vượt threshold cần Gift',
            'SQL · Conversation/contact khi đủ điều kiện',
          ),
          pg(
            'Commit Conversation/contact; Gift branch còn có ledger/GiftEvent',
          ),
        ]),
      ),
      c('Friend', 'Trả conversationId cho member', 'REST result'),
      fe(
        'Gửi text hoặc imageAssetId qua REST; ảnh upload Media trước',
        'REST · POST Conversation message + key',
      ),
      c(
        'Friend → Safety/Media',
        'Membership, block hai chiều; ảnh check owner/object nếu có',
        'SQL · INSERT Message + lastMessageAt',
      ),
      pg(
        'Commit Message append-only và Conversation.lastMessageAt; key unique',
      ),
      c(
        'Friend.Streak',
        'Sau message commit: transaction riêng recordActivity UTC',
        'SQL · lock/update ConversationStreak',
      ),
      pg(
        'Lưu activity dates và streak nếu đủ hai chiều; lỗi không rollback message',
      ),
      ...realtime(
        'Friend',
        'friend.message',
        'Hiển thị message; REST history phục hồi khi socket mất',
      ),
      fe('Đánh dấu read hoặc mute Conversation', 'REST · read/mute'),
      c(
        'Friend',
        'Upsert member state; mute chỉ tắt Notification channel',
        'SQL · ConversationMemberState',
      ),
      pg('Lưu read/mute; unread vẫn dựa vào messages'),
    ],
    important:
      'Unmuted Friend message tạo Notification sau persist trong transaction riêng và push best-effort. Milestone realtime khác warning job; warning có notification/push.',
    caution:
      'Chat không yêu cầu follow; friend call là request Calling riêng cần follow hai chiều. Không vẽ message gửi qua Gateway hoặc Stripe/payment provider.',
    sources: [
      'docs/services/friend-service.md',
      'docs/services/streak-service.md',
    ],
  },
  '17-dang-ky-onboarding-va-guest': {
    stages: [
      fe('Đọc auth capabilities; chọn guest, OTP hoặc social'),
      branch(
        'Frontend',
        'Phương thức đăng nhập?',
        o('GUEST', [
          fe('Gửi deviceId cho guest login', 'REST · POST auth/guest'),
          c(
            'Auth → User',
            'Tìm/tạo guest và identity trong transaction',
            'SQL · User + AuthIdentity',
          ),
          pg('Commit user/guest identity'),
        ]),
        o('OTP', [
          fe(
            'Request OTP rồi submit mã trả về UI',
            'REST · OTP request/verify',
          ),
          c(
            'Auth.OTP',
            'DB count phone quota; hash/expiry; verify và consume conditional',
            'SQL · PhoneOtp + identity/User',
          ),
          pg('Commit OTP consumed; tạo/tìm User identity'),
        ]),
        o('SOCIAL', [
          fe(
            'Đăng nhập provider, gửi token cho Auth',
            'Provider sign-in; REST · social token',
          ),
          c(
            'Auth.SocialVerifier',
            'Google/Apple JWKS hoặc Facebook debug_token; verify issuer/audience',
            'HTTP · identity verification',
          ),
          s(
            'Google / Apple / Facebook',
            'Trả JWKS/verification HTTP result',
            'HTTP result · core-api',
          ),
          c(
            'Auth → User',
            'Tìm/tạo User cho verified provider uid',
            'SQL · User/AuthIdentity',
          ),
          pg('Commit identity unique và User'),
        ]),
      ),
      c(
        'Auth',
        'Issue access JWT, rotating refresh session và CSRF token',
        'SQL · persist RefreshToken',
      ),
      pg('Lưu refresh session; guest còn có signed device proof'),
      c(
        'Auth',
        'Đặt httpOnly refresh cookie; trả public access/session DTO',
        'REST result',
      ),
      fe('Onboarding cập nhật profile chính mình', 'REST · PATCH /users/me'),
      c(
        'User',
        'Validate profile và ghi fields được phép',
        'SQL · UPDATE User',
      ),
      pg('Lưu profile gắn cùng userId'),
      c(
        'User',
        'Trả MyProfileDto sau cập nhật; Auth session/cookie đã cấp ở bước login',
        'REST result · profile updated',
      ),
      branch(
        'Frontend',
        'Guest muốn upgrade?',
        o(
          'UPGRADE',
          [
            fe(
              'Verify OTP/social mới cho identity muốn gắn',
              'REST · auth/upgrade',
            ),
            c(
              'Auth',
              'Identity không thuộc user khác; link vào chính guest, revoke sessions cũ',
              'SQL · upgrade transaction',
            ),
            pg(
              'Commit cùng userId; isGuest=false, old guest identity/sessions revoked',
            ),
            c(
              'Auth',
              'Cấp session mới; conflict thì không auto-merge',
              'REST result',
            ),
            fe('Tiếp tục dữ liệu/wallet cùng userId'),
          ],
          false,
        ),
        o(
          'KHÔNG',
          [fe('Tiếp tục session hiện tại; guest restrictions áp ở backend')],
          false,
        ),
      ),
    ],
    caution:
      'OTP hiện không gửi SMS, code được trả cho client. Refresh/logout có CSRF + rotation/reuse detection; identity thuộc account khác không auto-merge.',
    sources: [
      'apps/core-api/src/modules/auth/auth.service.ts',
      'apps/core-api/src/modules/auth/services/otp.service.ts',
      'apps/core-api/src/modules/user/user.controller.ts',
    ],
  },
  '18-discovery-nearby-va-direct-invite': {
    stages: [
      fe('Chọn Browse hoặc Nearby'),
      branch(
        'Frontend',
        'Nguồn danh sách?',
        o('BROWSE', [
          fe('Gửi gender/age filter', 'REST · browse'),
          c(
            'Discovery → User/Safety',
            'Exclude self/hidden users; query profile đúng filter',
            'SQL · User browse',
          ),
          pg('Trả candidates active; không dùng User.region làm city'),
        ]),
        o('NEARBY', [
          fe(
            'Opt-in và gửi vị trí; truy vấn Nearby',
            'REST · setting/location/nearby',
          ),
          c(
            'Nearby',
            'Reciprocity + privacy; rate-limit trước query/update',
            'Redis · atomic rate counter',
          ),
          s(
            'Redis · Quota',
            'Trả counter trong window cho location/query',
            'Redis result · allowed/limited',
          ),
          c(
            'Nearby',
            'Quantize lúc ghi; query fresh locations; Safety hidden-set',
            'SQL · UserLocation/DiscoverySetting + candidates',
          ),
          pg('Lưu tọa độ quantized; trả candidates và target privacy'),
        ]),
      ),
      c(
        'Discovery',
        'Compose ageBucket/distanceBucket; jitter theo cặp/ngày; không raw coords',
        'REST result · cards',
      ),
      fe('Xem card/profile; chọn direct invite hoặc profile chat'),
      branch(
        'Frontend',
        'Hành động tiếp theo?',
        o(
          'PROFILE CHAT',
          [
            fe('Mở chat/follow profile', 'REST · ProfileSocial/Gift endpoints'),
            c(
              'Friend / Gift',
              'First-contact và Gift transaction nếu cần; không tạo MatchSession',
              'REST result · Conversation/action state',
            ),
            fe('Đi Friend Chat theo state server'),
          ],
          false,
        ),
        o('INVITE', [
          fe('Mời Soul/Voice user cụ thể', 'REST · Matching Invite'),
          c(
            'Matching.Invite',
            'Rate-limit, hidden-set, unique pending pair; lưu pending',
            'SQL · INSERT MatchInvite',
          ),
          pg('Commit pending + expiresAt'),
          c(
            'Notification',
            'Invite_received sau persist; push best-effort',
            'REST result / push',
          ),
        ]),
      ),
      fe('Invitee chủ động accept', 'REST · invite accept'),
      c(
        'Matching.Invite',
        'Lazy expiry + canPair tại accept; bận giữ pending, Safety fail declined',
        'SQL · confirmed tickets/session transaction',
      ),
      pg(
        'Nếu hợp lệ commit 2 tickets confirmed + MatchSession; replay không tạo đôi',
      ),
      ...realtime(
        'Matching',
        'match.confirmed',
        'REST refetch rồi mở Soul / Voice',
      ),
    ],
    caution:
      'Invite pending/declined/cancelled/expired không phải matched. Direct consent không check genderPreference. Tắt Nearby opt-in xoá UserLocation; target showDistance=false thì ẩn distanceBucket.',
    sources: [
      'docs/services/discovery-service.md',
      'apps/core-api/src/modules/matching/services/invite.service.ts',
    ],
  },
  '19-mood-va-conversation-streak': {
    stages: [
      fe('Hai entry point độc lập: Mood hoặc chat activity'),
      branch(
        'Frontend',
        'Mood hay Streak?',
        o(
          'MOOD',
          [
            fe('Set preset active hoặc clear', 'REST · Mood set/clear + key'),
            c(
              'Mood',
              'Validate preset; expiresAt snapshot; idempotency key',
              'SQL · append MoodStatusEvent',
            ),
            pg('Commit set/clear event, không sửa log cũ'),
            c(
              'Mood → Safety',
              'Read latest event + TTL; block-filter lúc public read',
              'REST result · active mood hoặc null',
            ),
            fe('Hiển thị mood được phép; không anonymous pre-match card'),
          ],
          false,
        ),
        o('STREAK', [
          fe('Gửi Friend message', 'REST · POST message'),
          c(
            'Friend',
            'Membership/block/idempotency; lưu message trước',
            'SQL · Message commit',
          ),
          pg('Message durable; streak fail không rollback message'),
        ]),
      ),
      c(
        'Friend.Streak',
        'Transaction riêng lock row; ghi sender UTC date',
        'SQL · ConversationStreak read/write',
      ),
      pg('Trả activity dates và lastConfirmedDate trong transaction'),
      c(
        'Friend.Streak',
        'Hai chiều cùng ngày: gap1 tăng, gap2 grace, gap≥3 reset1; không tăng đôi',
        'SQL · COMMIT current/longest/dates',
      ),
      pg('Lưu streak counters; longest không giảm'),
      c(
        'Friend',
        'Milestone publish increased nếu hit; WarningJob phát at_risk + Notification',
        'Redis · Pub/Sub; optional push sau warning',
      ),
      s(
        'Redis · Pub/Sub',
        'Chuyển streak envelope tới Gateway',
        'Pub/Sub · PSUBSCRIBE',
      ),
      s(
        'signaling-gateway',
        'Fanout event cho hai conversation members',
        'WebSocket · streak event',
      ),
      fe('REST đọc display streak; quá grace hiển thị current0'),
    ],
    caution:
      'Milestone code hiện chỉ realtime, warning mới có in-app/push. Warning không tăng/reset streak; Mood preset-only không free-text hay AI, streak chưa thưởng Diamond.',
    sources: [
      'docs/services/mood-service.md',
      'apps/core-api/src/modules/friend/friend.service.ts',
      'apps/core-api/src/modules/friend/jobs/streak-warning.job.ts',
    ],
  },
  '20-short-video': {
    stages: [
      fe(
        'Capability upload phải enabled; gửi upload intent',
        'REST · POST videos/upload-intent + key',
      ),
      c(
        'ShortVideo',
        'Flag/provider guard; tạo uploading và storageKey stable',
        'SQL · INSERT Video',
      ),
      pg('Lưu Video uploading idempotent'),
      c(
        'ShortVideo',
        'Issue upload URL qua port; trả intent',
        'Storage port / REST result',
      ),
      fe(
        'Upload trực tiếp storage, sau đó finalize',
        'PUT storage; REST · finalize',
      ),
      c(
        'ShortVideo',
        'Conditional uploading→processing; gọi transcode',
        'SQL · status; VideoTranscodePort',
      ),
      s(
        'VideoTranscodePort · dev',
        'Trả processing result đồng bộ; chưa có production webhook vendor',
        'In-process result · core-api',
      ),
      branch(
        'core-api · ShortVideo',
        'Processing/review result nào?',
        o('POST-REVIEW OK', [
          c(
            'ShortVideo',
            'Mode post: processing xong cho published',
            'SQL · UPDATE published',
          ),
          pg('Commit Video published'),
        ]),
        o('PRE-REVIEW', [
          c(
            'ShortVideo',
            'Mode pre: pending_review, chưa vào feed',
            'SQL · UPDATE pending_review',
          ),
          pg('Lưu pending_review'),
          c(
            'ShortVideo',
            'Finalize trả VideoDto pending_review cho tác giả',
            'REST result · finalize response',
          ),
          fe(
            'Hành động riêng: staff review từ Admin UI',
            'REST · admin approve/reject',
          ),
          c(
            'Admin → ShortVideo',
            'Guard role/permission; approve→published, reject→rejected + audit',
            'SQL · moderation + AdminAuditLog',
          ),
          pg('Commit moderation result; chỉ approved/published đi tiếp'),
        ]),
        o(
          'LỖI',
          [
            c(
              'ShortVideo',
              'Transcode fail hoặc upload timeout',
              'SQL · UPDATE failed',
            ),
            pg('Lưu failed; sweeper dọn object khi chưa storage_cleaned_at'),
          ],
          false,
        ),
      ),
      branch(
        'core-api · ShortVideo',
        'Status hiện tại đã published?',
        o('PUBLISHED', [
          c(
            'ShortVideo',
            'Cho phép query published feed và interaction',
            'in-process · published guard',
          ),
        ]),
        o(
          'CHƯA PUBLISHED',
          [
            c(
              'ShortVideo',
              'Pending/rejected không xuất hiện trong feed; không cho tương tác',
              'REST result · chưa khả dụng',
            ),
            fe('Pending tiếp tục chờ duyệt; rejected/failed không đi tiếp'),
          ],
          false,
        ),
      ),
      c(
        'ShortVideo',
        'Feed/interactions chỉ published; pending/rejected không được đi tiếp',
        'REST result · published Video DTO',
      ),
      fe('Xem/like/comment published video', 'REST · view/reaction/comment'),
      c(
        'ShortVideo',
        'Qualified view unique, self-view bỏ; counters atomic',
        'SQL · views/reactions/comments',
      ),
      pg('Commit interactions; qualified chỉ false→true một lần/viewer'),
      c(
        'VideoRanking',
        'Tính rankScore derived; chưa có score fallback recent',
        'SQL · derived ranking update / query',
      ),
      pg('Lưu ranking projection, không thay source interaction truth'),
    ],
    important:
      'Backend report và distinct auto-hide vẫn có API; visible report button trong reel UI đang deferred. Admin remove published có audit riêng; Gift video là branch Gift→Economy/Notification.',
    caution:
      'Chưa có storage/transcode vendor thật cho production; production upload disabled/view-only. Pre-review pending/rejected không vào feed; code không có transcode webhook vendor.',
    sources: [
      'docs/services/short-video-service.md',
      'apps/core-api/src/modules/short-video/short-video.module.ts',
      'docs/feature-registry.json',
    ],
  },
  '21-notification': {
    stages: [
      c(
        'Domain producer',
        'Trigger hợp lệ: match/invite/message/gift/interaction/broadcast',
        'in-process DI · NotificationService',
      ),
      c(
        'Notification',
        'Recipient/payload; self-interaction bỏ qua; mute chặn friend_message',
        'SQL · INSERT Notification',
      ),
      pg(
        'Commit Notification in-app; shared manager atomic khi có transaction gốc',
      ),
      c(
        'Notification',
        'Sau commit: chọn adapter và kiểm tra điều kiện push',
        'in-process · provider readiness',
      ),
      branch(
        'core-api · Notification',
        'Provider/endpoint push có sẵn?',
        o('CONFIGURED', [
          c(
            'Notification',
            'Gọi adapter push với endpoint/token theo contract',
            'HTTPS · push provider',
          ),
          s(
            'FCM / APNs / Web Push',
            'Nhận send request; giao push nếu thành công',
            'Provider result · core-api',
          ),
          c(
            'Notification',
            'Push fail log/bỏ qua; Web Push 404/410 xoá subscription invalid',
            'in-process · best-effort result',
          ),
        ]),
        o('DISABLED / THIẾU', [
          c(
            'Notification',
            'Bỏ external push; giữ Notification in-app',
            'in-process · continue',
          ),
        ]),
      ),
      fe('Mở in-app list hoặc badge', 'REST · notifications/unread-count'),
      c(
        'Notification',
        'Đọc rows của caller, cursor/unread',
        'SQL · SELECT Notification',
      ),
      pg('Trả danh sách/count durable'),
      c('Notification', 'Trả notification DTO', 'REST result'),
      fe('Owner đánh dấu đã đọc', 'REST · notification read'),
      c(
        'Notification',
        'Owner guard; update readAt idempotent',
        'SQL · UPDATE readAt',
      ),
      pg('Lưu trạng thái read'),
    ],
    caution:
      'Flow dùng DI, không Kafka consumer/Redis queue. Friend message notification tự transaction riêng best-effort sau message; match_confirmed không lộ partner identity. Native token registration chưa có full contract.',
    sources: [
      'docs/services/notification-service.md',
      'apps/core-api/src/modules/notification/notification.service.ts',
    ],
  },
  '22-support-va-admin-operations': {
    stages: [
      fe(
        'User gửi category/message support',
        'REST · POST support/tickets + key',
      ),
      c(
        'Support',
        'Trim/validate; unique userId + key, khác payload conflict',
        'SQL · INSERT SupportTicket Open',
      ),
      pg('Lưu Open ticket; replay cùng key trả row cũ'),
      c('Support', 'Trả ticket của owner', 'REST result'),
      fe(
        'User theo dõi tickets/me; staff mở Admin action',
        'REST · user list / Admin endpoint',
      ),
      c('Admin', 'Role Admin/Moderator + per-endpoint permission guard'),
      branch(
        'core-api · Admin',
        'Action và quyền cho phép?',
        o(
          'SUPPORT ALLOWED',
          [
            c(
              'Admin → Support',
              'Lock ticket; validate transition; ghi staffResponse nếu gửi',
              'SQL · ticket state + audit',
            ),
            pg('Commit SupportTicket + AdminAuditLog'),
            c('Admin', 'Trả trạng thái mới; Closed terminal', 'REST result'),
            fe('Refetch để thấy phản hồi'),
          ],
          false,
        ),
        o(
          'DOMAIN ALLOWED',
          [
            c(
              'Admin → Domain owner',
              'Xử lý user, moderation, catalog, Economy, permissions, room hoặc broadcast qua API module',
              'SQL · domain writes + audit khi phù hợp',
            ),
            pg('Commit action và audit; Economy chỉ reversal mới'),
            c(
              'Domain owner',
              'Cleanup/push/fanout sau commit theo action riêng',
              'REST result / optional provider/realtime',
            ),
            fe('Hiển thị outcome Admin'),
          ],
          false,
        ),
        o(
          'DENIED',
          [
            c(
              'Admin',
              'Reject request không đủ role/permission',
              'REST result · forbidden',
            ),
            fe('Không áp thay đổi nghiệp vụ'),
          ],
          false,
        ),
      ),
    ],
    caution:
      'Không reopen Closed; replay cùng status hợp lệ. Support ticket không tự dùng Redis/Kafka/LiveKit; provider branches chỉ thuộc Admin action tương ứng. Frontend guard không thay backend authorization.',
    sources: [
      'apps/core-api/src/modules/support/support.service.ts',
      'apps/core-api/src/modules/admin/admin.controller.ts',
      'apps/core-api/src/modules/admin/admin.service.ts',
    ],
  },
};
