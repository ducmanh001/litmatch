// Visual reference of existing behavior; domain ownership remains in core-api.
// review-module: N/A — diagram content only, no business-flow implementation change.
const step = (text) => ({ text });
const option = (label, text, continues = true) => ({ label, text, continues });
const decision = (branch, ...options) => ({ branch, options });

export const featureCatalog = [
  {
    id: '02-soul-match',
    title: 'Soul Match',
    sources: [
      'docs/services/soul-match-service.md',
      'docs/services/friend-service.md',
    ],
    core: [
      'SoulMatch: chat + rating',
      'Friend: mutual-like + import chat',
      'User: ban + profile guard',
    ],
    rest: 'REST: session, messages, rating, end',
    dataLabel: 'Session, chat, rating',
    redisLabel: 'Pub/Sub: soul.* sau commit',
    realtime: true,
    external: null,
    archNotes: {
      important:
        'Phòng ẩn danh là view từ MatchSession, không phải service hay entity riêng. PostgreSQL lưu message append-only, rating và quan hệ; mutual-like tạo Friendship, Conversation và import chat trong cùng transaction.',
      caution:
        'Gateway chỉ fanout payload đã ẩn danh; Redis Pub/Sub không giữ lịch sử. Trước mutual-like, DTO không lộ userId, profile hoặc verdict của đối phương; REST phục hồi state khi mất event.',
    },
    flow: [
      step('MatchSession soul confirmed\nHai người mở phòng ẩn danh'),
      step('Server xác định phase + deadline\nRating mở từ lúc bắt đầu chat'),
      step('Gửi message qua REST\nMembership + phase + ban được kiểm tra'),
      step('Lưu message idempotent\nSau commit: soul.message'),
      step('Rate rude / boring / like\nLock session; mỗi người một verdict'),
      decision(
        'Kết quả rating hiện tại?',
        option(
          'MUTUAL-LIKE',
          'Tạo Friendship + Conversation\nImport lịch sử trong cùng transaction\nMở profile; chat tiếp không deadline',
        ),
        option(
          'CHƯA MUTUAL',
          'Còn window: tiếp tục chờ rating\nChat hết giờ: chỉ đọc + rate\nHết window: closed',
          false,
        ),
      ),
      step('Một bên gọi end\nMatchSession ended; phòng đóng cho cả hai'),
    ],
    flowNotes: {
      important:
        'Hai rating like song song được serialize bằng lock session. Friendship là nguồn sự thật của unlock; message gốc vẫn giữ để điều tra T&S sau khi import vào Friend Chat.',
      caution:
        'Mutual-like giữ phase chatting vô thời hạn cho tới explicit end; deadline cũ không tiếp tục chặn chat. Khi closed mà chưa mutual, history không còn đọc qua API ẩn danh.',
      followup:
        'Friend Chat vẫn tồn tại sau khi phòng Soul kết thúc; end không xoá Friendship hay Conversation.',
    },
  },
  {
    id: '03-voice-match',
    title: 'Voice Match',
    sources: [
      'docs/services/calling-service.md',
      'apps/media-server/livekit.yaml',
    ],
    core: [
      'Calling: CallSession + token',
      'Ticker: timer + reconnect',
      'Friend: mutual-like',
    ],
    rest: 'REST: join, call state, like, end',
    dataLabel: 'CallSession, likes',
    redisLabel: 'Pub/Sub: call.ended',
    realtime: true,
    external: {
      lines: ['media-server / LiveKit', 'WebRTC audio + room'],
      control: 'Token + signed webhook',
      direct: 'Client ↔ LiveKit: audio',
      kind: 'livekit',
    },
    archNotes: {
      important:
        'Calling là module trong core-api; media-server triển khai LiveKit và không quyết định nghiệp vụ. PostgreSQL giữ CallSession, thời lượng và likes; client truyền audio trực tiếp qua LiveKit.',
      caution:
        'Identity, room và token do server chọn. Webhook phải xác minh chữ ký; ticker và REST reconciliation là backstop, còn Gateway chỉ báo call.ended qua Redis Pub/Sub.',
    },
    flow: [
      step('MatchSession voice confirmed\nMember gọi Calling join'),
      step(
        'Upsert CallSession pending\nKiểm tra session còn hợp lệ; mint token',
      ),
      step('Client nối trực tiếp LiveKit\nWebhook ghi nhận participant'),
      decision(
        'Đủ cả hai người tham gia?',
        option('ĐỦ HAI', 'Call active; ghi startedAt\nBắt đầu timer server'),
        option(
          'CHƯA ĐỦ',
          'Giữ pending để chờ\nQuá pending timeout: ended\nKhông chạy timer active',
          false,
        ),
      ),
      step(
        'Rớt mạng: reconnect grace\nTrong grace: timer tạm dừng\nQuay lại: tiếp tục; quá grace: end',
      ),
      step(
        'Explicit end / tối đa 420 giây\nChốt call + MatchSession terminal\nDọn LiveKit best-effort; call.ended',
      ),
      decision(
        'Cả hai đã gửi like?',
        option(
          'MUTUAL-LIKE',
          'Lock CallSession\nTạo Friendship + Conversation\nChuyển sang Friend Chat',
        ),
        option(
          'CHƯA MUTUAL',
          'Giữ likes đã nhận\nKhông tạo Friendship\nLike còn được gửi khi call ended',
          false,
        ),
      ),
    ],
    flowNotes: {
      important:
        'Voice Match tối đa 7 phút cho mọi tier và không trừ Diamond theo phút. Call ended giải phóng MatchSession; likes immutable có thể được gửi khi active hoặc ended và chỉ mutual mới tạo quan hệ.',
      caution:
        'Pending chưa phải active; chỉ đủ hai participant mới chạy timer. Reconnect grace được loại khỏi thời lượng, token không thể hồi sinh call terminal.',
      followup:
        'Friend call là flow riêng, cần ProfileFollow active hai chiều và không chịu giới hạn 7 phút của Voice Match.',
    },
  },
  {
    id: '04-party-room',
    title: 'Party Room',
    sources: [
      'docs/services/party-room-service.md',
      'docs/services/gift-service.md',
    ],
    core: [
      'PartyRoom: membership + role',
      'Sweeper: grace + cleanup',
      'Gift: Economy boundary',
    ],
    rest: 'REST: room, join, invite, accept',
    dataLabel: 'Room, members, comments',
    redisLabel: 'Pub/Sub: party.* sau commit',
    realtime: true,
    external: {
      lines: ['media-server / LiveKit', 'Host / speaker / audience'],
      control: 'Room + token + media grant',
      direct: 'Client ↔ LiveKit: audio',
      kind: 'livekit',
    },
    archNotes: {
      important:
        'Room, membership, role và comments thuộc PostgreSQL; mọi đổi state serialize bằng lock room. LiveKit áp dụng media grant từ core-api, còn Signaling Gateway fanout event sau commit.',
      caution:
        'Audience có canPublish=false tại SFU. Invite chưa cấp quyền nói; target phải accept trước khi core-api cập nhật role và grant. Một user chỉ có một membership active toàn hệ thống.',
    },
    flow: [
      step('Host tạo room\nRoom + host membership cùng transaction'),
      step('Tạo LiveKit room; mint token\nSFU lỗi: compensate close(error)'),
      step('Member join dưới lock room\nAudience chỉ nghe; kiểm tra capacity'),
      decision(
        'Audience chấp nhận lời mời?',
        option(
          'ACCEPT',
          'Target tự accept\nKiểm tra speaker_limit\nCommit role rồi cập nhật media grant',
        ),
        option(
          'CHƯA ACCEPT',
          'Giữ audience, canPublish=false\nDecline / chờ phản hồi\nTiếp tục nghe',
        ),
      ),
      step('Comment / Gift qua core-api\nLưu trước; fanout sau commit'),
      decision(
        'Host rời theo cách nào?',
        option(
          'REST LEAVE',
          'Đóng phòng ngay: host_left\nChốt membership + dọn SFU',
          false,
        ),
        option(
          'DISCONNECT',
          'Ghi host_disconnected_at\nGiữ membership; chờ grace',
        ),
      ),
      step(
        'Reconnect trong grace: tiếp tục room\nChỉ quá grace: sweeper kiểm tra dưới lock\nRồi đóng room + phát room.closed',
      ),
    ],
    flowNotes: {
      important:
        'Speaker limit snapshot lúc tạo room; host không chiếm speaker slot. Comments append-only và Gift đi qua transaction Economy trước khi bắn hiệu ứng.',
      caution:
        'Host REST leave đóng ngay, webhook disconnect phải chờ grace. Member thường cũng có disconnect grace; sweeper đối chiếu SFU để dọn phòng khi webhook mất.',
      followup:
        'GiftEvent vẫn hợp lệ nếu room đóng sau commit; hiệu ứng realtime là best-effort.',
    },
  },
  {
    id: '05-movie-match-movie-night',
    title: 'Movie Match / Movie Night',
    sources: [
      'docs/services/movie-match-service.md',
      'docs/services/friend-service.md',
    ],
    core: [
      'MovieMatch: queue + session',
      'Playback + anonymous chat',
      'Friend / Safety qua DI',
    ],
    rest: 'REST: session, playback, anon rating',
    dataLabel: 'Session, queue, messages',
    redisLabel: 'Pub/Sub: movie.*',
    realtime: true,
    external: {
      lines: ['YouTube video source', 'Client tự phát video'],
      control: 'Validate URL / chọn video',
      direct: 'Client → YouTube: playback',
      kind: 'provider',
    },
    archNotes: {
      important:
        'core-api giữ playback state trong PostgreSQL và fanout qua Gateway. Friend mode dùng Conversation có sẵn; anonymous mode có queue, chat và rating riêng nhưng vẫn là cùng module MovieMatch.',
      caution:
        'Không có LiveKit, proxy hay transcode video trong flow này. Queue anonymous dùng advisory transaction lock PostgreSQL; Redis chỉ vận chuyển event. URL friend mode phải qua hostname allowlist.',
    },
    flow: [
      step('Người dùng chọn mode xem chung'),
      decision(
        'Friend mode hay anonymous?',
        option(
          'FRIEND',
          'Kiểm tra Friendship\nNhận URL hợp lệ từ user\nTạo / lấy session đúng cặp',
        ),
        option(
          'ANONYMOUS',
          'Enqueue PostgreSQL\nLock matcher + re-check Safety\nGhép cặp; server chọn video',
        ),
      ),
      step('Session giữ slot của hai user\nClient tự phát video từ YouTube'),
      step(
        'PATCH playback vào core-api\nLưu state + timestamp server\nFanout movie.state.changed',
      ),
      step(
        'Chat đúng mode\nFriend: Conversation\nAnonymous: session messages ẩn danh',
      ),
      decision(
        'Kết thúc phần xem?',
        option(
          'FRIEND END',
          'Một member explicit end\nSession ended; nhả hai slot\nKhông có timer tự kết thúc',
          false,
        ),
        option(
          'ANON END / TTL',
          'Ghi watch_ended_at\nMở rating; chưa mặc định matched',
        ),
      ),
      step(
        'Anonymous: rating immutable\nNon-like: not_matched ngay\nMutual-like: tạo Friend + Conversation',
      ),
    ],
    flowNotes: {
      important:
        'Bảng active participants chặn một user ở nhiều phiên active. Anonymous giữ danh tính kín tới outcome matched; rating chưa đủ hai likes vẫn là pending, non-like là terminal ngay.',
      caution:
        'Friend mode không có timer; anonymous có deadline và rating chỉ mở sau watch_ended_at. Playback last-write-wins là state UX, REST là fallback khi event mất.',
      followup:
        'Chỉ anonymous mutual-like mới mở Friendship từ flow này; friend mode đã có quan hệ trước khi tạo session.',
    },
  },
  {
    id: '06-palm-match',
    title: 'Palm Match',
    sources: [
      'docs/services/palm-match-service.md',
      'apps/core-api/src/modules/palm-match/palm-match.service.ts',
    ],
    core: [
      'PalmMatch: template reading',
      'Queue + flip + rating',
      'Friend / Safety qua DI',
    ],
    rest: 'REST: reading, current, flip, rate',
    dataLabel: 'Templates, queue, session',
    redisLabel: '',
    realtime: false,
    external: null,
    archNotes: {
      important:
        'Bài đọc chọn từ templates trong PostgreSQL bằng seed user, category và ngày UTC. Flow ghép ẩn danh có queue và session snapshot trong cùng module PalmMatch; matcher dùng advisory lock PostgreSQL.',
      caution:
        'Không dùng AI provider, Economy hay service ghép riêng. Redis không giữ queue Palm; client lấy current state qua REST. Reading không có lịch sử riêng, còn session snapshot giữ kết quả ghép để reload.',
    },
    flow: [
      step('Chọn bài đọc hoặc ghép ẩn danh'),
      decision(
        'Entry point nào?',
        option(
          'BÀI ĐỌC',
          'Lấy templates active\nSeed theo user + category + ngày UTC\nTrả reading ổn định trong ngày',
          false,
        ),
        option(
          'GHÉP ẨN DANH',
          'Enqueue PostgreSQL\nAdvisory lock; lấy candidate cũ nhất\nRe-check Safety; tạo session snapshot',
        ),
      ),
      step('REST current trả state ẩn danh\nChưa reveal lá của đối phương'),
      step('Mỗi user chỉ flip lá của mình\nIdentity lấy từ JWT'),
      step(
        'Đủ hai flip: reveal kết quả chung\nMở rating; quá hạn thì lazy-expire',
      ),
      decision(
        'Rating like / skip?',
        option(
          'HAI LIKE',
          'Lock session; verdict immutable\nTạo Friendship + Conversation\nChốt matched, reveal profile',
        ),
        option(
          'CHƯA ĐỦ LIKE',
          'Một like: tiếp tục chờ\nBất kỳ skip: not_matched ngay\nKhông reveal profile',
          false,
        ),
      ),
      step(
        'REST reload đọc lại kết quả\nDismiss active: cancel cho cả hai\nDismiss terminal: nhả current pointer',
      ),
    ],
    flowNotes: {
      important:
        'Sign của từng người hiện khi người đó flip; compatibility và fortune chỉ hiện sau hai flip, cùng lúc rating mở. Mutual-like tạo quan hệ trong cùng transaction; skip chốt not_matched ngay, một like riêng vẫn phải chờ.',
      caution:
        'Reading deterministic không có nghĩa kết quả cố định khi catalog thay đổi. Queue ghép serialize qua một advisory lock toàn cục, phù hợp pilot và chưa phải Redis shard.',
      followup:
        'Friendship sau matched mở Friend Chat; Palm không thưởng Diamond.',
    },
  },
  {
    id: '07-feed-va-stories',
    title: 'Feed và Stories',
    sources: [
      'docs/services/feed-service.md',
      'docs/services/media-service.md',
    ],
    core: [
      'Feed: post + interaction',
      'Story: TTL + views',
      'Media / Friend / Safety',
    ],
    rest: 'REST: posts, timeline, stories',
    dataLabel: 'Post, Comment, Story, View',
    redisLabel: '',
    realtime: false,
    external: {
      lines: ['S3-compatible storage', 'Ảnh: quarantine → final'],
      control: 'Presign + validate asset',
      direct: 'Client → storage: upload ảnh',
      kind: 'storage',
    },
    archNotes: {
      important:
        'Feed truy vấn PostgreSQL; audience và block được áp dụng trong core-api. Ảnh upload trực tiếp qua storage, Media kiểm tra owner, metadata và magic bytes trước khi lưu URL final; Story là entity riêng có expiresAt.',
      caution:
        'Feed toàn cục chỉ public; timeline profile lọc audience theo quan hệ. Flow đọc post/story dùng REST, không có fanout feed riêng; reply Story đi tiếp qua Friend Chat với realtime của Friend.',
    },
    flow: [
      step('Chuẩn bị text / imageAssetId\nẢnh upload bằng Media upload intent'),
      step(
        'Backend validate owner + object\nChặn guest tạo nội dung / tương tác',
      ),
      decision(
        'Tạo Post hay Story?',
        option(
          'POST',
          'Lưu audience + content\nIdempotency-Key chặn post trùng',
        ),
        option(
          'STORY',
          'Lưu Story riêng + expiresAt\nTTL snapshot theo giờ server',
        ),
      ),
      step(
        'Đọc qua guard audience + block\nFeed: public; timeline: theo quan hệ\nStory ring: mình + bạn bè',
      ),
      step(
        'Like / comment Post: counter atomic\nStory view: unique; self-view không đếm',
      ),
      decision(
        'Đọc tiếp theo loại nội dung?',
        option(
          'POST',
          'Post không có Story TTL\nGiữ quyền theo audience + block\nTiếp tục tương tác',
        ),
        option(
          'CÒN TTL',
          'Hiển thị nếu có quyền\nBạn bè có thể reply thành DM\nSnapshot mediaUrl vào message',
        ),
        option(
          'HẾT TTL',
          'Ẩn ngay bằng read filter\nSweeper dọn Story + views\nKhông chờ cron để chặn đọc',
          false,
        ),
      ),
      step(
        'Notification theo interaction hợp lệ\nReply DM theo pipeline Friend Chat',
      ),
    ],
    flowNotes: {
      important:
        'Post/comment xoá mềm để giữ audit; Story hết TTL được hard-delete bởi sweeper. Reaction unique và counters cập nhật cùng transaction, view Story không đếm tác giả tự xem.',
      caution:
        'Đi thẳng post URL vẫn phải qua audience/block guard. Story ring chưa phân phối public rộng hơn bạn bè; chỉ tác giả được xem danh sách viewers.',
      followup:
        'Reply cần Friendship và snapshot mediaUrl để DM vẫn hữu ích sau khi Story hết hạn.',
    },
  },
  {
    id: '08-avatar-tuy-chinh',
    title: 'Avatar tùy chỉnh',
    sources: [
      'docs/services/avatar-service.md',
      'docs/services/economy-service.md',
    ],
    core: [
      'Avatar: catalog + ownership',
      'Equip: config theo slot',
      'Economy: spendDiamond',
    ],
    rest: 'REST: catalog, claim, buy, equip',
    dataLabel: 'Asset, ownership, config',
    redisLabel: '',
    realtime: false,
    external: null,
    archNotes: {
      important:
        'Avatar module sở hữu catalog, UserAvatarItem và config năm slots trong PostgreSQL. Item trả phí gọi Economy qua DI; client chỉ ghép layer theo zIndex và không quyết định giá hay ownership.',
      caution:
        'Ledger append-only là nguồn sự thật của debit, Wallet là snapshot. Mua rồi ghi ownership là hai bước idempotent; trang bị phải kiểm tra asset active, đúng slot và thuộc user.',
    },
    flow: [
      step('GET catalog active\nChọn layer theo slot'),
      step('Server đọc lại giá asset\nKhông nhận giá từ client'),
      decision(
        'Giá Diamond bằng 0?',
        option('FREE CLAIM', 'Ghi ownership idempotent\nKhông gọi Economy'),
        option(
          'PAID BUY',
          'Economy spendDiamond theo key\nLock wallet + kiểm tra số dư\nGhi ledger double-entry',
        ),
      ),
      step(
        'Ghi UserAvatarItem idempotent\nRetry sau crash không debit lần hai',
      ),
      step('User yêu cầu equip slot\nCheck active + đúng slot + ownership'),
      step('Upsert UserAvatarConfig\nMỗi slot tối đa một asset'),
      step('REST trả layers theo zIndex\nClient dựng avatar để hiển thị'),
    ],
    flowNotes: {
      important:
        'Item free claim không chạm tiền; paid buy debit trước rồi ghi ownership. Retry cùng key hoàn tất bước còn thiếu mà không trừ lần hai nhờ Economy và unique ownership.',
      caution:
        'Không được equip item chưa sở hữu hoặc sai slot. User.avatarId cũ và config multi-layer là hai dữ liệu riêng; không có refund mua nhầm hay limited inventory trong slice này.',
    },
  },
  {
    id: '09-diamond-top-up-va-vip',
    title: 'Diamond, Top-up và VIP',
    sources: [
      'docs/services/economy-service.md',
      'apps/core-api/src/modules/economy/economy.controller.ts',
    ],
    core: [
      'Economy: catalog + verifier',
      'Ledger: writer duy nhất',
      'Reconciliation + outbox',
    ],
    rest: 'REST: products, top-up, VIP, wallet',
    dataLabel: 'LedgerEntry, tx, Wallet',
    redisLabel: '',
    realtime: false,
    external: {
      lines: ['payOS / Apple / Google', 'Payment + receipt / refund'],
      control: 'Verify receipt / signed webhook',
      direct: 'Client → provider: checkout',
      kind: 'provider',
    },
    archNotes: {
      important:
        'Economy và Ledger là module nội bộ core-api. PostgreSQL giữ Transaction DB-unique idempotencyKey, LedgerEntry double-entry append-only và Wallet snapshot; outbox ghi cùng transaction, relay Kafka chỉ khi bật.',
      caution:
        'Provider phải xác minh server-side trước credit; credential/config quyết định availability. Ledger cũ có DB trigger chặn sửa/xoá, corrections dùng reversal; Redis không phải nguồn số dư.',
    },
    flow: [
      step('Client lấy catalog + capabilities\nGiá và số Diamond từ server'),
      decision(
        'Top-up hay mua VIP?',
        option(
          'TOP-UP',
          'Tạo payOS order hoặc gửi receipt IAP\nChờ provider xác minh payment\nChưa verify thì chưa credit',
        ),
        option(
          'VIP',
          'Đọc plan active + snapshot giá\nLock wallet + đủ Diamond\nChuẩn bị debit và gia hạn',
        ),
      ),
      step(
        'Claim Transaction idempotencyKey\nDB unique; khác payload: conflict',
      ),
      step('Ledger ghi double-entry\nCân từng currency; append-only'),
      step(
        'Cùng transaction: Wallet snapshot\nTop-up: order / receipt credited\nVIP: cộng expiry + outbox',
      ),
      step(
        'Sau commit: trả kết quả / đọc ví\nRetry cùng key trả giao dịch cũ\nVIP active theo giờ server',
      ),
      decision(
        'Có refund / chargeback xác minh?',
        option(
          'REFUND',
          'Ghi transaction reversal mới\nĐảo entries; giữ giao dịch gốc\nWallet có thể âm do nợ Diamond',
          false,
        ),
        option(
          'KHÔNG',
          'Giữ lịch sử và snapshot\nReconciliation read-only\nPhát hiện lệch để điều tra',
        ),
      ),
    ],
    flowNotes: {
      important:
        'Payment pending không phải Diamond đã nạp. Credit/debit, Wallet snapshot và metadata giá commit cùng nhau; mọi retry tiền có idempotency DB, không chỉ cache.',
      caution:
        'Refund không clamp số dư về 0 và không xoá ledger; nợ Diamond có thể làm Wallet âm, guard chặn tiêu tiếp. Reconciliation phát hiện lệch, không tự sửa giao dịch.',
      followup:
        'Avatar, Gift và các luồng tiêu Diamond gọi facade Economy trong cùng core-api; provider readiness phải đọc runtime contract.',
    },
  },
  {
    id: '11-gift',
    title: 'Gift',
    sources: [
      'docs/services/gift-service.md',
      'docs/services/economy-service.md',
      'docs/services/friend-service.md',
    ],
    core: [
      'Gift: catalog + context',
      'Economy: DIA + PTS ledger',
      'Party / Video / Friend guard',
    ],
    rest: 'REST: gifts, room/video/profile gift',
    dataLabel: 'GiftEvent, tx, LedgerEntry',
    redisLabel: 'Pub/Sub: gift.sent ở Party',
    realtime: true,
    external: null,
    archNotes: {
      important:
        'Gift module xác định recipient và context; Economy ghi chân DIA và PTS độc lập, mỗi currency tự cân. GiftEvent, entries, Wallet snapshot và profile conversation khi cần nằm trong cùng transaction PostgreSQL.',
      caution:
        'Gift không chuyển Diamond user→user 1:1; người nhận guest nhận PTS=0. gift.sent chỉ fanout Party sau commit; video/profile dùng notification và kết quả REST, không có room fanout riêng.',
    },
    flow: [
      step('Lấy catalog quà active\nClient chỉ chọn giftId + context'),
      step(
        'Server xác định recipient\nRoom: active members\nVideo / profile: suy từ URL context',
      ),
      step('Re-check quyền + giá hiện tại\nChặn self-gift; xác định PTS guest'),
      decision(
        'Context hợp lệ và đủ Diamond?',
        option(
          'HỢP LỆ',
          'Lock wallet theo thứ tự\nClaim Transaction idempotencyKey\nSnapshot giá + tỷ lệ',
        ),
        option(
          'BỊ CHẶN',
          'Từ chối request\nKhông GiftEvent / ledger mới',
          false,
        ),
      ),
      step(
        'Ghi DIA debit + PTS credit\nMỗi chân double-entry\nGuest: bỏ chân PTS',
      ),
      step(
        'Cùng transaction: GiftEvent\nProfile first-contact: mở Conversation\nGhi notification phù hợp',
      ),
      step(
        'Sau commit: trả GiftEvent\nParty mới fanout gift.sent\nClient bắn hiệu ứng sau xác nhận',
      ),
    ],
    flowNotes: {
      important:
        'Transaction.idempotencyKey unique ở DB và GiftEvent unique theo transactionId; replay trả event cũ. Một bước tiền hoặc nghiệp vụ fail sẽ rollback toàn bộ.',
      caution:
        'PTS là currency riêng, không phải Diamond chuyển thẳng cho người nhận và chưa quy đổi ngược. Hoàn Gift chưa có flow; mọi correction tài chính phải dùng reversal, không sửa ledger cũ.',
      followup:
        'Quà profile mở chat một lần cho cặp; không tính phí trên từng message. Room đóng sau commit có thể mất hiệu ứng nhưng không làm giao dịch sai.',
    },
  },
  {
    id: '12-mini-game',
    title: 'Mini Game',
    sources: ['docs/services/mini-game-service.md'],
    core: [
      'MiniGame: session + moves',
      'Resolve rock-paper-scissors',
      'Friend: kiểm tra quan hệ',
    ],
    rest: 'REST: session, move, cancel',
    dataLabel: 'Session, moves, winner',
    redisLabel: 'Pub/Sub: minigame.*',
    realtime: true,
    external: null,
    archNotes: {
      important:
        'MiniGame module trong core-api giữ session, hai moves và winner ở PostgreSQL. Gateway chỉ fanout session started/resolved; REST state là đường phục hồi khi mất event.',
      caution:
        'Chỉ rock-paper-scissors giữa hai người đã có Friendship. Move được ghi bằng conditional UPDATE, chưa resolved thì DTO không lộ opponentMove; không có event trung gian cho một move.',
    },
    flow: [
      step('Một user chọn người bạn\nYêu cầu tạo / lấy session'),
      step(
        'Core API kiểm tra Friendship\nTạo / lấy session waiting_moves\nMọi endpoint chỉ dành participant',
      ),
      step('Mỗi bên submit một move\nConditional UPDATE khi move còn null'),
      decision(
        'Đã có đủ hai moves?',
        option(
          'ĐỦ HAI',
          'Tính thắng / thua / hoà\nLưu resolved + winner\nMở cả hai moves',
        ),
        option(
          'CHƯA ĐỦ',
          'Giữ waiting_moves\nTrả myMove + opponentHasMoved\nKhông reveal move đối phương',
          false,
        ),
      ),
      step('Sau commit: session.resolved\nGateway fanout cho hai participant'),
      step('REST đọc lại kết quả đã lưu\nChat vẫn qua Conversation riêng'),
    ],
    flowNotes: {
      important:
        'Move đã nộp không đổi được; kết quả resolved lưu trong DB. Participant có thể cancel khi waiting_moves; conditional transition ngăn cancel ghi đè ván vừa resolved.',
      caution:
        'Một move không đồng nghĩa ván đã hoàn tất. Slice này không có timer, phần thưởng Diamond hay tự động chèn kết quả vào chat.',
    },
  },
  {
    id: '13-trust-safety',
    title: 'Trust & Safety',
    sources: [
      'docs/services/safety-service.md',
      'docs/services/discovery-service.md',
      'docs/services/short-video-service.md',
    ],
    core: [
      'Safety: report + block log',
      'User: trust score adjustment',
      'Guards tại từng module',
    ],
    rest: 'REST: report, block, unblock',
    dataLabel: 'Report, Block, trustScore',
    redisLabel: '',
    realtime: false,
    external: null,
    archNotes: {
      important:
        'Safety là module dùng chung trong core-api, giữ Report và Block append-only ở PostgreSQL. Trạng thái block được xác định từ action mới nhất; report-user và trust penalty commit cùng transaction.',
      caution:
        'Mỗi module gọi lại guard tại thời điểm hành động, không chỉ lúc mở màn. Report-user, report-video và admin ban có semantics riêng; Gateway và Redis không quyết định cho phép tương tác.',
    },
    flow: [
      step(
        'User chọn Report / Block / Unblock\nServer validate target + quyền',
      ),
      decision(
        'Hành động nào?',
        option(
          'REPORT USER',
          'Append Report\nPenalty theo cooldown + daily cap\nCùng transaction với trustScore',
        ),
        option(
          'BLOCK / UNBLOCK',
          'Append action khi state đổi\nDerive block từ log mới nhất\nGiữ lịch sử cũ',
        ),
      ),
      step(
        'Matching / Invite re-check canPair\nBlock active + rematch cooldown',
      ),
      step('Discovery lọc hidden-set\nBlock active + mọi report hai chiều'),
      step(
        'Friend Chat / Feed re-check block\nTrả lỗi oracle-safe khi không có quyền',
      ),
      step(
        'Video report đi flow nội dung riêng\nDistinct reports có thể auto-hide\nKhông trừ trustScore tác giả',
      ),
      step(
        'Admin xử lý qua role + permission\nBan / moderation có audit trail',
      ),
    ],
    flowNotes: {
      important:
        'Report giữ evidence ngay cả khi cooldown không cho trừ thêm điểm. Block/unblock không xoá lịch sử, active block chặn tương tác hai chiều.',
      caution:
        'User report không tự đồng nghĩa admin đã duyệt hoặc tự ban. Matching có cooldown theo ngày, Discovery ẩn vĩnh viễn theo report từng có; không đánh đồng hai chính sách.',
      followup:
        'Admin moderation thao tác qua endpoint riêng; video reports áp quy tắc nội dung, không dùng penalty user-report.',
    },
  },
  {
    id: '15-runtime-availability',
    title: 'Runtime Availability',
    sources: [
      'apps/core-api/src/app/capabilities.controller.ts',
      'apps/core-api/src/app/capabilities.service.ts',
    ],
    core: [
      'Capabilities: config snapshot',
      'Provider readiness + maintenance',
      'Backend guards tại endpoint',
    ],
    rest: 'REST: GET /capabilities',
    dataLabel: '',
    redisLabel: '',
    realtime: false,
    external: null,
    archNotes: {
      important:
        'CapabilitiesService trong core-api suy contract từ cấu hình môi trường, credential presence và maintenance. Flow chỉ đọc và trả DTO; không có service availability độc lập hay dữ liệu bền vững mới.',
      caution:
        'Contract không phải health probe của provider và không chứng minh production readiness. Frontend dùng contract để hiển thị, endpoint nghiệp vụ vẫn giữ guard riêng.',
    },
    flow: [
      step('Web / Admin khởi động hoặc refresh\nGọi public GET /capabilities'),
      step(
        'Core API đọc cấu hình đã validate\nProvider + credential + environment',
      ),
      step('Áp maintenance theo capability\nPhân biệt provider native IAP'),
      step('Trả enabled / disabled / beta\nKèm thông điệp capability'),
      decision(
        'Entry point đang khả dụng?',
        option(
          'ENABLED / BETA',
          'Client hiện entry point phù hợp\nBeta thể hiện chế độ thử nghiệm',
        ),
        option(
          'DISABLED',
          'Client ẩn / vô hiệu CTA\nHiển thị lý do từ contract',
          false,
        ),
      ),
      step(
        'User thực hiện nghiệp vụ\nBackend kiểm tra lại quyền + provider\nChỉ side effect khi request hợp lệ',
      ),
    ],
    flowNotes: {
      important:
        'Availability là read-only projection của runtime config, không ghi vào PostgreSQL hay Redis. Apple và Google có trạng thái riêng; không suy cả hai đều sẵn sàng từ một provider.',
      caution:
        'enabled phản ánh cấu hình, không đảm bảo request provider sẽ thành công. Code có thể tồn tại trong repo nhưng production adapter vẫn disabled hoặc chưa được triển khai.',
    },
  },
  {
    id: '16-friend-va-chat-1-1',
    title: 'Friend và Chat 1-1',
    sources: [
      'docs/services/friend-service.md',
      'docs/services/streak-service.md',
      'docs/services/media-service.md',
    ],
    core: [
      'Friend: relation + Conversation',
      'ProfileSocial: follow + contact',
      'Message + member state + streak',
    ],
    rest: 'REST: friends, conversation, message',
    dataLabel: 'Conversation, Message',
    redisLabel: 'Pub/Sub: friend.*',
    realtime: true,
    external: {
      lines: ['S3-compatible storage', 'Ảnh đính kèm qua Media'],
      control: 'Presign + validate imageAssetId',
      direct: 'Client → storage: upload ảnh',
      kind: 'storage',
    },
    archNotes: {
      important:
        'Friendship và Conversation có thể được tạo cùng transaction khi mutual-like. Profile chat cũng mở Conversation trước Friendship; PostgreSQL giữ message append-only, follow và trạng thái read/mute từng member.',
      caution:
        'Follow một chiều, Friendship và Conversation là ba khái niệm riêng. Chat không yêu cầu follow; friend call cần follow active hai chiều. Redis chỉ fanout, REST history là nguồn phục hồi.',
    },
    flow: [
      step('User chọn mở cuộc trò chuyện'),
      decision(
        'Conversation đến từ đâu?',
        option(
          'MUTUAL-LIKE',
          'Ensure Friendship + Conversation\nImport chat ẩn danh nếu có\nCùng transaction của flow nguồn',
        ),
        option(
          'PROFILE CHAT',
          'Server kiểm tra first-contact\nDưới ngưỡng: mở trực tiếp\nVượt ngưỡng: cần Gift mở chat',
        ),
      ),
      step('Gửi text / imageAssetId qua REST\nMembership + block hai chiều'),
      step('Lưu Message idempotent\nCùng transaction: lastMessageAt'),
      step(
        'Sau persist: recordActivity streak\nTransaction riêng; lỗi không mất message',
      ),
      step('Fanout friend.message\nNotification nếu người nhận không mute'),
      step(
        'REST list / history / read / mute\nUnread và member state từ PostgreSQL',
      ),
    ],
    flowNotes: {
      important:
        'Message append-only và unique idempotency key tránh gửi trùng. Profile first-contact dùng chính sách server, Gift mở Conversation một lần cho cặp; không cần người nhận accept Match.',
      caution:
        'Mute tắt notification nhưng không tắt message, realtime hay unread. Conversation membership vẫn phải được kiểm tra dù client đã có conversationId; block trả lỗi oracle-safe.',
      followup:
        'Friend call kiểm tra reciprocal ProfileFollow tại lúc join; isFriend hay canCall trên UI không thay backend guard.',
    },
  },
  {
    id: '17-dang-ky-onboarding-va-guest',
    title: 'Đăng ký, Onboarding và Guest',
    sources: [
      'apps/core-api/src/modules/auth/auth.controller.ts',
      'apps/core-api/src/modules/auth/auth.service.ts',
      'apps/core-api/src/modules/auth/controllers/auth-upgrade.controller.ts',
      'apps/core-api/src/modules/user/user.controller.ts',
    ],
    core: [
      'Auth: OTP + social + guest',
      'Refresh rotation + identity link',
      'User: profile + privacy',
    ],
    rest: 'REST: login, refresh, upgrade, me',
    dataLabel: 'User, Identity, RefreshToken',
    redisLabel: '',
    realtime: false,
    external: {
      lines: ['OTP / identity providers', 'Google / Apple / Facebook'],
      control: 'Server verify OTP / identity',
      direct: 'Client → provider: sign-in',
      kind: 'provider',
    },
    archNotes: {
      important:
        'Auth/User là module core-api, lưu identity, profile và refresh session vào PostgreSQL. Provider identity phải verify server-side; guest cũng có User để các dữ liệu sau nâng cấp giữ nguyên userId.',
      caution:
        'Refresh token nằm trong cookie httpOnly; refresh/logout có CSRF guard và rotation phát hiện reuse. Provider availability theo runtime config, không tự suy từ nút login ở frontend.',
    },
    flow: [
      step('Client đọc auth capabilities\nChọn phương thức đăng nhập'),
      decision(
        'Phương thức nào?',
        option(
          'GUEST',
          'Tìm / tạo guest bằng deviceId\nGiữ isGuest để hạn chế tính năng',
        ),
        option(
          'PHONE OTP',
          'Request OTP theo rate limit\nServer verify OTP\nTìm / tạo User + phone identity',
        ),
        option(
          'SOCIAL',
          'Provider sign-in ở client\nServer verify token Google/Apple/FB\nTìm / tạo User + identity',
        ),
      ),
      step(
        'Cấp access token + refresh session\nĐặt cookie httpOnly + CSRF token',
      ),
      step(
        'Onboarding cập nhật GET/PATCH me\nServer validate profile + privacy',
      ),
      step('Refresh rotate session\nReuse bị phát hiện; logout thu hồi'),
      decision(
        'Guest yêu cầu upgrade?',
        option(
          'IDENTITY CÒN TRỐNG',
          'Xác minh OTP / social identity\nGắn vào cùng User\nĐổi trạng thái guest; cấp session',
        ),
        option(
          'IDENTITY XUNG ĐỘT',
          'Từ chối identity conflict\nKhông auto-merge account\nGiữ dữ liệu user hiện tại',
          false,
        ),
        option(
          'KHÔNG UPGRADE',
          'Tiếp tục session hiện tại\nGiữ guest restrictions nếu còn guest',
        ),
      ),
      step(
        'User tiếp tục bằng cùng userId\nBackend áp quyền theo account hiện tại',
      ),
    ],
    flowNotes: {
      important:
        'Nâng cấp guest gắn identity vào chính User hiện tại, giữ quan hệ và dữ liệu. Identity unique ngăn cùng tài khoản provider được gắn cho hai User.',
      caution:
        'Token provider phải được xác minh tại server; không tin profile tự gửi ở client. Identity đã thuộc tài khoản khác không được auto-merge; giới hạn guest vẫn áp dụng ở endpoint nghiệp vụ.',
    },
  },
  {
    id: '18-discovery-nearby-va-direct-invite',
    title: 'Discovery, Nearby và Direct Invite',
    sources: [
      'docs/services/discovery-service.md',
      'docs/services/matching-service.md',
      'docs/services/friend-service.md',
    ],
    core: [
      'Discovery: browse + Nearby',
      'Matching Invite: consent + session',
      'User / Safety / Friend qua DI',
    ],
    rest: 'REST: browse, nearby, invites',
    dataLabel: 'Location, setting, Invite',
    redisLabel: 'Rate limit + invite Pub/Sub',
    realtime: true,
    external: null,
    archNotes: {
      important:
        'Discovery query User và giữ vị trí quantized/settings trong PostgreSQL. Invite thuộc module Matching trong core-api; accept tạo hai confirmed tickets và MatchSession trực tiếp, không đi hàng đợi Sorted Set.',
      caution:
        'Nearby opt-in đối xứng, không lưu toạ độ thô và chỉ trả distanceBucket; Redis dùng rate limit và fanout. Browse lọc gender/tuổi, không dùng User.region làm thành phố.',
    },
    flow: [
      step('User mở Browse hoặc Nearby'),
      decision(
        'Nguồn danh sách?',
        option(
          'BROWSE',
          'Query profile theo gender / tuổi\nLoại self, hidden-set và user không hợp lệ',
        ),
        option(
          'NEARBY',
          'Opt-in + vị trí quantized còn tươi\nRate limit; jitter theo cặp/ngày\nChỉ trả distanceBucket',
        ),
      ),
      step('Client xem card / profile\nAge bucket, không trả birthDate thô'),
      decision(
        'Hành động tiếp theo?',
        option(
          'MỜI SOUL / VOICE',
          'Matching lưu invite pending\nTTL + rate limit + unique pending pair',
        ),
        option(
          'PROFILE CHAT',
          'Qua Friend first-contact policy\nCần Gift nếu vượt ngưỡng\nKhông tạo MatchSession',
          false,
        ),
      ),
      step('Invitee chủ động accept\nRe-check canPair + trạng thái bận'),
      step(
        'Hợp lệ: tạo 2 confirmed tickets\nCùng transaction: MatchSession\nAccept replay trả session cũ',
      ),
      step(
        'Sau commit: match.confirmed\nHai client đọc lại rồi mở Soul / Voice',
      ),
    ],
    flowNotes: {
      important:
        'Direct invite là consent cụ thể nên accept không dùng gender preference của auto-match. User đang bận khiến accept rollback và invite giữ pending để thử lại; Safety fail chốt declined.',
      caution:
        'Decline/cancel/expiry không tạo session; pending chưa phải matched. Tắt Nearby xoá vị trí cùng transaction; stale location tự bị lọc lúc đọc, API không lộ toạ độ hay khoảng cách chính xác.',
      followup:
        'Invite accepted đi vào Soul hoặc Calling; profile chat là lựa chọn riêng qua Friend/Gift.',
    },
  },
  {
    id: '19-mood-va-conversation-streak',
    title: 'Mood và Conversation Streak',
    sources: [
      'docs/services/mood-service.md',
      'docs/services/streak-service.md',
    ],
    core: [
      'Mood: preset + set/clear events',
      'Friend.Streak: activity UTC',
      'Warning job + Notification',
    ],
    rest: 'REST: preset, mood, streak',
    dataLabel: 'Mood events, Streak state',
    redisLabel: 'Pub/Sub: friend.streak.*',
    realtime: true,
    external: null,
    archNotes: {
      important:
        'Mood là module riêng trong core-api; StreakService nằm trong Friend. PostgreSQL giữ mood events append-only và streak state; realtime thuộc nhánh streak, không phải một mood event bus riêng.',
      caution:
        'Mood active được xác định bằng event mới nhất và expiresAt. Streak cập nhật trong transaction riêng sau message; Redis không giữ ngày hoạt động hay bộ đếm nguồn sự thật.',
    },
    flow: [
      step('Hai nhánh nghiệp vụ độc lập'),
      decision(
        'Cập nhật Mood hay chat activity?',
        option(
          'MOOD',
          'Chọn preset active / clear\nAppend event idempotent\nSet snapshot expiresAt',
        ),
        option(
          'STREAK',
          'Lưu Friend Message trước\nGhi activity sau đó\nLock streak row trong transaction riêng',
        ),
      ),
      decision(
        'Nhánh nào cần đọc / tính tiếp?',
        option(
          'MOOD READ',
          'Event mới nhất + TTL server\nẨn nếu clear / expired / block\nKhông cần job hết hạn',
          false,
        ),
        option(
          'STREAK ACTIVITY',
          'Ghi ngày UTC bên gửi\nĐợi đủ hai chiều trong cùng ngày',
        ),
      ),
      step(
        'Đủ hai chiều và chưa confirm hôm nay\nGap 1: tăng; gap 2: grace cứu\nGap ≥3: reset current về 1',
      ),
      step('Lưu current / longest / confirmedDate\nMỗi ngày chỉ tăng một lần'),
      step(
        'Milestone: realtime + notification\nWarning job chỉ đánh dấu cảnh báo',
      ),
      step(
        'REST xác định display streak theo gap\nQuá grace: hiển thị current = 0',
      ),
    ],
    flowNotes: {
      important:
        'Mood set lại cùng preset refresh TTL bằng event mới. Streak chỉ tăng khi cả hai đã nhắn trong ngày UTC; lỡ đúng một ngày được grace cứu, longest không giảm.',
      caution:
        'Streak lỗi không rollback message đã lưu; warning job không tăng/reset streak. Mood không được đưa vào card ẩn danh trước mutual-like; không có free-text mood hay thưởng Diamond trong flow này.',
    },
  },
  {
    id: '20-short-video',
    title: 'Short Video',
    sources: [
      'docs/services/short-video-service.md',
      'docs/services/gift-service.md',
    ],
    core: [
      'ShortVideo: lifecycle + views',
      'Ranking + moderation guards',
      'Safety / Admin / Gift qua DI',
    ],
    rest: 'REST: upload, finalize, view, report',
    dataLabel: 'Video, View, Report',
    redisLabel: '',
    realtime: false,
    external: {
      lines: ['Storage + transcode ports', 'Dev adapters / unavailable'],
      control: 'Presign + transcode adapter',
      direct: 'Client → storage: upload video',
      kind: 'storage',
    },
    archNotes: {
      important:
        'ShortVideo module giữ lifecycle và interactions trong PostgreSQL; body video upload trực tiếp lên storage. Storage/transcode là ports hạ tầng của core-api, không phải backend business deployable mới.',
      caution:
        'Repo có dev adapters và production view-only/unavailable; chưa có vendor storage/transcode thật cho video. VIDEO_UPLOAD_ENABLED và runtime capabilities chặn upload trước side effect; không suy provider ready từ sơ đồ.',
    },
    flow: [
      step('Kiểm tra upload capability\nEnabled mới tạo upload intent'),
      step('Lưu Video uploading theo key\nCấp presigned URL cho storageKey'),
      step('Client upload trực tiếp storage\nFinalize: uploading → processing'),
      step('Transcode qua adapter\nLỗi: failed; thành công: theo review mode'),
      decision(
        'Moderation mode?',
        option(
          'PRE-REVIEW',
          'pending_review: chưa hiển thị\nAdmin approve → published\nAdmin reject → rejected',
        ),
        option(
          'POST-REVIEW',
          'Processing xong → published\nDuyệt / report tiếp tục sau công bố',
        ),
      ),
      decision(
        'Video đã published?',
        option(
          'PUBLISHED',
          'Cho phép xuất hiện trong video feed\nTiếp tục tương tác',
        ),
        option(
          'CHƯA PUBLISHED',
          'pending_review: còn chờ duyệt\nrejected / failed: không vào feed\nChỉ approve mới mở nhánh published',
          false,
        ),
      ),
      step(
        'Qualified view unique; self-view bỏ qua\nLike / comment cập nhật counters',
      ),
      step(
        'Tính ranking + fallback recent\nReport distinct vượt ngưỡng: removed\nAdmin gỡ có audit',
      ),
    ],
    flowNotes: {
      important:
        'Lifecycle dùng conditional transitions; pending_review chưa published. Qualified view chỉ false→true một lần cho mỗi viewer, counter cập nhật atomic; ranking là read model có fallback recent.',
      caution:
        'Upload timeout hoặc transcode lỗi chỉ chuyển uploading/processing sang failed; sweeper dọn storage của video failed theo lô. Trong pre-review, reject không đi tiếp sang feed. Video report không trừ trustScore user; không cấp lại upload URL sau khi video đã rời uploading.',
      followup:
        'Gift xác định recipient từ tác giả video; pin profile và share vào chat chưa thuộc slice này.',
    },
  },
  {
    id: '21-notification',
    title: 'Notification',
    sources: [
      'docs/services/notification-service.md',
      'docs/services/friend-service.md',
    ],
    core: [
      'Notification: in-app rows',
      'WebPushSubscription + push port',
      'Modules gọi trực tiếp qua DI',
    ],
    rest: 'REST: list, unread, read, subscribe',
    dataLabel: 'Notification, subscription',
    redisLabel: '',
    realtime: false,
    external: {
      lines: ['FCM / APNs / Web Push', 'Tùy adapter + credential'],
      control: 'Best-effort push sau commit',
      direct: 'Provider → device / browser',
      direction: 'to-client',
      kind: 'provider',
    },
    archNotes: {
      important:
        'Notification là module core-api, nhận trigger qua DI và lưu row in-app trong PostgreSQL. Khi có shared transaction, notification atomic cùng hành động gốc; Friend message dùng transaction riêng best-effort sau persist.',
      caution:
        'Flow này không dùng Outbox/Kafka hay Redis queue để tạo notification. Push provider là side effect sau commit; disabled adapter vẫn giữ in-app rows, lỗi push không rollback nghiệp vụ.',
    },
    flow: [
      step('Module phát trigger hợp lệ\nMatch / message / gift / interaction'),
      step(
        'Lọc recipient + policy\nSelf-interaction bỏ qua\nMute chặn friend_message notification',
      ),
      step(
        'Lưu Notification in-app\nDùng chung manager khi có transaction\nFriend message: transaction riêng',
      ),
      step('Commit durable notification\nPayload tối thiểu theo loại event'),
      decision(
        'Push adapter + endpoint sẵn sàng?',
        option(
          'CÓ',
          'Gửi push best-effort sau commit\nProvider lỗi: log + bỏ qua',
        ),
        option('DISABLED / THIẾU', 'Bỏ external push\nIn-app row vẫn còn'),
      ),
      step('Client GET list + unread-count\nREST phục hồi khi push không đến'),
      step('Owner đánh dấu read idempotent\nLưu readAt vào PostgreSQL'),
    ],
    flowNotes: {
      important:
        'In-app Notification được lưu trước push. Web Push subscription thuộc user; endpoint 404/410 được dọn, còn native token registration/rotation chưa có contract đầy đủ trong slice này.',
      caution:
        'match_confirmed không chứa partner identity; Soul messages không tạo notification. Push thất bại không chứng minh hành động gốc thất bại và không được làm rollback nó.',
    },
  },
  {
    id: '22-support-va-admin-operations',
    title: 'Support và Admin Operations',
    sources: [
      'apps/core-api/src/modules/support/support.controller.ts',
      'apps/core-api/src/modules/support/support.service.ts',
      'apps/core-api/src/modules/admin/admin.controller.ts',
      'apps/core-api/src/modules/admin/admin.service.ts',
    ],
    core: [
      'Support: ticket + transitions',
      'Admin: role + permission guards',
      'Domain actions + audit log',
    ],
    rest: 'REST: support/tickets, admin',
    dataLabel: 'Ticket, audit, permission',
    redisLabel: '',
    realtime: false,
    external: null,
    archNotes: {
      important:
        'Support và Admin đều là module trong core-api; apps/admin là frontend. PostgreSQL giữ ticket, response, permission và audit; admin action gọi public API của domain tương ứng.',
      caution:
        'Role Admin/Moderator chưa đủ: từng endpoint còn áp dụng AdminPermissionGuard. User chỉ xem ticket của mình; thao tác tiền vẫn qua Economy và reversal, không chỉnh ledger trực tiếp.',
    },
    flow: [
      step('User gửi category + message\nIdempotency-Key bắt buộc'),
      step(
        'Ghi SupportTicket Open\nUnique user + key; replay trả ticket cũ\nKhác payload: conflict',
      ),
      step('User theo dõi GET tickets/me\nStaff lọc danh sách qua Admin'),
      step(
        'Staff chọn ticket / domain action\nSupport, user, video, catalog, Economy',
      ),
      decision(
        'Role + permission cho phép?',
        option(
          'ĐƯỢC PHÉP',
          'Backend authorize action\nGọi domain API tương ứng',
        ),
        option(
          'BỊ CHẶN',
          'Từ chối request\nKhông áp thay đổi nghiệp vụ',
          false,
        ),
      ),
      step(
        'Nếu Support: lock + transition\nNếu domain khác: áp guard domain\nGhi response / kết quả của action',
      ),
      step(
        'Commit thay đổi + audit phù hợp\nSupport: Closed terminal\nClient đọc lại để thấy kết quả',
      ),
    ],
    flowNotes: {
      important:
        'Ticket retry cùng key trả row cũ; Open chuyển sang InProgress, Resolved hoặc Closed, InProgress chuyển sang Resolved hoặc Closed, Resolved chỉ sang Closed. Admin action giữ actor/audit và gọi domain owner.',
      caution:
        'Không quay ticket Closed về Open; replay cùng status hợp lệ nhưng khác transition bị chặn. Ban/moderation/catalog và refund có permission riêng; correction tài chính chỉ tạo reversal mới.',
    },
  },
];
