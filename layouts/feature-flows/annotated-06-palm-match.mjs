// Palm Match (bản 10M CCU): hàng đợi ghép ẩn danh bằng bảng Postgres, KHÔNG còn khoá advisory toàn cục.
// Người MỚI hơn giành người CŨ hơn bằng FOR UPDATE SKIP LOCKED; join của cùng một user tuần tự bằng khoá advisory THEO USER;
// sau khi chèn entry, khoá hàng của chính mình rồi kiểm lại active (một user khác có thể đã ghép mình giữa chừng).
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const M = 'apps/core-api/src/modules/palm-match';
const MC = `${M}/palm-match.controller.ts`;
const MS = `${M}/palm-match.service.ts`;
const LOCK = 'apps/core-api/src/database/advisory-lock.ts';
const MIG = 'apps/core-api/src/database/migrations/1755500000000-palm-match-session.ts';
const END_FN = '^  }$';
const END_SQL = '^    `\\);$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const sql = (anchor) => ({ at: anchor, to: END_SQL, pad: [1, 0] });

export const annotatedFeatures = [
  {
    id: '06-palm-match',
    short: 'Palm Match',
    title: 'Palm Match: hàng đợi không khoá toàn cục',
    summary:
      'Ghép ẩn danh hai người qua trò bói bài. Ở quy mô lớn, hàng đợi này không được xếp hàng sau một khoá toàn cục: mỗi user chỉ khoá chính mình, người mới giành người cũ bằng SKIP LOCKED.',
    arch: 'hot-paths',
    diagramAnchor: '06-palm-match',
    endpoints: [
      {
        n: '01',
        slug: 'post-join-queue',
        method: 'POST',
        short: '/palm-match/queue',
        route: '/api/v1/palm-match/queue',
        name: 'Vào hàng đợi Palm Match',
        title:
          'Vào hàng đợi ghép ẩn danh; nếu có người chờ phù hợp thì ghép ngay thành 1 phiên Palm Match.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', 'Nhận request vào hàng đợi, giao cho service và trả trạng thái hiện tại (đang chờ hoặc đã ghép).'],
          ['SERVICE', 'Trong 1 transaction: khoá advisory theo user, đóng session quá hạn của user, xếp user vào hàng đợi, khoá hàng của chính mình và kiểm lại active, rồi giành người chờ lâu nhất bằng SKIP LOCKED, kiểm block/report, tạo session snapshot.'],
          ['POSTGRES', 'Hàng đợi là bảng (PK user_id); khoá advisory theo user chỉ tuần tự hoá lượt join của cùng một user; FOR UPDATE SKIP LOCKED để giành entry mà không bao giờ chờ (không deadlock); PK bảng participant là chốt cuối cho "1 user 1 session".'],
        ],
        tables: [
          ['palm_match_queue_entries', 'hàng đợi: mỗi user đang chờ 1 dòng (PK user_id), sắp theo (queued_at, user_id); bị xoá khi quá hạn chờ hoặc khi được ghép.'],
          ['palm_match_active_participants', 'mỗi user 1 dòng trỏ tới session chưa dismiss (PK user_id); ghi 2 dòng khi ghép.'],
          ['palm_match_sessions', 'snapshot 1 lượt ghép: cặp (low, high), cung hoàng đạo mỗi bên, % hợp, lời bói, deadline expires_at.'],
          ['palm_reading_templates', 'đọc các mẫu lời bói category love đang hoạt động để chọn lời bói cho cặp.'],
        ],
        related: [
          ['Safety', 'canPair: hai người đã block hoặc report nhau gần đây thì không ghép (không chép).'],
          ['Movie Match ẩn danh', 'dùng cùng kỹ thuật hàng đợi + khoá advisory theo user + kiểm lại active sau khi khoá hàng của mình.'],
          ['flip / rating', 'bước sau: mỗi bên lật lá, rồi like hoặc skip; mutual-like tạo Friendship (chưa chép).'],
        ],
        nested: true,
        // Không bung: hết hạn kiểu lười (đọc rồi đổi status), trạng thái active (đọc participant + session).
        skip: ['expireActiveForUser', 'activeState'],
        steps: [
          { at: "@Post('queue')", text: 'Nhận request (user lấy từ JWT)' },
          { at: 'await lockAdvisoryXact(manager,', text: 'Khoá advisory THEO USER (không toàn cục): chỉ tuần tự hoá các lượt join của chính user này' },
          { at: 'await this.expireActiveForUser(manager, userId);', text: 'Đóng session đã quá hạn của chính user (hết hạn kiểu lười)' },
          { at: 'const activeState = await this.activeState(manager, userId);', text: 'Còn session chưa dismiss thì trả lại state đó, không xếp hàng' },
          { at: 'await this.purgeStaleEntries(manager);', text: 'Dọn tối đa 50 entry chờ quá hạn (SKIP LOCKED, không chờ ai)' },
          { at: 'await manager', text: 'Xếp user vào hàng đợi (INSERT ... ON CONFLICT DO NOTHING, PK user_id)' },
          { at: 'await manager.query(', text: 'Khoá hàng của chính mình để không ai giành được mình từ đây' },
          { at: 'const claimedMeanwhile =', text: 'Kiểm lại active: có thể một user khác đã ghép mình giữa lúc kiểm tra và lúc chèn' },
          { at: 'const own = (await manager.query(', text: 'Đọc entry của mình (nếu đã bị giành thì dựng state từ bảng active)' },
          { at: 'const rows = (await manager.query(', text: 'Giành người chờ CŨ HƠN mình, cũ nhất còn rảnh, mà không bao giờ chờ khoá' },
          { at: 'if (await this.safetyService.canPair(', text: 'Kiểm lại block/report đúng lúc ghép' },
          { at: 'const claimed = await manager.delete(PalmMatchQueueEntry, { userId });', text: 'Xoá entry của mình để chốt lượt ghép (nếu mình đang bị giành thì DELETE chờ rồi thấy hàng đã mất)' },
          { at: 'const session = await this.createSessionSnapshot(', text: 'Có cặp: tạo session snapshot (seed tất định)' },
          { at: 'await manager.insert(PalmMatchActiveParticipant', text: 'Rút đối tác khỏi hàng đợi và ghi 2 participant (PK user_id là chốt cuối)' },
          { at: 'return this.sessionView(session, userId);', text: 'Trả trạng thái đã ghép theo góc nhìn của user' },
        ],
        items: [
          { tag: 'CONTROLLER', file: MC, dedent: true, ranges: [fn("@Post('queue')")] },
          {
            tag: 'SERVICE',
            file: MS,
            dedent: true,
            ranges: [fn('async joinQueue(')],
            inline: [
              {
                at: 'await this.expireActiveForUser(manager, userId);',
                text: ['Hết hạn kiểu lười: module không có job quét, mỗi lần user vào hoặc hỏi trạng thái mới đóng session đã quá deadline của chính họ.'],
                src: 'doc getCurrent palm-match.service.ts ("lazy-expire deadline server") + module palm-match không có job nền',
              },
              {
                at: 'await manager',
                text: ['PK user_id làm enqueue idempotent: 2 tab hoặc retry không xếp hàng 2 lần.'],
                src: 'doc entity palm-match-session.entity.ts ("PK theo user ngăn hai tab enqueue hai lần")',
              },
              {
                at: 'const claimedMeanwhile =',
                text: [
                  '[POSTGRES] Khoá advisory theo user KHÔNG chặn một user KHÁC giành entry của mình: nếu D ghép mình ngay sau lần kiểm tra active đầu và commit, lượt join này sẽ chèn LẠI entry và trả queued cho user đã active, để lại một hàng queue thừa.',
                  'Khoá hàng của chính mình (dòng trên) rồi kiểm lại active ở ranh giới ghi: nếu đã bị ghép thì dọn entry vừa chèn và trả đúng phiên.',
                ],
                src: 'doc joinQueue palm-match.service.ts (đoạn "Khoá advisory KHÔNG đủ…") + test palm-match.integration.spec.ts "join replay vẫn trả phiên active…"',
              },
            ],
          },
          {
            tag: 'SERVICE',
            file: LOCK,
            dedent: true,
            ranges: [{ at: 'export async function lockAdvisoryXact(', to: '^}' }],
          },
          {
            tag: 'SERVICE',
            file: MS,
            dedent: true,
            ranges: [fn('private async purgeStaleEntries(')],
          },
          {
            tag: 'SERVICE',
            file: MS,
            dedent: true,
            ranges: [fn('private async tryMatch(')],
            inline: [
              {
                at: 'const rows = (await manager.query(',
                text: [
                  '[POSTGRES] "Người MỚI giành người CŨ": chỉ xét entry cũ hơn mình theo (queued_at, user_id), so sánh ngay trong SQL (đủ độ chính xác micro giây; qua JS Date sẽ cắt về mili giây và hai bên có thể cùng coi nhau là không cũ hơn).',
                  'SKIP LOCKED nên không bao giờ chờ (không deadlock) và các lượt join của user khác nhau chạy song song thay vì xếp hàng sau một khoá toàn cục.',
                ],
                src: 'doc tryMatch palm-match.service.ts ("QUY TẮC người MỚI HƠN giành người CŨ HƠN…") + comment gốc trong câu SQL',
              },
              {
                at: 'if (await this.safetyService.canPair(',
                text: ['Kiểm lại block/report ĐÚNG LÚC ghép, trên cùng transaction; không tin state ở thời điểm vào hàng đợi.'],
                src: 'comment gốc palm-match.service.ts ("Re-check đúng lúc ghép")',
              },
              {
                at: 'const claimed = await manager.delete(PalmMatchQueueEntry, { userId });',
                text: ['Xoá entry của mình để "chốt" lượt ghép. Nếu một lượt mới hơn đang giành mình thì DELETE chờ nó commit rồi không còn hàng → bỏ lượt này (nhả đối tác) và dựng lại state từ bảng active.'],
                src: 'comment gốc palm-match.service.ts ("Xoá entry của chính mình để chốt lượt ghép")',
              },
            ],
          },
          { tag: 'SERVICE', file: MS, dedent: true, ranges: [fn('private async createSessionSnapshot(')] },
          {
            tag: 'POSTGRES',
            file: MIG,
            dedent: true,
            ranges: [sql('CREATE TABLE palm_match_queue_entries ('), sql('CREATE INDEX idx_palm_match_queue_order'), sql('CREATE TABLE palm_match_active_participants (')],
          },
        ],
      },
    ],
  },
];
