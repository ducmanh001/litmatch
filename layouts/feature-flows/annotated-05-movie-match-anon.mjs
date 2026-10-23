// Movie Match ẩn danh (bản 10M CCU): hàng đợi ghép bằng bảng Postgres, KHÔNG còn khoá advisory toàn cục.
// Người MỚI hơn giành người CŨ hơn bằng FOR UPDATE SKIP LOCKED; join của cùng một user tuần tự bằng khoá advisory THEO USER;
// sau khi chèn entry, khoá hàng của chính mình rồi kiểm lại active (một user khác có thể đã ghép mình giữa chừng).
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const M = 'apps/core-api/src/modules/movie-match';
const MC = `${M}/movie-match.controller.ts`;
const MS = `${M}/movie-match.service.ts`;
const LOCK = 'apps/core-api/src/database/advisory-lock.ts';
const MIG_ANON = 'apps/core-api/src/database/migrations/1755900000000-movie-match-anon.ts';
const MIG_ORDER = 'apps/core-api/src/database/migrations/1758100000000-movie-match-queue-order-index.ts';
const END_FN = '^  }$';
const END_SQL = '^    `\\);$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const sql = (anchor) => ({ at: anchor, to: END_SQL, pad: [1, 0] });

export const annotatedFeatures = [
  {
    id: '05-movie-match-anon',
    short: 'Movie Match ẩn danh',
    title: 'Movie Match ẩn danh: hàng đợi không khoá toàn cục',
    summary:
      'Ghép ẩn danh hai người xem chung một video do server chọn. Ở quy mô lớn, hàng đợi này không được xếp hàng sau một khoá toàn cục: mỗi user chỉ khoá chính mình, người mới giành người cũ bằng SKIP LOCKED.',
    arch: 'hot-paths',
    diagramAnchor: '05-movie-match-movie-night',
    endpoints: [
      {
        n: '01',
        slug: 'post-join-anon-queue',
        method: 'POST',
        short: '/movie-match/anon/queue',
        route: '/api/v1/movie-match/anon/queue',
        name: 'Vào hàng đợi Movie Match ẩn danh',
        title:
          'Vào hàng đợi ghép ẩn danh; nếu có người chờ phù hợp thì ghép ngay thành một phiên xem chung với video do server chọn.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', 'Nhận request vào hàng đợi, giao cho service và trả trạng thái theo góc nhìn của người gọi (đang chờ hoặc đã ghép), không lộ đối tác.'],
          ['SERVICE', 'Trong 1 transaction: khoá advisory theo user, đóng phiên quá hạn của user, xếp user vào hàng đợi, khoá hàng của chính mình và kiểm lại active, rồi giành người chờ lâu nhất bằng SKIP LOCKED, kiểm block/report, tạo phiên và 2 participant.'],
          ['POSTGRES', 'Hàng đợi là bảng (PK user_id); khoá advisory theo user chỉ tuần tự hoá lượt join của cùng một user; FOR UPDATE SKIP LOCKED để giành entry mà không bao giờ chờ (không deadlock); PK bảng participant là chốt cuối cho "1 user 1 phiên".'],
        ],
        tables: [
          ['movie_match_queue_entries', 'hàng đợi: mỗi user đang chờ 1 dòng (PK user_id, queued_at), sắp theo (queued_at, user_id) nhờ idx_movie_match_queue_order; bị xoá khi quá hạn chờ hoặc khi được ghép.'],
          ['movie_session_active_participants', 'mỗi user 1 dòng trỏ tới phiên còn active (PK user_id); ghi 2 dòng khi ghép.'],
          ['movie_sessions', 'phiên xem chung: cặp (low, high), video_url do server chọn, mode anonymous, expires_at.'],
        ],
        related: [
          ['Safety', 'canPair: hai người đã block hoặc report nhau gần đây thì không ghép (không chép).'],
          ['Palm Match', 'dùng cùng kỹ thuật hàng đợi + khoá advisory theo user + kiểm lại active sau khi khoá hàng của mình; xem trang Palm Match.'],
          ['getAnonCurrent', 'poll tự chữa: hai người join cùng lúc có thể bỏ lỡ nhau do SKIP LOCKED, mỗi lượt poll thử ghép lại bằng tryMatchAnon (không chép).'],
        ],
        nested: true,
        // Không bung: hết hạn kiểu lười (đọc rồi đổi status), trạng thái active (đọc participant + session).
        skip: ['expireAnonForUser', 'anonActiveState'],
        steps: [
          { at: "@Post('anon/queue')", text: 'Nhận request (user lấy từ JWT); server tự chọn video, client không gửi URL' },
          { at: 'await lockAdvisoryXact(manager,', text: 'Khoá advisory THEO USER (không toàn cục): chỉ tuần tự hoá các lượt join của chính user này' },
          { at: 'await this.expireAnonForUser(manager, userId);', text: 'Đóng phiên đã quá hạn của chính user (hết hạn kiểu lười)' },
          { at: 'const activeState = await this.anonActiveState(manager, userId);', text: 'Còn phiên chưa kết thúc thì trả lại state đó, không xếp hàng' },
          { at: 'await this.purgeStaleAnonEntries(manager);', text: 'Dọn tối đa 50 entry chờ quá hạn (SKIP LOCKED, không chờ ai)' },
          { at: 'await manager', text: 'Xếp user vào hàng đợi (INSERT ... ON CONFLICT DO NOTHING, PK user_id)' },
          { at: 'await manager.query(', text: 'Khoá hàng của chính mình để không ai giành được mình từ đây' },
          { at: 'const claimedMeanwhile =', text: 'Kiểm lại active: có thể một user khác đã ghép mình giữa lúc kiểm tra và lúc chèn' },
          { at: 'const own = (await manager.query(', text: 'Đọc entry của mình (nếu đã bị giành thì dựng state từ bảng active)' },
          { at: 'const rows = (await manager.query(', text: 'Giành người chờ CŨ HƠN mình, cũ nhất còn rảnh, mà không bao giờ chờ khoá' },
          { at: 'const candidateActive = await manager.findOneBy(', text: 'Ứng viên đã active ở phiên khác thì dọn entry thừa của nó và xét người kế (tối đa 20 ứng viên)' },
          { at: 'if (await this.safetyService.canPair(', text: 'Kiểm lại block/report đúng lúc ghép' },
          { at: 'const claimed = await manager.delete(MovieMatchQueueEntry, { userId });', text: 'Xoá entry của mình để chốt lượt ghép (nếu mình đang bị giành thì DELETE chờ rồi thấy hàng đã mất)' },
          { at: 'const session = await this.createAnonSession(', text: 'Có cặp: tạo phiên ẩn danh, video do server chọn tất định theo id phiên' },
          { at: 'await manager.delete(MovieMatchQueueEntry, { userId: partnerId });', text: 'Rút đối tác khỏi hàng đợi và ghi 2 participant (PK user_id là chốt cuối)' },
          { at: 'return this.anonView(session, userId);', text: 'Trả trạng thái đã ghép theo góc nhìn của user (không lộ đối tác)' },
        ],
        items: [
          { tag: 'CONTROLLER', file: MC, dedent: true, ranges: [fn("@Post('anon/queue')")] },
          {
            tag: 'SERVICE',
            file: MS,
            dedent: true,
            ranges: [fn('async joinAnonQueue(')],
            inline: [
              {
                at: 'await this.expireAnonForUser(manager, userId);',
                text: ['Hết hạn kiểu lười: không có job quét phiên, mỗi lần user vào hoặc hỏi trạng thái mới đóng phiên đã quá deadline của chính họ.'],
                src: 'doc getAnonCurrent movie-match.service.ts ("lazy expiry deadline server")',
              },
              {
                at: 'await manager',
                text: ['PK user_id làm enqueue idempotent: bấm đúp, 2 tab hoặc retry không xếp hàng 2 lần.'],
                src: 'migration 1755900000000-movie-match-anon.ts (movie_match_queue_entries: user_id uuid PRIMARY KEY) + doc joinAnonQueue ("Enqueue idempotent")',
              },
              {
                at: 'const claimedMeanwhile =',
                text: [
                  '[POSTGRES] Khoá advisory theo user KHÔNG chặn một user KHÁC giành entry của mình: nếu người khác ghép mình ngay sau lần kiểm tra active đầu và commit, lượt join này sẽ chèn LẠI entry và trả queued cho user đã active, để lại một hàng queue thừa.',
                  'Khoá hàng của chính mình (dòng trên) rồi kiểm lại active ở ranh giới ghi: nếu đã bị ghép thì dọn entry vừa chèn và trả đúng phiên.',
                ],
                src: 'doc joinAnonQueue movie-match.service.ts (đoạn "Khoá advisory KHÔNG đủ…") + test movie-match.integration.spec.ts',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: LOCK,
            dedent: true,
            ranges: [{ at: 'export async function lockAdvisoryXact(', to: '^}' }],
          },
          { tag: 'SERVICE', file: MS, dedent: true, ranges: [fn('private async purgeStaleAnonEntries(')] },
          {
            tag: 'SERVICE',
            file: MS,
            dedent: true,
            ranges: [fn('private async tryMatchAnon(')],
            inline: [
              {
                at: 'const rows = (await manager.query(',
                text: [
                  '[POSTGRES] "Người MỚI giành người CŨ": chỉ xét entry cũ hơn mình theo (queued_at, user_id), so sánh ngay trong SQL (đủ độ chính xác micro giây; qua JS Date sẽ cắt về mili giây và hai bên có thể cùng coi nhau là không cũ hơn).',
                  'SKIP LOCKED nên không bao giờ chờ (không deadlock) và các lượt join của user khác nhau chạy song song thay vì xếp hàng sau một khoá toàn cục. Không khoá hàng của chính mình khi tìm: nếu khoá sớm thì mọi người mới hơn đều thấy mình đang bị khoá và bỏ qua, cả hàng đợi poll cùng lúc sẽ không ai ghép được.',
                ],
                src: 'doc tryMatchAnon movie-match.service.ts ("QUY TẮC người MỚI HƠN giành người CŨ HƠN…") + comment gốc trong câu SQL',
              },
              {
                at: 'if (await this.safetyService.canPair(',
                text: ['Kiểm lại block/report ĐÚNG LÚC ghép, trên cùng transaction; không tin state ở thời điểm vào hàng đợi.'],
                src: 'comment gốc movie-match.service.ts ("Re-check block/report ĐÚNG LÚC ghép")',
              },
              {
                at: 'const claimed = await manager.delete(MovieMatchQueueEntry, { userId });',
                text: ['Xoá entry của mình để "chốt" lượt ghép. Nếu một lượt mới hơn đang giành mình thì DELETE chờ nó commit rồi không còn hàng → bỏ lượt này (nhả đối tác) và dựng lại state từ bảng active.'],
                src: 'comment gốc movie-match.service.ts ("Xoá entry của chính mình để chốt lượt ghép")',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: MS,
            dedent: true,
            ranges: [fn('private async createAnonSession(')],
            inline: [
              {
                at: 'videoUrl: pool[fnv1aHash(id) % pool.length],',
                text: ['Server chọn video tất định theo id phiên: client không gửi và không chọn được URL.'],
                src: 'comment gốc movie-match.service.ts ("Server chọn video deterministic theo session")',
              },
            ],
          },
          { tag: 'POSTGRES', file: MIG_ANON, dedent: true, ranges: [sql('CREATE TABLE movie_match_queue_entries (')] },
          { tag: 'POSTGRES', file: MIG_ORDER, dedent: true, ranges: [sql('CREATE INDEX IF NOT EXISTS idx_movie_match_queue_order')] },
        ],
      },
    ],
  },
];
