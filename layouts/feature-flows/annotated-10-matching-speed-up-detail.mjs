// Matching Speed-up: CHỈ endpoint khó, có cơ chế kỹ thuật thật (trừ Diamond, DB, Redis). Endpoint đơn giản không viết.
// Một file, luồng đi liền mạch từ trên xuống theo thứ tự chạy; mỗi đoạn có nhãn tầng (tô màu ở bản HTML).
// Hàm được chép NGUYÊN VẸN (không cắt giữa hàm). Comment chỉ trả lời "vì sao" ở chỗ logic khó, đặt ngay cạnh dòng code;
// comment ở chỗ luồng chuyển sang tầng khác (Postgres, Redis...) mở đầu bằng nhãn tầng đó.
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const M = 'apps/core-api/src/modules/matching';
const MC = `${M}/matching.controller.ts`;
const MS = `${M}/matching.service.ts`;
const MR = `${M}/redis/matching-redis.provider.ts`;
const MQ = `${M}/redis/redis-matching-queue.adapter.ts`;
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '10-matching-speed-up-detail',
    short: 'Matching Speed-up',
    title: 'Matching Speed-up',
    summary: 'Trả Diamond để vé đang chờ được đẩy lên đầu hàng đợi Redis và ghép sớm hơn.',
    arch: 'matching',
    diagramAnchor: '10-matching-speed-up-detail',
    endpoints: [
      {
        n: '01',
        slug: 'post-speedup-ticket',
        method: 'POST',
        short: '/matching/tickets/:id/speedup',
        route: '/api/v1/matching/tickets/:id/speedup',
        name: 'Speed-up vé đang chờ ghép',
        title: 'Trả Diamond để vé được ưu tiên: trừ tiền trước, cộng boost vào DB, rồi đặt lại điểm trong Redis.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [REDIS]',
        roles: [
          ['CONTROLLER', 'Nhận yêu cầu speed-up kèm header Idempotency-Key; user lấy từ JWT, id vé từ URL; trả kết quả kèm giá speed-up hiện hành.'],
          ['SERVICE', 'Kiểm tra vé là của chính user và còn queued, tính giá theo hạng VIP, trừ Diamond qua Economy, cộng boost vào vé, rồi đặt lại điểm trong Redis.'],
          ['POSTGRES', 'Nguồn sự thật của tổng boost trên vé (priority_boost_ms, cộng dồn nguyên tử) và của ví Diamond.'],
          ['REDIS', 'Hàng đợi dẫn xuất: điểm của vé trong sorted set được đặt lại thấp hơn để matcher ghép vé này trước.'],
        ],
        tables: [
          ['match_tickets', 'vé đang chờ: trạng thái queued, nhóm ghép, priority_boost_ms cộng dồn mỗi lần speed-up.'],
          ['wallets', 'ví Diamond: bị khóa FOR UPDATE và trừ số dư trong lúc ghi sổ; đọc hạng VIP để tính giá.'],
          ['transactions', '1 giao dịch matching_speedup cho mỗi lần trả tiền, key idempotency unique.'],
          ['ledger_entries', 'bút toán sổ kép: Nợ ví user, Có system_revenue.'],
          ['outbox_events', 'event economy.diamond.debited ghi cùng transaction với số dư.'],
        ],
        redis: [
          ['matching:queue:{matchType}:{region}:{ageBand}', 'sorted set; member = ticketId, score = enqueuedAt + trustPenalty - priorityBoost (nhỏ ghép trước); speed-up ghi lại score nhỏ hơn.'],
        ],
        related: [
          ['Economy', 'spendDiamond: ghi sổ kép, khóa ví FOR UPDATE, kiểm số dư, idempotent theo key; getActiveVipTier: đọc hạng VIP để tính giá.'],
          ['Matching worker', 'bước kế tiếp: matcher ZPOPMIN lấy vé điểm thấp nhất nên vé đã boost được ghép trước (xem luồng vào hàng đợi Voice Match).'],
        ],
        // Bản "lồng nhau tự động": engine dựng cây theo QUAN HỆ GỌI HÀM từ `items` (điểm vào = hàm controller đầu tiên).
        // Hàm được gọi chỉ chép thân hàm, thụt vào dưới dòng gọi; tham số gán `const ...` từ chỗ gọi; constructor gom ở
        // đầu khối service; hàm phụ 1 câu return (shardKeyOfTicket…) thay thẳng vào giá trị. Hàm đọc/tính cơ bản không bung.
        nested: true,
        skip: ['getTicket', 'getSpeedupPriceDiamondForUser'],
        steps: [
          { at: "@Post('tickets/:id/speedup')", text: 'Nhận request (user từ JWT, id vé từ URL, Idempotency-Key từ header)' },
          { at: 'const ticket = await this.getTicket(user, ticketId);', text: 'Kiểm tra vé (đúng chủ vé, còn đang queued)' },
          { at: 'const price = await this.getSpeedupPriceDiamondForUser(user.userId);', text: 'Tính giá speed-up và tạo key idempotent' },
          { at: 'const spend = await this.economy.spendDiamond(', text: 'Trừ Diamond qua Economy' },
          { at: 'if (!spend.replayed) {', text: 'Cộng boost vào vé trong Postgres' },
          { at: 'const fresh = await this.ticketRepo.findOneByOrFail({ id: ticket.id });', text: 'Đọc lại tổng boost, rồi đặt lại điểm của vé trong Redis' },
          { at: 'const shard =', text: 'Ghi điểm mới của vé vào sorted set của shard' },
          { at: 'return {', in: 'MatchingService.speedup', text: 'Service trả kết quả về controller' },
          { at: 'return SpeedupResultDto.from(', text: 'Controller trả response kèm giá speed-up hiện hành' },
        ],
        items: [
          // 1) Controller: điểm vào
          { tag: 'CONTROLLER', file: MC, ranges: [fn("@Post('tickets/:id/speedup')")] },

          // 2) Service: trừ tiền -> boost DB -> score Redis (getTicket và tính giá chỉ là dòng gọi, xem `skip`)
          {
            tag: 'SERVICE',
            file: MS,
            ranges: [fn('async speedup('), fn('async getTicket('), fn('async getSpeedupPriceDiamondForUser(')],
            inline: [
              {
                at: 'const price = await this.getSpeedupPriceDiamondForUser(user.userId);',
                text: ['Giá do server tính ngay trước khi trừ (theo hạng VIP hiện tại): client không tự gửi giá và không được hard-code.'],
                src: 'docs/services/matching-service.md mục 4 (server đọc tier và giá ngay trước khi debit) + comment gốc matching.service.ts L256',
              },
              {
                at: 'const prefixedKey = speedupIdempotencyKey(user.userId, idempotencyKey);',
                text: ['Key = (user, Idempotency-Key của client). Economy dùng nguyên chuỗi này làm key giao dịch, nên bấm lại cùng key chỉ trừ tiền một lần.'],
                src: 'doc gốc matching.constants.ts (speedupIdempotencyKey: economy dùng nguyên chuỗi này làm key giao dịch)',
              },
              {
                at: 'const spend = await this.economy.spendDiamond(',
                text: ['[POSTGRES] Trừ Diamond TRƯỚC khi đụng vào hàng đợi: Economy tự khóa ví, kiểm số dư và ghi sổ idempotent. Bước sau lỗi thì tiền đã trừ, nhưng retry cùng key không trừ lại.'],
                src: 'docs/services/matching-service.md mục 4 (thứ tự bắt buộc: spendDiamond rồi mới cập nhật score Redis; retry không trừ tiền lại) + doc gốc economy.service.ts L463-469',
              },
              {
                at: 'if (!spend.replayed) {',
                text: ['[POSTGRES] Replay cùng key không cộng boost lần nữa (tránh double-boost); increment nguyên tử, chỉ khi vé còn queued. Đánh đổi: trừ tiền và increment là 2 bước riêng, process chết giữa chừng thì retry không cộng lại boost.'],
                src: 'comment gốc matching.service.ts L456-458 + suy ra từ code: boost chỉ cộng khi !spend.replayed, còn trừ tiền commit trước ở transaction riêng của Economy (doc mục 4 chỉ bảo đảm retry phía Redis)',
              },
              {
                at: 'const fresh = await this.ticketRepo.findOneByOrFail({ id: ticket.id });',
                text: ['Đọc lại tổng boost từ DB để tính score TUYỆT ĐỐI. Boost cộng dồn trong DB nên retry hay replay cùng key chỉ sửa score về đúng tổng đã trả tiền, không double-boost.'],
                src: 'doc gốc matching.service.ts L419-423',
              },
            ],
          },

          // 3) Redis: hàm phụ tính shard/score (1 câu return, thay thẳng vào giá trị) và ghi vào sorted set
          {
            tag: 'REDIS',
            file: MR,
            ranges: [
              { at: 'export function shardKeyOfTicket(', to: '^}' },
              { at: 'export function matchingShardKey(', to: '^}' },
              { at: 'export function ticketScore(', to: '^}' },
            ],
          },
          {
            tag: 'REDIS',
            file: MQ,
            ranges: [fn('async enqueue(')],
            inline: [
              {
                at: 'await this.redis.zadd(',
                text: ['Mỗi shard (loại ghép + vùng + nhóm tuổi) là một sorted set riêng, điểm nhỏ ghép trước: matcher lấy từng shard bằng ZPOPMIN 2 (atomic nên 2 matcher không lấy trùng vé), nên speed-up chỉ cần hạ điểm của vé ngay trong set này. XX: vé đã rời hàng (ghép hoặc hủy) thì không bị thêm lại.'],
                src: 'docs/services/matching-service.md mục 2 (shard key matchType/region/ageBand; Sorted Set member = ticketId, score nhỏ ghép trước; ZPOPMIN key 2 atomic, 2 matcher không lấy trùng) + doc gốc matcher-worker.service.ts L62 + comment gốc matching.service.ts L465 (XX: member đã rời queue thì bỏ qua)',
              },
            ],
          },
        ],
      },
    ],
  },
];
