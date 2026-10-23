// Soul Match: CHỈ endpoint khó, có cơ chế kỹ thuật thật (khóa dòng session, idempotency, realtime ẩn danh). Endpoint đơn giản không viết.
// Một file, luồng đi liền mạch từ trên xuống theo thứ tự chạy; mỗi đoạn có nhãn tầng (tô màu ở bản HTML).
// Hàm được chép NGUYÊN VẸN (không cắt giữa hàm). Comment chỉ trả lời "vì sao" ở chỗ logic khó, đặt ngay cạnh dòng code;
// comment ở chỗ luồng chuyển sang tầng khác (Postgres, Redis...) mở đầu bằng nhãn tầng đó.
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const S = 'apps/core-api/src/modules/soul-match';
const SC = `${S}/soul-match.controller.ts`;
const SS = `${S}/soul-match.service.ts`;
const FS = 'apps/core-api/src/modules/friend/friend.service.ts';
const MIG = 'apps/core-api/src/database/migrations/1752400000000-soul-match.ts';
const END_FN = '^  }$';
const END_SQL = '^    `\\);$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
// Câu lệnh SQL trong migration: lấy cả dòng `await queryRunner.query(` ở ngay trên và dòng đóng "`);"
const sql = (anchor) => ({ at: anchor, to: END_SQL, pad: [1, 0] });

export const annotatedFeatures = [
  {
    id: '02-soul-match',
    short: 'Soul Match',
    title: 'Soul Match: đánh giá trong một kết nối',
    summary: 'Cả 2 cùng thích thì thành bạn và giữ lại lịch sử chat. Ở quy mô lớn điều quan trọng là toàn bộ bước đánh giá chạy trên MỘT kết nối pool: các hàm phụ (areFriends, canPair) dùng chung transaction thay vì mở thêm kết nối thứ hai trong lúc đang giữ khoá.',
    arch: 'hot-paths',
    diagramAnchor: '02-soul-match',
    endpoints: [

      // ───────────────────────── 02 · Đánh giá và thành bạn ─────────────────────────
      {
        n: '01',
        slug: 'post-rating',
        method: 'POST',
        short: '/soul-match/sessions/:id/rating',
        route: '/api/v1/soul-match/sessions/:id/rating',
        name: 'Đánh giá đối phương và thành bạn',
        title: 'Ghi rating bất biến; khi cả 2 cùng like thì tạo Friendship, Conversation và chuyển lịch sử chat trong một transaction.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [SERVICE] → [POSTGRES] → [REDIS]',
        roles: [
          ['CONTROLLER', 'Nhận verdict (rude, boring, like) của user dành cho đối phương; chỉ lấy id phòng từ URL, user lấy từ JWT.'],
          ['SERVICE', 'Kiểm tra phòng còn trong cửa sổ đánh giá, khóa session, ghi rating bất biến, và khi cả 2 cùng like thì nhờ Friend tạo quan hệ bạn kèm chuyển lịch sử chat.'],
          ['POSTGRES', 'Khóa dòng match_sessions để 2 lượt like tuần tự; unique (session_id, rater_user_id) chống ghi trùng; Friendship, Conversation và tin nhắn import cùng một transaction.'],
          ['REDIS', 'Pub/sub báo soul.matched cho cả 2 người, sau commit, khi quan hệ bạn vừa được tạo.'],
        ],
        tables: [
          ['match_sessions', 'dòng bị khóa FOR UPDATE để tuần tự hóa 2 người đánh giá; chỉ khóa, không ghi (Matching là chủ sở hữu).'],
          ['soul_match_ratings', '1 dòng cho mỗi người trong mỗi session, không sửa được; unique (session_id, rater_user_id).'],
          ['soul_chat_messages', 'đọc toàn bộ lịch sử chat ẩn danh của session khi cả 2 cùng like.'],
          ['friendships', 'quan hệ bạn bè 2 chiều, 1 dòng theo cặp canonical (low < high), unique.'],
          ['conversations', 'phòng chat bền vững của cặp, tạo cùng Friendship.'],
          ['messages', 'lịch sử chat ẩn danh được chép sang; idempotency_key import ổn định nên chạy lại không nhân đôi.'],
        ],
        redis: [
          ['realtime:user:{userId}', 'kênh pub/sub theo người nhận; core-api phát soul.matched, signaling-gateway chuyển xuống socket.'],
        ],
        related: [
          ['Friend', 'ensureFriendship và areFriends; ensureFriendship được chép đầy đủ ở dưới vì là cơ chế chính của bước tạo bạn.'],
          ['Matching', 'findSessionById đọc session; Matching giữ quyền ghi trạng thái session.'],
          ['Soul Match (gửi tin nhắn)', 'khóa cùng dòng session: một tin nhắn không thể lọt vào giữa lúc chụp lịch sử chat (xem luồng gửi tin nhắn).'],
          ['signaling-gateway', 'subscribe kênh realtime của user, đẩy soul.matched xuống client.'],
        ],
        nested: true, // lồng nhau tự động theo quan hệ gọi hàm; `skip` (hàm cơ bản không bung) và `steps` (đánh số bước) khai ngay dưới
        // assertSameVerdict chỉ là so verdict cũ với verdict mới rồi ném 409: assert đơn giản, giữ dòng gọi
        skip: ['assertSameVerdict'],
        steps: [
          { at: "@Post('sessions/:id/rating')", text: 'Nhận request (user từ JWT, id phòng từ URL, verdict trong body)' },
          { at: 'const room = await this.getRoomForMember(user, sessionId);', text: 'Kiểm tra user thuộc phòng và còn trong cửa sổ đánh giá' },
          { at: 'await manager.findOne(MatchSession, {', text: 'Trong transaction, khóa dòng session FOR UPDATE' },
          { at: 'if (existing) {', text: 'Đã đánh giá rồi: cùng verdict thì trả kết quả cũ, khác thì 409' },
          { at: 'await manager.save(', text: 'Ghi rating (unique session + người đánh giá)' },
          { at: 'const anonymousMessages = await manager.find(SoulChatMessage, {', text: 'Cả 2 cùng like: chụp lịch sử chat ẩn danh theo seq' },
          { at: 'const { created } = await this.friendService.ensureFriendship(', text: 'Nhờ Friend tạo Friendship và Conversation, cùng transaction' },
          { at: 'if (messageSeeds.length > 0) {', in: 'FriendService.ensureFriendship', text: 'Chép lịch sử chat ẩn danh sang Conversation' },
          { at: 'if (!isUniqueViolation(err)) throw err;', text: 'Double-submit song song: đọc lại rồi replay hoặc 409' },
          { at: 'if (newlyMatched) {', text: 'Sau commit, báo soul.matched qua Redis cho cả 2 người' },
          { at: 'return RatingResultDto.from(', text: 'Controller trả verdict và cờ matched' },
        ],
        items: [
          // 1) Controller: không có gì khó
          { tag: 'CONTROLLER', file: SC, dedent: true, ranges: [fn("@Post('sessions/:id/rating')")] },

          // 2) Service: khóa session, ghi rating, tạo bạn
          {
            tag: 'SERVICE',
            file: SS,
            dedent: true,
            ranges: [fn('async rate('), fn('private assertSameVerdict(')],
            inline: [
              {
                at: 'await manager.findOne(MatchSession, {',
                text: ['[POSTGRES] Khóa dòng MatchSession FOR UPDATE TRƯỚC khi ghi rating: 2 lượt like chạy tuần tự. Không khóa thì mỗi bên đều thấy "bên kia chưa like" (READ COMMITTED) và không ai tạo Friendship. Chỉ khóa, không ghi.'],
                src: 'doc gốc soul-match.service.ts L285-290 + comment L310 + docs/services/soul-match-service.md mục 3',
              },
              {
                at: 'if (existing) {',
                text: ['Rating bất biến: gửi lại cùng verdict thì trả kết quả cũ, khác verdict thì 409. Cho đổi ý sẽ mở đường "like thử xem bên kia like chưa rồi đổi lại".'],
                src: 'soul-match-rating.entity.ts L16-21 + doc gốc soul-match.service.ts L501 (assertSameVerdict)',
              },
              {
                at: 'let matched = await this.friendService.areFriends(',
                text: ['Dùng CHUNG manager của transaction cho areFriends: trước đây hàm phụ này mở thêm một kết nối pool thứ hai trong lúc transaction đang giữ khoá session. Ở tải lớn, nhiều transaction cùng giữ một kết nối và chờ kết nối thứ hai làm cạn pool (cả HTTP lẫn job nền). Một kết nối cho cả luồng rating thì không còn chờ chéo.'],
                src: 'docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md C13 (soul rate() truyền manager cho areFriends/canPair, một kết nối pool)',
              },
              {
                at: 'const anonymousMessages = await manager.find(SoulChatMessage, {',
                text: ['Đủ 2 like thì chụp toàn bộ lịch sử chat ẩn danh theo seq để chép sang Friend Chat. Key import ổn định theo (session, message) nên chạy lại không nhân đôi; dòng gốc vẫn giữ cho T&S.'],
                src: 'docs/services/soul-match-service.md mục 1 và 3 + doc friendHistoryImportKey soul-match.constants.ts L18',
              },
              {
                at: 'const { created } = await this.friendService.ensureFriendship(',
                text: ['Friendship, Conversation và lịch sử chat nằm CÙNG transaction với rating: hoặc có đủ cả, hoặc không có gì.'],
                src: 'docs/services/soul-match-service.md mục 3 (check mutual + tạo Friendship trong cùng transaction với insert rating)',
              },
              {
                at: 'if (!isUniqueViolation(err)) throw err;',
                text: ['Double-submit song song của CÙNG user: bên thua unique (session, rater) thì đọc lại rồi replay hoặc 409.'],
                src: 'comment gốc soul-match.service.ts L376',
              },
              {
                at: 'if (newlyMatched) {',
                text: ['[REDIS] soul.matched phát SAU khi commit, best-effort, và chỉ khi Friendship MỚI được tạo; replay không bắn lại.'],
                src: 'comment gốc soul-match.service.ts L390 + docs/services/soul-match-service.md mục 7',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG,
            dedent: true,
            ranges: [sql('CREATE TABLE soul_match_ratings (')],
            inline: [
              {
                at: 'await queryRunner.query(`',
                text: ['Unique (session_id, rater_user_id) chính là idempotency tự nhiên của rating, không cần Idempotency-Key.'],
                src: 'soul-match-rating.entity.ts L16-21 + docs/services/soul-match-service.md mục 3',
              },
            ],
          },

          // 3) Friend: tạo Friendship + Conversation + chép lịch sử chat, idempotent
          {
            tag: 'SERVICE',
            file: FS,
            dedent: true,
            ranges: [fn('async ensureFriendship(')],
            inline: [
              {
                at: 'const result = await manager',
                text: ['[POSTGRES] ON CONFLICT DO NOTHING trên cặp canonical (low < high): 2 like song song hoặc match lại cặp cũ đều không tạo đôi và không lỗi.'],
                src: 'doc gốc friend.service.ts L97-103 + comment migration 1752400000000-soul-match.ts (uq_friendships_pair)',
              },
              {
                at: 'await manager',
                text: ['Conversation luôn được ensure cùng lúc, dù Friendship mới hay replay: bất biến "có Friendship thì có Conversation" không phụ thuộc nhánh nào.'],
                src: 'comment gốc friend.service.ts L124',
              },
              {
                at: 'if (messageSeeds.length > 0) {',
                text: ['Chép lịch sử chat ẩn danh: chèn ON CONFLICT DO NOTHING theo idempotency_key nên chạy lại không nhân đôi. Friend chỉ nhận seed trung lập, không import entity của luồng nguồn.'],
                src: 'doc friend.service.ts L40-44 (FriendMessageSeed) + docs/services/friend-service.md mục 1',
              },
              {
                at: 'const latestMessageAt = messageSeeds.reduce(',
                text: ['Không làm lùi mốc sắp xếp của conversation nếu đây là lần chép lại của một cặp đã chat trước đó.'],
                src: 'comment gốc friend.service.ts L159-160',
              },
            ],
          },
          { tag: 'POSTGRES', file: MIG, dedent: true, ranges: [sql('CREATE TABLE friendships (')] },
        ],
      },
    ],
  },
];
