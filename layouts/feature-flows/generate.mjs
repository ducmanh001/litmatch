import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const sourceDir = path.dirname(fileURLToPath(import.meta.url));
const outDir = process.env.LITMATCH_OUTPUT_DIR
  ? path.resolve(process.env.LITMATCH_OUTPUT_DIR)
  : path.join(sourceDir, 'review');
const writeAll = process.argv.includes('--all');
const width = 1208;
const colors = {
  background: '#121314',
  node: '#0d273f',
  nodeBorder: '#1c354b',
  text: '#83c3ff',
  line: '#666666',
  accent: '#68a9e0',
};

const plain = (label, tone = 'blue') => ({ type: 'plain', label, tone });
const branch = (question, yes, no, yesTag = 'ĐI TIẾP', noTag = 'NHÁNH KHÁC') => ({
  type: 'branch',
  question,
  options: [
    { tag: yesTag, text: yes, tone: 'green', continues: true },
    { tag: noTag, text: no, tone: 'red', continues: false },
  ],
});

const matching = {
  file: '01-matching-queue-flow',
  title: 'Matching Queue → MatchSession',
  subtitle: 'Luồng ghép Soul / Voice trong module Matching của core-api',
  source: 'docs/services/matching-service.md',
  note: 'Invite được chấp nhận là lối vào riêng: Core API tạo session trực tiếp, không chờ Sorted Set.',
  stages: [
    plain('User chọn Soul hoặc Voice, gửi POST /matching/tickets'),
    plain('Core API kiểm tra quyền, quota, ticket đang hoạt động, idempotency và preference'),
    plain('PostgreSQL lưu MatchTicket status = queued; đây là trạng thái bền vững'),
    plain('Redis Sorted Set nhận ticket trong shard theo matchType, region và ageBand'),
    plain('MatcherWorker trong core-api quét shard; ZPOPMIN lấy hai ticket ưu tiên cao nhất'),
    branch(
      'Hai ticket còn hợp lệ và có thể ghép?',
      'Postgres khóa hai ticket, kiểm tra lại trạng thái, user khác nhau, preference hai chiều và block/report; tạo MatchSession confirmed cùng hai ticket confirmed trong một transaction.',
      'Ticket không hợp lệ bị expire; ticket còn hợp lệ được requeue với lượt chờ ban đầu.',
      'CÓ',
      'KHÔNG',
    ),
    plain('Sau commit, phát match.confirmed qua Redis Pub/Sub; Signaling Gateway fanout tới hai client', 'teal'),
    plain('Client refetch state rồi mở Soul Match hoặc gọi Calling để vào Voice Match', 'purple'),
  ],
};

const features = [
  {
    title: 'Soul Match',
    subtitle: 'Chat text ẩn danh, rating và mở Friendship khi mutual-like',
    source: 'docs/services/soul-match-service.md',
    stages: [
      plain('Matching xác nhận MatchSession với matchType = soul'),
      plain('Hai người chat ẩn danh; server đặt deadline chat và rating'),
      plain('Rating rude / boring / like mở ngay; hết giờ chat thì khóa gửi, còn đọc và rating'),
      branch(
        'Đã có đủ hai rating và cả hai chọn like?',
        'Cùng transaction tạo Friendship + Conversation, import lịch sử chat và mở profile.',
        'Đến hết rating window: phase closed; không mở profile hay Friendship.',
        'CÓ',
        'KHÔNG',
      ),
    ],
  },
  {
    title: 'Voice Match',
    subtitle: 'Ghép đôi, gọi LiveKit, server kết thúc ở giới hạn 7 phút',
    source: 'docs/services/calling-service.md',
    stages: [
      plain('Chọn Voice → Matching tạo hai ticket và MatchSession confirmed'),
      plain('Hai client gọi Calling join; Core API tạo hoặc lấy CallSession'),
      plain('Core API cấp token LiveKit; hai client kết nối media trực tiếp tới LiveKit'),
      plain('Khi cả hai đã vào phòng, server bắt đầu timer; reconnect có grace window'),
      plain('Server kết thúc Voice Match tối đa sau 420 giây; mỗi bên có thể gửi like'),
      branch(
        'Hai bên cùng like?',
        'Calling tạo Friendship + Conversation atomically; chat bền vững mở sau call.',
        'Call kết thúc, không tạo quan hệ bạn bè từ phiên này.',
        'CÓ',
        'KHÔNG',
      ),
    ],
  },
  {
    title: 'Party Room',
    subtitle: 'Phòng audio nhiều người với host, speaker và audience',
    source: 'docs/services/party-room-service.md',
    stages: [
      plain('Host tạo phòng; Core API lưu room và membership của host'),
      plain('Core API tạo LiveKit room và cấp token với role từ server'),
      plain('Audience tham gia chỉ nghe; host có quyền mời người lên speaker'),
      plain('Người được mời tự accept → server đổi role và cấp quyền phát audio'),
      plain('Thành viên comment hoặc gửi Gift; event được publish sau khi lưu'),
      plain('Host đóng phòng, hoặc webhook / sweeper dọn phòng bị bỏ lại', 'teal'),
    ],
  },
  {
    title: 'Movie Match / Movie Night',
    subtitle: 'Xem chung với bạn hoặc ghép người lạ để xem ẩn danh',
    source: 'docs/services/movie-match-service.md',
    stages: [
      plain('Chọn mode xem phim'),
      {
        type: 'branch',
        question: 'Xem với bạn hay ghép người lạ?',
        options: [
          { tag: 'BẠN BÈ', text: 'Kiểm tra Friendship → tạo phiên với video URL do người dùng chọn.', tone: 'blue', continues: true },
          { tag: 'ẨN DANH', text: 'Vào queue → matcher ghép bằng lock PostgreSQL → server chọn video.', tone: 'purple', continues: true },
        ],
      },
      plain('Hai bên đồng bộ playback qua realtime; mode ẩn danh có chat riêng theo session'),
      branch(
        'Kết thúc phiên theo mode nào?',
        'Friend mode: một bên kết thúc session và giải phóng slot của hai người.',
        'Anonymous: hết giờ / kết thúc xem → rating; mutual-like mới tạo Friendship + Conversation.',
        'BẠN BÈ',
        'ẨN DANH',
      ),
    ],
  },
  {
    title: 'Palm Match',
    subtitle: 'Bài đọc theo template và queue ghép ẩn danh',
    source: 'docs/services/palm-match-service.md',
    stages: [
      plain('Có hai entry point: xem bài đọc trong ngày hoặc vào Palm Match ẩn danh'),
      {
        type: 'branch',
        question: 'Người dùng chọn entry point nào?',
        options: [
          { tag: 'BÀI ĐỌC', text: 'Server seed theo user + category + ngày UTC → chọn template ổn định trong ngày.', tone: 'blue', continues: false },
          { tag: 'GHÉP ĐÔI', text: 'Queue → lock matcher → chọn đối thủ cũ nhất → kiểm tra Safety → tạo session snapshot.', tone: 'purple', continues: true },
        ],
      },
      plain('Mỗi người chỉ lật lá của mình; server chỉ reveal sau khi cả hai đã lật'),
      plain('Mỗi bên rate một lần; kết quả được lưu để reload không đổi'),
      branch(
        'Cả hai cùng like?',
        'Tạo Friendship + Conversation atomically và mở profile đối phương.',
        'Session kết thúc; không mở profile.',
        'CÓ',
        'KHÔNG',
      ),
    ],
  },
  {
    title: 'Feed và Stories',
    subtitle: 'Bài đăng có audience, reaction/comment và Story hết hạn',
    source: 'docs/services/feed-service.md',
    stages: [
      plain('Tạo post hoặc Story; ảnh được upload qua Media Service'),
      plain('Core API lưu nội dung, audience và quyền xem'),
      plain('Feed truy vấn nội dung người xem được phép thấy; Safety lọc block'),
      plain('Người dùng xem, reaction hoặc comment; tương tác được lưu idempotent'),
      plain('Story hết hạn theo thời điểm server; sweeper dọn dữ liệu quá hạn', 'teal'),
    ],
  },
  {
    title: 'Avatar tùy chỉnh',
    subtitle: 'Catalog item, mua bằng Diamond và trang bị vào avatar',
    source: 'docs/services/avatar-service.md',
    stages: [
      plain('Mở catalog avatar và chọn item'),
      branch('Item có giá Diamond?', 'Economy kiểm tra số dư và ghi giao dịch mua.', 'Item miễn phí được chọn mà không trừ Diamond.', 'CÓ', 'MIỄN PHÍ'),
      plain('Core API ghi nhận item thuộc sở hữu của user'),
      plain('User trang bị item; server kiểm tra ownership'),
      plain('Profile trả avatar đã lắp ghép cho client'),
    ],
  },
  {
    title: 'Diamond, Top-up và VIP',
    subtitle: 'Nạp tiền được xác minh server-side; mọi debit qua ledger',
    source: 'docs/services/economy-service.md',
    stages: [
      plain('Client lấy catalog sản phẩm / gói VIP từ server'),
      {
        type: 'branch',
        question: 'Nạp Diamond hay mua VIP bằng Diamond?',
        options: [
          { tag: 'TOP-UP', text: 'Mở payOS / Apple / Google; server xác minh webhook hoặc receipt.', tone: 'blue', continues: true },
          { tag: 'VIP', text: 'Khóa wallet, kiểm tra số dư rồi ghi debit và cộng hạn VIP.', tone: 'purple', continues: true },
        ],
      },
      plain('Economy ghi LedgerEntry append-only và cập nhật wallet snapshot trong transaction'),
      plain('Trả kết quả giao dịch; retry cùng idempotency key không cộng/trừ lần hai', 'teal'),
    ],
  },
  {
    title: 'Matching Speed-up',
    subtitle: 'Trừ Diamond và thay đổi score của ticket đang chờ',
    source: 'docs/services/matching-service.md',
    stages: [
      plain('User yêu cầu speed-up cho ticket'),
      branch('Ticket còn queued?', 'Server lấy giá theo tier và gọi Economy trừ Diamond.', 'Từ chối; ticket đã được ghép, huỷ hoặc hết hạn.', 'CÓ', 'KHÔNG'),
      plain('Redis cập nhật score Sorted Set theo boost đã mua'),
      plain('Matcher thấy ticket có thứ tự ưu tiên cao hơn'),
    ],
  },
  {
    title: 'Gift',
    subtitle: 'Quà dùng được ở Party Room, video và mở chat profile',
    source: 'docs/services/gift-service.md',
    stages: [
      plain('Client lấy catalog quà active và chọn quà'),
      plain('Server xác định recipient theo context, kiểm tra quyền và membership'),
      branch('Context hợp lệ và đủ Diamond?', 'Economy ghi debit DIA và credit PTS theo tỷ lệ cấu hình.', 'Từ chối; không ghi giao dịch hoặc GiftEvent.', 'CÓ', 'KHÔNG'),
      plain('Lưu GiftEvent cùng nghiệp vụ; sau commit phát gift.sent realtime', 'teal'),
    ],
  },
  {
    title: 'Mini Game',
    subtitle: 'Oẳn tù tì hai người bạn, nước đi được giữ kín đến khi đủ hai bên',
    source: 'docs/services/mini-game-service.md',
    stages: [
      plain('Một người bạn tạo session oẳn tù tì'),
      plain('Người thứ nhất gửi rock / paper / scissors; đối phương chưa thấy nước đi'),
      plain('Người thứ hai gửi nước đi; server khóa mỗi người một lần'),
      branch('Đã có đủ hai nước đi?', 'Server tính thắng / thua / hòa và lưu kết quả.', 'Session tiếp tục chờ; response không lộ nước đi đối phương.', 'ĐỦ', 'CHƯA'),
      plain('Sau khi resolve, publish kết quả cho cả hai qua realtime', 'teal'),
    ],
  },
  {
    title: 'Trust & Safety',
    subtitle: 'Report, block và các chốt lọc áp dụng xuyên nhiều chức năng',
    source: 'docs/services/safety-service.md',
    stages: [
      plain('User gửi report hoặc block / unblock'),
      {
        type: 'branch',
        question: 'Report hay block?',
        options: [
          { tag: 'REPORT', text: 'Append report; report hiệu lực có thể giảm trust score theo cooldown.', tone: 'yellow', continues: true },
          { tag: 'BLOCK', text: 'Append trạng thái block; block active chặn tương tác hai chiều.', tone: 'red', continues: true },
        ],
      },
      plain('Matching kiểm tra lại canPair tại lúc ghép; Discovery lọc người bị ẩn'),
      plain('Chat kiểm tra block trước khi gửi; video có luồng report/moderation riêng'),
      plain('Report người dùng không tự động đồng nghĩa admin đã duyệt; auto-ban chưa có', 'teal'),
    ],
  },
  {
    title: 'Preference khi Matching',
    subtitle: 'Snapshot preference và kiểm tra hai chiều ngay tại thời điểm ghép',
    source: 'docs/services/matching-service.md',
    stages: [
      plain('User chọn gender preference; region và age band lấy theo profile/quy tắc server'),
      plain('Ticket lưu preference snapshot; shard theo match type, region, age band'),
      plain('Matcher lấy hai candidate rồi mở transaction PostgreSQL'),
      branch('Cả hai preference đều khớp và Safety cho phép?', 'Lock ticket, tạo MatchSession confirmed atomically.', 'Không pair; requeue ticket còn hợp lệ hoặc expire ticket stale.', 'CÓ', 'KHÔNG'),
    ],
  },
  {
    title: 'Runtime Availability',
    subtitle: 'Client hiển thị tính năng dựa trên provider/config server hiện tại',
    source: 'apps/core-api/src/app/capabilities.controller.ts',
    stages: [
      plain('Web/Admin gọi GET /capabilities khi khởi động hoặc refresh'),
      plain('Core API suy ra availability từ cấu hình và adapter đã bật'),
      plain('Trả capability contract cho client'),
      plain('Client chỉ hiện entry point phù hợp; backend vẫn kiểm tra lại khi gọi API', 'teal'),
    ],
  },
  {
    title: 'Friend và Chat 1-1',
    subtitle: 'Friendship từ mutual-like hoặc Conversation mở trực tiếp từ profile',
    source: 'docs/services/friend-service.md',
    stages: [
      {
        type: 'branch',
        question: 'Conversation được mở bằng cách nào?',
        options: [
          { tag: 'MUTUAL-LIKE', text: 'FriendService tạo Friendship + Conversation cùng transaction.', tone: 'green', continues: true },
          { tag: 'PROFILE CHAT', text: 'Mở conversation theo first-contact policy; có thể cần Gift.', tone: 'blue', continues: true },
        ],
      },
      plain('Gửi message có idempotency key; Core API lưu append-only và cập nhật lastMessageAt'),
      plain('Phát friend.message realtime; REST list/read là nguồn phục hồi'),
      plain('Read/mute/unread được lưu theo member; streak cập nhật theo activity hai chiều'),
      plain('Friend call là flow riêng và cần ProfileFollow active theo hai chiều', 'purple'),
    ],
  },
  {
    title: 'Đăng ký, Onboarding và Guest',
    subtitle: 'Guest, phone OTP, social login và nâng cấp giữ nguyên userId',
    source: 'apps/core-api/src/modules/auth/auth.controller.ts',
    stages: [
      plain('Người dùng chọn guest, phone OTP hoặc social login'),
      {
        type: 'branch',
        question: 'Phương thức xác thực?',
        options: [
          { tag: 'GUEST / OTP', text: 'Tạo guest hoặc xác minh OTP rồi tìm/tạo User.', tone: 'blue', continues: true },
          { tag: 'SOCIAL', text: 'Server xác minh identity Google / Apple / Facebook rồi tìm/tạo User.', tone: 'purple', continues: true },
        ],
      },
      plain('Cấp access và rotating refresh session'),
      plain('Guest upgrade gắn identity vào cùng User; nếu identity thuộc account khác thì không auto-merge'),
    ],
  },
  {
    title: 'Discovery, Nearby và Direct Invite',
    subtitle: 'Browse profile, vị trí opt-in và lời mời match có consent',
    source: 'docs/services/discovery-service.md',
    stages: [
      plain('User mở Browse hoặc bật Nearby'),
      {
        type: 'branch',
        question: 'Browse hay Nearby?',
        options: [
          { tag: 'BROWSE', text: 'Lọc profile theo preference và tập hidden do Safety trả.', tone: 'blue', continues: true },
          { tag: 'NEARBY', text: 'Dùng vị trí opt-in đã quantize/jitter; rate-limit truy vấn.', tone: 'purple', continues: true },
        ],
      },
      plain('Client xem card/profile; server không trả ngày sinh thô trên Discovery card'),
      branch('User chọn hành động gì?', 'Tạo direct Soul/Voice invite; người nhận accept thì Core API tạo session trực tiếp.', 'Mở profile chat theo chính sách Friend/Gift.', 'MỜI MATCH', 'CHAT PROFILE'),
    ],
  },
  {
    title: 'Mood và Conversation Streak',
    subtitle: 'Mood có TTL; streak dựa trên tin nhắn hai chiều theo ngày UTC',
    source: 'docs/services/mood-service.md · docs/services/streak-service.md',
    stages: [
      plain('Hai flow liên quan: cập nhật mood và ghi nhận hoạt động chat'),
      {
        type: 'branch',
        question: 'User đang thực hiện flow nào?',
        options: [
          { tag: 'MOOD', text: 'Chọn preset active → lưu snapshot với expiresAt; privacy/block lọc lúc đọc.', tone: 'purple', continues: false },
          { tag: 'STREAK', text: 'Sau Friend message, ghi activity; streak tăng khi cả hai đã chat trong ngày UTC.', tone: 'green', continues: true },
        ],
      },
      plain('Nếu đủ điều kiện, phát milestone; job có thể cảnh báo streak sắp mất', 'teal'),
    ],
  },
  {
    title: 'Short Video',
    subtitle: 'Upload, review, publish, tương tác và ranking',
    source: 'docs/services/short-video-service.md',
    stages: [
      plain('Tạo upload intent → server cấp presigned URL'),
      plain('Client upload trực tiếp lên storage → finalize để bắt đầu processing/transcode'),
      branch('Review mode?', 'Pre-review: chờ duyệt rồi publish nếu được approve.', 'Post-review: publish sau processing; report có thể auto-hide.', 'PRE', 'POST'),
      plain('Người xem tạo qualified view, like/comment; job tính ranking có fallback recent'),
      plain('Admin có thể approve / reject / remove trong moderation flow video', 'teal'),
    ],
  },
  {
    title: 'Notification',
    subtitle: 'Lưu thông báo in-app trước, push là side effect tùy provider',
    source: 'docs/services/notification-service.md',
    stages: [
      plain('Module nghiệp vụ phát trigger sau hoặc trong transaction phù hợp'),
      plain('NotificationService lưu notification in-app'),
      plain('Sau commit, thử gửi push nếu adapter/provider được cấu hình'),
      plain('Client lấy danh sách/unread count và đánh dấu notification đã đọc'),
    ],
  },
  {
    title: 'Support và Admin Operations',
    subtitle: 'Support ticket có tracking; quyền admin được enforce ở backend',
    source: 'apps/core-api/src/modules/support/support.controller.ts · docs/01-product-features.md',
    stages: [
      plain('User gửi support ticket với Idempotency-Key'),
      plain('Core API lưu ticket Open; retry cùng key trả lại ticket cũ'),
      plain('User xem ticket của mình; staff lọc danh sách theo trạng thái'),
      plain('Staff cập nhật status và phản hồi theo state transition hợp lệ'),
      plain('Admin chọn thao tác user / moderation / economy / catalog / config / permissions'),
      branch('Backend cho phép thao tác?', 'Thực hiện qua endpoint được bảo vệ theo quyền.', 'Từ chối request không đủ quyền.', 'ĐƯỢC PHÉP', 'BỊ CHẶN'),
    ],
  },
];

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

function wrap(value, maxChars) {
  const result = [];
  for (const paragraph of String(value).split('\n')) {
    const words = paragraph.split(/\s+/).filter(Boolean);
    let line = '';
    for (const word of words) {
      const next = line ? `${line} ${word}` : word;
      if (next.length > maxChars && line) {
        result.push(line);
        line = word;
      } else {
        line = next;
      }
    }
    result.push(line);
  }
  return result;
}

function textLines(x, y, lines, options = {}) {
  const { size = 22, fill = colors.ink, weight = 500, anchor = 'start', lineHeight = 29 } = options;
  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  return `<text x="${x}" y="${startY}" text-anchor="${anchor}" fill="${fill}" font-family="trebuchet ms, verdana, arial, sans-serif" font-size="${size}" font-weight="${weight}">${lines
    .map((line, index) => `<tspan x="${x}" dy="${index === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`)
    .join('')}</text>`;
}

function capsule(parts, x, y, label, options = {}) {
  const { width: pillWidth = Math.max(112, label.length * 14 + 42), height: pillHeight = 44, dashed = false, size = 19 } = options;
  parts.push(`<rect x="${x}" y="${y}" width="${pillWidth}" height="${pillHeight}" rx="${pillHeight / 2}" fill="${colors.background}" stroke="${colors.accent}" stroke-width="2"${dashed ? ' stroke-dasharray="5 5"' : ''}/>`);
  parts.push(textLines(x + pillWidth / 2, y + pillHeight / 2, [label], { size, weight: 600, anchor: 'middle', fill: colors.text, lineHeight: size + 4 }));
  return { width: pillWidth, height: pillHeight };
}

function node(parts, x, y, nodeWidth, nodeHeight, label, options = {}) {
  const { maxChars = 42, size = 20, radius = 26, weight = 600 } = options;
  parts.push(`<rect x="${x}" y="${y}" width="${nodeWidth}" height="${nodeHeight}" rx="${radius}" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
  parts.push(textLines(x + nodeWidth / 2, y + nodeHeight / 2, wrap(label, maxChars), { size, weight, anchor: 'middle', fill: colors.text, lineHeight: size + 5 }));
}

function connector(parts, path, arrow = true) {
  parts.push(`<path d="${path}" fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"${arrow ? ' marker-end="url(#arrow)"' : ''}/>`);
}

function matchingSvg() {
  const svgWidth = 1208;
  const height = 3030;
  const centerX = svgWidth / 2;
  const mainX = 344;
  const mainWidth = 520;
  const leftX = 26;
  const rightX = 662;
  const branchWidth = 520;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${height}" viewBox="0 0 ${svgWidth} ${height}">`,
    `<rect width="${svgWidth}" height="${height}" fill="${colors.background}"/>`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666666"/></marker></defs>',
  ];
  const vertical = (x, fromY, toY) => connector(parts, `M ${x} ${fromY} V ${toY}`);

  vertical(centerX, 140, 196);
  vertical(centerX, 326, 406);
  vertical(centerX, 566, 632, false);
  vertical(centerX, 680, 785);
  vertical(centerX, 910, 970);
  vertical(centerX, 1110, 1174);
  vertical(centerX, 1300, 1357);
  vertical(centerX, 1482, 1547);
  connector(parts, `M ${centerX} 1707 V 1770 H 286 V 1800`);
  connector(parts, `M ${centerX} 1707 V 1770 H 922 V 1800`);
  vertical(922, 1846, 1920);
  vertical(922, 2065, 2150);
  vertical(922, 2290, 2360);
  connector(parts, 'M 922 2490 V 2535 H 604 V 2580');
  connector(parts, 'M 604 2672 V 2712 H 370 V 2740');
  connector(parts, 'M 604 2672 V 2712 H 838 V 2740');
  vertical(370, 2786, 2860);
  vertical(838, 2786, 2860);

  node(parts, mainX, 20, mainWidth, 120, 'User chọn Soul hoặc Voice', { maxChars: 32 });
  node(parts, mainX, 196, mainWidth, 130, 'POST /matching/tickets', { maxChars: 34 });
  node(parts, mainX, 406, mainWidth, 160, 'Core API kiểm tra quyền, quota, ticket đang hoạt động, idempotency', { maxChars: 38 });
  capsule(parts, centerX - 61, 636, 'hợp lệ', { width: 122, height: 44, size: 18 });
  node(parts, mainX, 785, mainWidth, 125, 'Lưu MatchTicket queued trong PostgreSQL', { maxChars: 38 });
  node(parts, mainX, 970, mainWidth, 140, 'Đưa ticket vào Redis Sorted Set shard theo loại match, region, age band', { maxChars: 40 });
  node(parts, mainX, 1174, mainWidth, 126, 'MatcherWorker trong core-api quét các shard đang hoạt động', { maxChars: 40 });
  node(parts, mainX, 1357, mainWidth, 125, 'ZPOPMIN lấy 2 ticket ưu tiên cao nhất trong shard', { maxChars: 39 });
  node(parts, mainX - 6, 1547, mainWidth + 12, 160, 'Transaction PostgreSQL: lock và kiểm tra lại trạng thái, preference, block/report', { maxChars: 42 });

  capsule(parts, 218, 1800, 'không hợp lệ', { width: 136, height: 46, size: 17 });
  capsule(parts, 858, 1800, 'hợp lệ', { width: 128, height: 46, size: 17 });
  node(parts, leftX, 1920, branchWidth, 145, 'Ticket lỗi bị expire; ticket còn hợp lệ được requeue', { maxChars: 40 });
  node(parts, rightX, 1920, branchWidth, 145, 'Tạo MatchSession confirmed và chuyển cả 2 ticket sang confirmed', { maxChars: 40 });
  node(parts, rightX, 2150, branchWidth, 140, 'Phát match.confirmed qua Redis Pub/Sub', { maxChars: 40 });
  node(parts, rightX, 2360, branchWidth, 130, 'Signaling Gateway báo client; client refetch trạng thái', { maxChars: 40 });
  capsule(parts, 480, 2580, 'Loại match', { width: 248, height: 92, dashed: true, size: 20 });
  capsule(parts, 310, 2740, 'Soul', { width: 120, height: 46, size: 18 });
  capsule(parts, 778, 2740, 'Voice', { width: 120, height: 46, size: 18 });
  node(parts, 68, 2860, 430, 150, 'Soul Match: chat text ẩn danh', { maxChars: 32 });
  node(parts, 710, 2860, 430, 150, 'Calling tạo/lấy CallSession; hai client nhận token LiveKit', { maxChars: 34 });
  parts.push('</svg>');
  return { svg: parts.join(''), height, width: svgWidth };
}

function flowSvg(item) {
  const centerX = width / 2;
  const mainWidth = 560;
  const mainX = (width - mainWidth) / 2;
  const branchWidth = 520;
  const branchXs = [28, width - branchWidth - 28];
  const gap = 72;
  const geometry = item.stages.map((stage) => {
    if (stage.type !== 'branch') {
      const lines = wrap(stage.label, 43);
      return { height: Math.max(112, lines.length * 27 + 48), lines };
    }
    const questionLines = wrap(stage.question, 28);
    const optionLines = stage.options.map((option) => wrap(option.text, 39));
    const cardHeight = Math.max(126, Math.max(...optionLines.map((lines) => lines.length)) * 26 + 52);
    return { height: 158 + cardHeight, questionLines, optionLines, cardHeight, questionHeight: 74, tagY: 96, cardY: 158 };
  });
  const yPositions = [];
  let y = 30;
  for (const itemGeometry of geometry) {
    yPositions.push(y);
    y += itemGeometry.height + gap;
  }
  const height = y - gap + 72;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">`,
    `<rect width="${width}" height="${height}" fill="${colors.background}"/>`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666666"/></marker></defs>',
  ];

  for (let i = 1; i < item.stages.length; i += 1) {
    const previous = item.stages[i - 1];
    const previousY = yPositions[i - 1];
    const currentY = yPositions[i];
    const previousGeometry = geometry[i - 1];
    if (previous.type !== 'branch') {
      connector(parts, `M ${centerX} ${previousY + previousGeometry.height} V ${currentY - 8}`);
      continue;
    }
    const continuing = previous.options.map((option, index) => ({ option, index })).filter(({ option }) => option.continues);
    const optionBottom = previousY + previousGeometry.cardY + previousGeometry.cardHeight;
    const joinY = currentY - 32;
    for (const { index } of continuing) {
      const x = branchXs[index] + branchWidth / 2;
      connector(parts, `M ${x} ${optionBottom} V ${joinY} H ${centerX} V ${currentY - 8}`);
    }
  }

  item.stages.forEach((stage, index) => {
    const stageY = yPositions[index];
    const itemGeometry = geometry[index];
    if (stage.type !== 'branch') {
      node(parts, mainX, stageY, mainWidth, itemGeometry.height, stage.label, { maxChars: 43, size: 20 });
      return;
    }

    const questionWidth = Math.max(260, ...itemGeometry.questionLines.map((line) => line.length * 12 + 46));
    const questionX = centerX - questionWidth / 2;
    parts.push(`<rect x="${questionX}" y="${stageY}" width="${questionWidth}" height="${itemGeometry.questionHeight}" rx="22" fill="${colors.background}" stroke="${colors.accent}" stroke-width="2" stroke-dasharray="5 5"/>`);
    parts.push(textLines(centerX, stageY + itemGeometry.questionHeight / 2, itemGeometry.questionLines, { size: 19, weight: 600, anchor: 'middle', fill: colors.text, lineHeight: 24 }));

    const splitY = stageY + 84;
    stage.options.forEach((option, optionIndex) => {
      const x = branchXs[optionIndex];
      const optionCenter = x + branchWidth / 2;
      const tagWidth = Math.max(110, option.tag.length * 13 + 40);
      const tagX = optionCenter - tagWidth / 2;
      const tagY = stageY + itemGeometry.tagY;
      connector(parts, `M ${centerX} ${stageY + itemGeometry.questionHeight} V ${splitY} H ${optionCenter} V ${tagY - 4}`);
      const cardY = stageY + itemGeometry.cardY;
      connector(parts, `M ${optionCenter} ${tagY + 42} V ${cardY - 8}`);
      capsule(parts, tagX, tagY, option.tag, { width: tagWidth, height: 42, size: 16 });
      node(parts, x, cardY, branchWidth, itemGeometry.cardHeight, option.text, { maxChars: 39, size: 18 });
    });
  });

  parts.push('</svg>');
  return { svg: parts.join(''), height, width };
}

function partyRoomFlowSvg() {
  const svgWidth = 1208;
  const height = 3260;
  const centerX = svgWidth / 2;
  const mainX = 324;
  const mainWidth = 560;
  const branchWidth = 520;
  const leftX = 28;
  const rightX = svgWidth - branchWidth - 28;
  const outcomeWidth = 360;
  const outcomeXs = [20, 424, 828];
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${svgWidth}" height="${height}" viewBox="0 0 ${svgWidth} ${height}">`,
    `<rect width="${svgWidth}" height="${height}" fill="${colors.background}"/>`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666666"/></marker></defs>',
  ];
  const vertical = (fromY, toY) => connector(parts, `M ${centerX} ${fromY} V ${toY}`);
  const box = (y, h, label, x = mainX, w = mainWidth, options = {}) =>
    node(parts, x, y, w, h, label, { maxChars: options.maxChars ?? 42, size: options.size ?? 20 });
  const branchCard = (x, y, h, label) => node(parts, x, y, branchWidth, h, label, { maxChars: 38, size: 18 });

  vertical(148, 205);
  vertical(345, 402);
  vertical(562, 630);
  connector(parts, `M ${centerX} 704 V 748 H ${leftX + branchWidth / 2} V 780`);
  connector(parts, `M ${centerX} 704 V 748 H ${rightX + branchWidth / 2} V 780`);
  connector(parts, `M ${leftX + branchWidth / 2} 990 V 1038 H ${centerX} V 1065`);
  connector(parts, `M ${rightX + branchWidth / 2} 990 V 1038 H ${centerX} V 1065`);
  vertical(1230, 1305);
  vertical(1460, 1535);
  connector(parts, `M ${centerX} 1640 V 1690 H ${leftX + branchWidth / 2} V 1720`);
  connector(parts, `M ${centerX} 1640 V 1690 H ${rightX + branchWidth / 2} V 1720`);
  connector(parts, `M ${leftX + branchWidth / 2} 1970 V 2020 H ${centerX} V 2050`);
  connector(parts, `M ${rightX + branchWidth / 2} 1970 V 2020 H ${centerX} V 2050`);
  vertical(2210, 2288);
  connector(parts, `M ${centerX} 2362 V 2404 H ${outcomeXs[0] + outcomeWidth / 2} V 2440`);
  connector(parts, `M ${centerX} 2362 V 2440`);
  connector(parts, `M ${centerX} 2362 V 2404 H ${outcomeXs[2] + outcomeWidth / 2} V 2440`);

  box(30, 118, 'User mở Party Room');
  box(205, 140, 'GET /party/rooms\nXem phòng active');
  box(402, 160, 'Core API xác thực request\nquyền + input + trạng thái user', mainX - 40, mainWidth + 80, { maxChars: 40 });
  capsule(parts, centerX - 148, 630, 'Tạo mới hay tham gia?', { width: 296, height: 74, size: 19 });
  branchCard(leftX, 780, 210, 'TẠO PHÒNG\nPOST /party/rooms\nroom active + membership host\nTạo LiveKit room');
  branchCard(rightX, 780, 210, 'THAM GIA / VÀO LẠI\nPOST /party/rooms/:id/join\nKhóa room + member cap\nNhận token theo role');
  box(1065, 165, 'Core API cấp token LiveKit\nidentity = userId · room = party-{roomId}\nHost / speaker publish · audience chỉ nghe', mainX - 40, mainWidth + 80, { maxChars: 42, size: 19 });
  box(1305, 155, 'Client kết nối audio trực tiếp tới LiveKit\nRoom đang active');
  box(1535, 105, 'Trong phòng\nAudio theo role · chat text · gửi quà');
  capsule(parts, centerX - 122, 1640, 'Tương tác nào?', { width: 244, height: 74, size: 19 });
  branchCard(leftX, 1720, 250, 'LÊN SPEAKER\nHost gửi speaker-invite\nTarget accept mới đổi role\nHết speaker_limit → từ chối\nDecline → giữ audience');
  branchCard(rightX, 1720, 250, 'CHAT TEXT\nPOST /party/rooms/:id/comments\nMember active + Idempotency-Key\nLưu append-only vào PostgreSQL\nparty.comment.created');
  box(2050, 160, 'Sau commit\nRedis Pub/Sub → signaling-gateway\nClient nhận delta và refetch REST', mainX - 30, mainWidth + 60, { maxChars: 42, size: 19 });
  capsule(parts, centerX - 157, 2210, 'Rời hay mất kết nối?', { width: 314, height: 74, size: 19 });
  node(parts, outcomeXs[0], 2440, outcomeWidth, 220, 'MEMBER LEAVE\nPOST /party/rooms/:id/leave\nleft_at + removeParticipant\nPhòng vẫn active', { maxChars: 31, size: 17 });
  node(parts, outcomeXs[1], 2440, outcomeWidth, 220, 'HOST LEAVE\nĐóng phòng ngay\nreason = host_left\nKhông chuyển host', { maxChars: 31, size: 17 });
  node(parts, outcomeXs[2], 2440, outcomeWidth, 220, 'RỚT KẾT NỐI\nWebhook verify chữ ký\nGrace 15s: reconnect giữ role\nHết grace: close hoặc left', { maxChars: 31, size: 17 });

  parts.push(`<line x1="28" y1="2730" x2="1180" y2="2730" stroke="${colors.line}" stroke-width="2"/>`);
  parts.push(textLines(28, 2780, ['Thông tin quan trọng'], { size: 25, weight: 700, fill: colors.text }));

  function note(x, y, title, body, maxChars = 58) {
    parts.push(textLines(x, y, [title], { size: 19, weight: 700, fill: colors.text }));
    parts.push(textLines(x, y + 32, wrap(body, maxChars), { size: 17, weight: 500, fill: '#b8bec5', lineHeight: 23 }));
  }

  note(28, 2840, '01 · Quyền mic', 'Audience luôn canPublish=false. Chỉ target accept mới đổi role; LiveKit chặn audience tự publish. Host không chiếm speaker_limit.');
  note(620, 2840, '02 · Retry và realtime', 'Join, leave, role và close khóa cùng row phòng. Pub/Sub chỉ là delta sau commit; reconnect refetch room + comments qua REST.');
  note(28, 2985, '03 · Mất kết nối', 'Host và member có grace mặc định 15s. Host reconnect giữ phòng; sweeper re-check dưới lock trước khi close.');
  note(620, 2985, '04 · Gift trong phòng', 'Gift kiểm tra sender và receiver cùng active room. Economy ghi double-entry LedgerEntry append-only trong transaction.');
  parts.push(textLines(28, 3180, ['Nguồn: docs/services/party-room-service.md · docs/services/gift-service.md · Bản duyệt Party Room'], { size: 16, weight: 500, fill: '#8e969e' }));
  parts.push('</svg>');
  return { svg: parts.join(''), height, width: svgWidth, source: 'docs/services/party-room-service.md · docs/services/gift-service.md' };
}

function partyRoomArchitectureSvg() {
  const architectureWidth = 3362;
  const height = 1010;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${architectureWidth}" height="${height}" viewBox="0 0 ${architectureWidth} ${height}">`,
    `<rect width="${architectureWidth}" height="${height}" fill="${colors.background}"/>`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666666"/></marker></defs>',
  ];
  const path = (d) => parts.push(`<path d="${d}" fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/>`);
  const label = (x, y, w, text) => capsule(parts, x, y, text, { width: w, height: 42, size: 20 });
  const box = (x, y, w, h, lines) => {
    parts.push(`<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="30" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(textLines(x + w / 2, y + h / 2, lines, { size: 22, weight: 600, anchor: 'middle', fill: colors.text, lineHeight: 27 }));
  };
  const cylinder = (x, y, w, h, lines) => {
    const cx = x + w / 2;
    const ry = 22;
    parts.push(`<path d="M ${x} ${y + ry} C ${x} ${y - 8}, ${x + w} ${y - 8}, ${x + w} ${y + ry} V ${y + h - ry} C ${x + w} ${y + h + 8}, ${x} ${y + h + 8}, ${x} ${y + h - ry} Z" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(`<ellipse cx="${cx}" cy="${y + ry}" rx="${w / 2}" ry="${ry}" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(`<path d="M ${x} ${y + h - ry} C ${x} ${y + h + 8}, ${x + w} ${y + h + 8}, ${x + w} ${y + h - ry}" fill="none" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(textLines(cx, y + h / 2 + 9, lines, { size: 20, weight: 600, anchor: 'middle', fill: colors.text, lineHeight: 24 }));
  };

  path('M 416 190 H 920');
  path('M 1560 105 H 2110');
  path('M 1560 165 C 1810 165 1940 302 2185 302');
  path('M 1560 220 C 1830 220 2020 348 2185 348');
  path('M 2303 325 H 2820');
  path('M 1560 258 C 1810 258 1960 530 2090 530');
  path('M 300 252 V 608 H 2220 V 585');
  path('M 380 108 V 54 H 3060 V 270');
  label(500, 167, 370, 'REST: create / join / role / comment');
  label(1680, 83, 300, 'durable room state');
  label(1690, 220, 390, 'realtime delta after commit');
  label(1875, 289, 390, 'publish after commit');
  label(2450, 301, 350, 'realtime Pub/Sub');
  label(1700, 395, 430, 'create room / token / grant');
  label(1120, 590, 370, 'direct audio WebRTC');
  label(1910, 30, 360, 'socket events');
  box(10, 128, 406, 124, ['Client: Web / App', 'Host · Speaker · Audience']);
  box(930, 38, 630, 240, ['core-api', 'PartyRoomModule', 'Room · Member · Role · Comment', 'Sweeper · permissions · Safety']);
  cylinder(2115, 82, 230, 145, ['PostgreSQL', 'party_rooms', 'party_room_members']);
  cylinder(2185, 255, 118, 135, ['Redis', 'Pub/Sub']);
  box(2820, 248, 510, 150, ['signaling-gateway', 'auth socket · fanout']);
  box(2090, 458, 380, 145, ['media-server', 'LiveKit SFU', 'party-{roomId}']);

  parts.push(`<line x1="28" y1="690" x2="3334" y2="690" stroke="${colors.line}" stroke-width="2"/>`);
  parts.push(textLines(28, 744, ['Điểm quan trọng'], { size: 26, weight: 700, fill: colors.text }));
  parts.push(textLines(28, 790, wrap('PostgreSQL là nguồn sự thật cho room, member, role và comment. core-api khóa row phòng khi join, leave, đổi role và close.', 130), { size: 19, weight: 500, fill: '#b8bec5', lineHeight: 26 }));
  parts.push(textLines(28, 842, wrap('Audience nhận token canPublish=false; speaker invite chỉ pending cho tới khi target accept. signaling-gateway chỉ fanout delta; client refetch REST để phục hồi.', 130), { size: 19, weight: 500, fill: '#b8bec5', lineHeight: 26 }));
  parts.push(textLines(28, 894, wrap('Host leave đóng phòng ngay. Host disconnect có grace 15s; sweeper và LiveKit emptyTimeout là backstop. Client truyền audio trực tiếp tới LiveKit.', 130), { size: 19, weight: 500, fill: '#b8bec5', lineHeight: 26 }));
  parts.push(textLines(28, 965, ['Nguồn: docs/03-architecture.md · docs/services/party-room-service.md'], { size: 16, weight: 500, fill: '#8e969e' }));
  parts.push('</svg>');
  return { svg: parts.join(''), height, width: architectureWidth, source: 'docs/03-architecture.md · docs/services/party-room-service.md' };
}

function architectureSvg() {
  const architectureWidth = 3362;
  const height = 636;
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${architectureWidth}" height="${height}" viewBox="0 0 ${architectureWidth} ${height}">`,
    `<rect width="${architectureWidth}" height="${height}" fill="${colors.background}"/>`,
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M 0 0 L 10 5 L 0 10 z" fill="#666666"/></marker></defs>',
  ];

  function path(d) {
    parts.push(`<path d="${d}" fill="none" stroke="${colors.line}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" marker-end="url(#arrow)"/>`);
  }

  function label(x, y, w, text) {
    capsule(parts, x, y, text, { width: w, height: 42, size: 20 });
  }

  function box(x, y, boxWidth, boxHeight, lines) {
    parts.push(`<rect x="${x}" y="${y}" width="${boxWidth}" height="${boxHeight}" rx="30" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(textLines(x + boxWidth / 2, y + boxHeight / 2, lines, { size: 22, weight: 600, anchor: 'middle', fill: colors.text, lineHeight: 27 }));
  }

  function cylinder(x, y, boxWidth, boxHeight, title) {
    const cx = x + boxWidth / 2;
    const ry = 22;
    parts.push(`<path d="M ${x} ${y + ry} C ${x} ${y - 8}, ${x + boxWidth} ${y - 8}, ${x + boxWidth} ${y + ry} V ${y + boxHeight - ry} C ${x + boxWidth} ${y + boxHeight + 8}, ${x} ${y + boxHeight + 8}, ${x} ${y + boxHeight - ry} Z" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(`<ellipse cx="${cx}" cy="${y + ry}" rx="${boxWidth / 2}" ry="${ry}" fill="${colors.node}" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(`<path d="M ${x} ${y + boxHeight - ry} C ${x} ${y + boxHeight + 8}, ${x + boxWidth} ${y + boxHeight + 8}, ${x + boxWidth} ${y + boxHeight - ry}" fill="none" stroke="${colors.nodeBorder}" stroke-width="2"/>`);
    parts.push(textLines(cx, y + boxHeight / 2 + 9, [title], { size: 21, weight: 600, anchor: 'middle', fill: colors.text }));
  }

  path('M 416 168 H 930');
  path('M 1480 83 H 2140');
  path('M 1480 130 C 1710 130 1940 263 2208 263');
  path('M 1480 184 C 1710 184 1940 310 2208 310');
  path('M 2326 286 H 2850');
  path('M 1480 215 C 1710 215 1900 492 2140 492');
  path('M 300 232 V 610 H 2310 V 565');
  path('M 380 108 V 30 H 3090 V 235');

  label(510, 145, 336, 'REST: yêu cầu nghiệp vụ');
  label(1710, 62, 270, 'state bền vững');
  label(1710, 203, 450, 'queue, index, presence');
  label(1815, 269, 390, 'publish event sau khi xử lý');
  label(2455, 265, 330, 'realtime Pub/Sub');
  label(1690, 353, 350, 'tạo room / cấp token');
  label(1050, 589, 410, 'Âm thanh cuộc gọi trực tiếp');
  label(1945, 9, 370, 'Socket: sự kiện realtime');

  box(10, 108, 406, 124, ['Client: Web / Admin']);
  box(940, 40, 540, 192, ['core-api', 'Auth · Matching · Soul · Calling', 'Friend · Economy · Safety · Social']);
  cylinder(2145, 72, 210, 135, 'PostgreSQL');
  cylinder(2208, 225, 118, 122, 'Redis');
  box(2850, 235, 484, 135, ['signaling-gateway', 'xác thực socket và fanout']);
  box(2140, 420, 335, 145, ['media-server', 'LiveKit']);
  parts.push('</svg>');
  return { svg: parts.join(''), height, width: architectureWidth, source: 'docs/03-architecture.md · docs/services/README.md' };
}

const browserCandidates = [
  process.env.LITMATCH_BROWSER,
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
].filter(Boolean);

function findBrowser() {
  for (const candidate of browserCandidates) {
    try {
      const result = spawnSync(candidate, ['--version'], { encoding: 'utf8', windowsHide: true });
      if (result.status === 0) return candidate;
    } catch {
      // Continue to the next installed browser.
    }
  }
  throw new Error('Set LITMATCH_BROWSER to an installed Chromium/Edge executable to render PNGs.');
}

function renderPng(browser, svgPath, pngPath, height, outputWidth = width) {
  const profileDir = mkdtempSync(path.join(tmpdir(), 'litmatch-diagram-edge-'));
  const deviceScale = Number(process.env.LITMATCH_DEVICE_SCALE ?? '1');
  if (!Number.isFinite(deviceScale) || deviceScale < 1 || deviceScale > 4) {
    throw new Error('LITMATCH_DEVICE_SCALE must be a number between 1 and 4.');
  }
  const args = [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    `--user-data-dir=${profileDir}`,
    `--force-device-scale-factor=${deviceScale}`,
    `--window-size=${outputWidth},${height}`,
    `--screenshot=${pngPath}`,
    pathToFileURL(svgPath).href,
  ];
  try {
    const result = spawnSync(browser, args, { encoding: 'utf8', windowsHide: true, timeout: 180000 });
    if (result.error) throw result.error;
    if (result.status !== 0) throw new Error(`Browser render failed for ${path.basename(svgPath)}: ${result.stderr}`);
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
  }
}

mkdirSync(outDir, { recursive: true });
const browser = findBrowser();
const featureItems = features.map((feature, index) => ({
  ...feature,
  file: `${String(index + 2).padStart(2, '0')}-${feature.title
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}`,
  ...(feature.title === 'Party Room' ? partyRoomFlowSvg() : flowSvg(feature)),
}));

const all = [
  { file: '00-project-architecture', title: 'Sơ đồ kiến trúc dự án', ...architectureSvg() },
  { ...matching, ...matchingSvg() },
  ...featureItems,
  { file: '04-party-room-architecture', title: 'Party Room — Sơ đồ kiến trúc', ...partyRoomArchitectureSvg() },
];

const only = process.argv.find((arg) => arg.startsWith('--only='))?.slice('--only='.length);
const from = process.argv.find((arg) => arg.startsWith('--from='))?.slice('--from='.length);
const skip = new Set((process.argv.find((arg) => arg.startsWith('--skip='))?.slice('--skip='.length) ?? '').split(',').filter(Boolean));
const fromIndex = from ? all.findIndex((item) => item.file === from) : 0;
const selectedBeforeSkip = only
  ? all.filter((item) => item.file === only)
  : all.slice(from ? Math.max(0, fromIndex) : 0, writeAll ? undefined : 3);
const selected = selectedBeforeSkip.filter((item) => !skip.has(item.file));
if (only && selected.length === 0) throw new Error(`Unknown diagram: ${only}`);
if (from && fromIndex < 0) throw new Error(`Unknown starting diagram: ${from}`);
if (from && !writeAll) throw new Error('Use --all with --from so a full export is always explicit.');

const svgDir = mkdtempSync(path.join(tmpdir(), 'litmatch-diagram-svg-'));
try {
  for (const item of selected) {
    const pngPath = path.join(outDir, `${item.file}.png`);
    const svgPath = path.join(svgDir, `${item.file}.svg`);
    writeFileSync(svgPath, item.svg, 'utf8');
    writeFileSync(path.join(outDir, `${item.file}.svg`), item.svg, 'utf8');
    renderPng(browser, svgPath, pngPath, item.height, item.width ?? width);
    process.stdout.write(`${item.file}.png\n`);
  }
} finally {
  rmSync(svgDir, { recursive: true, force: true });
}

process.stdout.write(
  `Rendered ${selected.length} PNG diagrams${only ? ` (${only})` : ''}${writeAll ? ' (full export)' : ' (review set)'} with ${path.basename(browser)}.\n`,
);
