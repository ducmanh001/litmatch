// Matching engine ở 10M: một tick của matcher. Redis chỉ là hàng đợi dẫn xuất (nguồn sự thật là Postgres): đọc cửa sổ ứng viên,
// chọn cặp, lấy cả hai vé bằng một script Lua nguyên tử, xác minh lại dưới khoá rồi mới tạo session; lỗi thì trả vé về hàng đợi
// mà không mất ưu tiên đã mua. `src` = bằng chứng của từng comment; engine bỏ qua, verify-annotated.mjs yêu cầu có.
const M = 'apps/core-api/src/modules/matching';
const MW = `${M}/jobs/matcher-worker.service.ts`;
const MQ = `${M}/redis/redis-matching-queue.adapter.ts`;
const SQ = `${M}/redis/sharded-matching-queue.adapter.ts`;
const QR = `${M}/jobs/queue-repair.service.ts`;
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const top = (anchor) => ({ at: anchor, to: '^}' });

export const annotatedFeatures = [
  {
    id: '31-matching-engine',
    short: 'Matching engine',
    title: 'Matching engine: matcher, định tuyến shard và repair hàng đợi',
    summary:
      'Hàng đợi ghép ở Redis (chỉ là bản chiếu dẫn xuất; Postgres là nguồn sự thật), chọn cặp theo cửa sổ ứng viên, claim nguyên tử rồi xác minh lại dưới khoá Postgres. Đây là đường nóng của 10 triệu lượt ghép mỗi ngày (≈ 115 lượt/giây trung bình, đỉnh gấp ~10 lần). Hàng đợi có thể chia sang nhiều Redis vật lý theo hash của shard, và một job repair dựng lại hàng đợi từ DB khi Redis mất dữ liệu.',
    arch: 'matching',
    diagramAnchor: '01-matching-engine',
    endpoints: [
      {
        n: '01',
        slug: 'job-matcher-tick',
        method: 'JOB',
        short: 'matcher tick',
        route: 'MatcherWorkerService.runOnce (đánh thức khi có ticket + backstop định kỳ)',
        name: 'Một tick của matcher',
        title:
          'Duyệt các shard đang có vé, chọn cặp tương thích trong cửa sổ đầu shard, claim cả hai vé nguyên tử, xác minh lại dưới khoá rồi tạo session.',
        flow: '[WORKER] → [REDIS] → [POSTGRES] → [REDIS]',
        roles: [
          ['WORKER', 'Chạy tick (đánh thức khi có ticket mới + backstop), chia shard cho vài worker song song, chọn cặp, xác minh, tạo session, trả vé về hàng đợi khi cần, phát realtime sau commit.'],
          ['REDIS', 'Hàng đợi dẫn xuất theo shard (loại ghép + vùng + nhóm tuổi): đọc cửa sổ, claim cả hai vé bằng Lua, khôi phục vé khi ghép không thành.'],
          ['POSTGRES', 'Nguồn sự thật: khoá hàng hai ticket theo thứ tự id, xác minh lại trạng thái/gender/block, tạo match_sessions và đổi hai ticket sang confirmed trong một transaction.'],
        ],
        tables: [
          ['match_tickets', 'vé đang chờ: status queued → confirmed/expired, priority_boost_ms, trust_penalty_ms, enqueued_at.'],
          ['match_sessions', 'một dòng cho mỗi cặp đã ghép, trỏ tới hai ticket.'],
          ['users', 'đọc id, status, gender (đọc TƯƠI lúc ghép, không tin snapshot lúc vào hàng đợi).'],
          ['notifications', 'một thông báo match_confirmed cho mỗi bên, ghi cùng transaction.'],
        ],
        redis: [
          ['matching:queue:{matchType}:{region}:{ageBand}', 'sorted set; member = ticketId, score = enqueuedAt + trustPenalty - priorityBoost (nhỏ ghép trước).'],
          ['matching:active-shards', 'tập các shard đang có vé, để tick biết shard nào cần duyệt.'],
        ],
        related: [
          ['Speed-up', 'hạ score của vé trong sorted set (ZADD XX LT) — xem trang speed-up.'],
          ['Safety', 'canPair: block/report được kiểm hai lần: lúc chọn cặp (bộ lọc) và lúc xác minh dưới khoá (quyết định cuối).'],
          ['ticket-sweeper', 'expire vé quá hạn và thêm vé requeue mới (không chép).'],
          ['Repair hàng đợi', 'trang 02: khi Redis mất hàng đợi, job quét lại vé queued trong DB và dựng lại; không cần client gửi lại.'],
          ['Định tuyến shard', 'trang 03: khi có nhiều Redis, mỗi hàng đợi logic nằm trọn trên MỘT Redis nên claim hai vé vẫn nguyên tử.'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<number> {', text: 'Một tick: chạy các vòng liên tiếp khi có wake-up đến giữa chừng (tối đa MAX_RERUN_ROUNDS)' },
          { at: 'const shards = shuffled(await this.queue.listActiveShards());', text: 'Lấy các shard đang có vé và xáo ngẫu nhiên để các pod không cùng đập vào một shard' },
          { at: 'const workers = Math.min(this.effectiveConcurrency(), shards.length);', text: 'Số shard drain song song, bị chặn theo ¼ pool Postgres' },
          { at: 'const drained = await this.drainShard(shards[next++]);', text: 'Mỗi worker lấy shard kế tiếp và drain' },
          { at: 'const window = await this.queue.peekWindow(shard, windowSize);', text: 'Đọc (KHÔNG lấy ra) cửa sổ ứng viên đầu shard' },
          { at: 'const pair = await this.findPair(candidates, userById);', text: 'Chọn cặp tương thích đầu tiên theo thứ tự ưu tiên' },
          { at: 'if (!(await this.queue.claimPair(', text: 'Lấy cả hai vé khỏi Redis bằng một script Lua nguyên tử; thua thì nhìn lại cửa sổ' },
          { at: 'const attempt = this.dataSource.transaction(async (manager) => {', text: 'Xác minh lại dưới khoá trong một transaction Postgres rồi tạo session' },
          { at: 'const session = await manager.save(', text: 'Tạo MatchSession, đổi hai ticket sang confirmed (UPDATE có điều kiện), ghi thông báo' },
          { at: 'const requeue: PoppedTicket[] = [];', text: 'Không ghép được giữa chừng: vé còn hợp lệ được trả về hàng đợi, vé không hợp lệ thì expire' },
          { at: 'const result = await attempt.catch(async (error: unknown) => {', text: 'Transaction lỗi sau khi đã claim: trả cả hai vé về hàng đợi rồi ném lỗi gốc' },
          { at: 'if (result.requeue.length > 0) {', text: 'Trả vé còn hợp lệ về hàng đợi mà không mất ưu tiên đã mua' },
          { at: 'const restored = await Promise.allSettled(', text: 'Bước 1: khôi phục sự hiện diện trong Redis bằng ZADD NX với score đã đọc' },
          { at: 'const rows = await this.dataSource.manager.find(MatchTicket, {', text: 'Bước 2: đọc lại boost từ DB và đặt score tuyệt đối bằng ZADD XX LT' },
          { at: 'for (const { matchType, waitSeconds } of result.matchedPair) {', text: 'Ghi metric thời gian chờ, phát realtime và push SAU commit' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'if (!this.rerunRequested) break;',
                text: ['Wake-up đến khi tick đang chạy KHÔNG bị bỏ: vé vừa vào có thể nằm ở shard tick đó đã xử lý xong, bỏ thì nó phải chờ wake-up kế hoặc backstop vài giây. Cờ rerunRequested làm tick chạy lại ngay khi xong.'],
                src: 'doc runOnce matcher-worker.service.ts ("Wake-up đến khi một tick đang chạy KHÔNG bị bỏ")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('private runRound(')],
            inline: [
              {
                at: 'const workers = Math.min(this.effectiveConcurrency(), shards.length);',
                text: ['Các shard có ticket rời nhau nên drain song song không tranh lock; số worker bị chặn theo pool Postgres để matcher không chiếm hết kết nối của request thường.'],
                src: 'comment gốc matcher-worker.service.ts ("Các shard có ticket rời nhau…")',
              },
              {
                at: 'const drained = await this.drainShard(shards[next++]);',
                text: ['Không viết `matched += await ...`: vế trái được đọc TRƯỚC khi await nên hai worker chạy xen kẽ sẽ ghi đè kết quả của nhau.'],
                src: 'comment gốc matcher-worker.service.ts ("Không viết matched += await")',
              },
            ],
          },
          { tag: 'WORKER', file: MW, dedent: true, ranges: [fn('private effectiveConcurrency(')] },
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('private async drainShard(')],
            inline: [
              {
                at: 'if (window.length < 2) break;',
                text: ['Chỉ còn 1 ticket: không động vào, chờ người tiếp theo (không pop rồi trả lại như trước, nên vé đơn lẻ không bao giờ bị xáo score hay mất chỗ).'],
                src: 'comment gốc matcher-worker.service.ts ("Chỉ còn 1 ticket")',
              },
              {
                at: "if (outcome === 'stalled') break;",
                text: ['stalled: không có cặp hợp lệ nào trong cửa sổ đầu shard. Nhìn lại sẽ thấy đúng cửa sổ đó nên sẽ busy-loop; thử lại khi có ticket chen vào cửa sổ hoặc sweeper expire ticket quá hạn.'],
                src: 'comment gốc matcher-worker.service.ts ("stalled: không có cặp hợp lệ nào…")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('private async matchWindow(')],
            inline: [
              {
                at: 'const pair = await this.findPair(candidates, userById);',
                text: ['Cặp 2 ticket đầu shard không khớp (giới tính, block/report) KHÔNG còn chặn cả shard: ticket cũ nhất tìm đối tác tương thích đầu tiên trong cửa sổ. Cửa sổ chỉ ĐỌC; chỉ cặp được chọn mới bị lấy ra khỏi Redis. Mô phỏng: 46% vé được ghép → 100% khi đa số chọn "khác giới".'],
                src: 'doc matchWindow matcher-worker.service.ts + docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 5.2',
              },
              {
                at: 'if (!(await this.queue.claimPair(',
                text: ['[REDIS] Hai matcher cùng chọn một vé thì đúng một bên thắng: bên thua nhận false và không phải "trả lại" vé nào (khác ZPOPMIN, vốn lấy ra rồi mới biết có ghép được không).'],
                src: 'doc claimPair matching-queue.port.ts + doc CLAIM_PAIR_SCRIPT redis-matching-queue.adapter.ts',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('private async findPair(')],
            inline: [
              {
                at: 'if (canPairChecks >= MAX_CAN_PAIR_CHECKS) return undefined;',
                text: ['canPair (đọc block/report) chỉ chạy cho cặp đã qua bộ lọc giới tính và tối đa MAX_CAN_PAIR_CHECKS lần mỗi cửa sổ, kèm cache cặp không ghép được: ở tốc độ ghép cao điểm, hỏi lại cùng một cặp bị cấm mỗi tick là lãng phí đọc DB.'],
                src: 'doc findPair matcher-worker.service.ts ("canPair… tối đa MAX_CAN_PAIR_CHECKS lần mỗi cửa sổ") + cache rememberUnpairable',
              },
            ],
          },
          { tag: 'WORKER', file: MW, dedent: true, ranges: [fn('private async discard(')] },
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('private async confirmPair(')],
            inline: [
              {
                at: "order: { id: 'ASC' },",
                text: ['[POSTGRES] Khoá hai ticket theo thứ tự id cố định để không deadlock với các writer khác (speed-up, cancel, sweeper).'],
                src: 'comment gốc matcher-worker.service.ts ("thứ tự lock cố định — tránh deadlock")',
              },
              {
                at: 'const aValid = isValid(ta);',
                text: ['Giữa lúc chọn cặp và lúc khoá hàng, một bên có thể vừa cancel, bị ban, đổi gender hoặc bị block/report. canPair lúc chọn chỉ là bộ lọc; quyết định cuối nằm Ở ĐÂY, dưới khoá, vì từ lúc chọn tới lúc commit gồm cả thời gian chờ claim và chờ lấy kết nối pool (tới vài giây khi tải cao).'],
                src: 'comment gốc matcher-worker.service.ts ("Giữa lúc chọn cặp và lúc khoá row…")',
              },
              {
                at: 'const updated = await manager.update(',
                text: ['Một UPDATE có điều kiện thay cho 2 lần save entity (mỗi lần kèm SELECT): hai ticket đã được khoá và xác minh queued nên affected luôn là 2; điều kiện status là chốt chặn thứ hai.'],
                src: 'comment gốc matcher-worker.service.ts ("Một UPDATE có điều kiện thay cho 2 lần save")',
              },
              {
                at: 'const requeue: PoppedTicket[] = [];',
                text: ['Không ghép được (đã đổi giữa chừng): vé còn hợp lệ được đẩy lại Redis với score gốc sau commit (không mất lượt chờ); vé không hợp lệ nhưng vẫn queued thì expire; vé đã rời queued thì chỉ gỡ.'],
                src: 'comment gốc matcher-worker.service.ts ("Không ghép được (đã đổi giữa chừng)")',
              },
              {
                at: 'const result = await attempt.catch(async (error: unknown) => {',
                text: ['Transaction lỗi (hết pool, deadlock, mất kết nối) SAU khi cặp đã bị claim khỏi Redis: trả cả hai về hàng đợi thay vì để thành zombie tới khi sweeper expire. Dưới tải lớn, lỗi lấy kết nối là chuyện thường. Nếu thực ra transaction đã commit, vé confirmed quay lại Redis sẽ bị matchWindow gỡ ở lần sau, không ghép đôi.'],
                src: 'comment gốc matcher-worker.service.ts ("Transaction lỗi (hết pool, deadlock, mất kết nối)")',
              },
              {
                at: 'for (const { matchType, waitSeconds } of result.matchedPair) {',
                text: ['Realtime và push SAU commit, best-effort: client vẫn có GET /matching/tickets/:id để poll nếu lỡ event.'],
                src: 'comment gốc matcher-worker.service.ts ("Realtime SAU commit — best-effort")',
              },
            ],
          },
          {
            tag: 'WORKER',
            file: MW,
            dedent: true,
            ranges: [fn('private async requeueClaimed(')],
            inline: [
              {
                at: 'const restored = await Promise.allSettled(',
                text: [
                  'Score đọc lúc lấy cửa sổ có thể đã cũ: speed-up hoàn tất SAU lúc claim chỉ ghi được DB (ZADD XX của nó bỏ qua vì vé đang không nằm trong Redis). Trả lại bằng score cũ sẽ xoá mất boost đã trả tiền.',
                  'Bước 1: khôi phục sự hiện diện ngay bằng NX (phòng trùng).',
                ],
                src: 'doc requeueClaimed matcher-worker.service.ts',
              },
              {
                at: 'const rows = await this.dataSource.manager.find(MatchTicket, {',
                text: [
                  'Bước 2: đọc lại priorityBoostMs từ DB và đặt score TUYỆT ĐỐI bằng ZADD XX LT. Giữa lúc đọc DB và lệnh Redis, một speed-up khác có thể hoàn tất cả DB lẫn Redis; XX thuần để lệnh đến muộn ghi đè bằng score cũ hơn.',
                  'Score chỉ có thể GIẢM trong đời ticket (boost chỉ tăng; enqueuedAt và trustPenalty là snapshot lúc tạo), nên LT chặn đúng loại ghi lỗi thời mà vẫn cho mọi lần hạ score hợp lệ qua. Bước này best-effort: DB lỗi thì vé giữ score lúc claim; QueueRepairService quét lại vé sống và refresh score từ DB, và client replay speed-up cùng Idempotency-Key cũng đặt lại score ngay.',
                ],
                src: 'doc requeueClaimed matcher-worker.service.ts (bản local: "QueueRepairService quét lại ticket sống và refresh score từ DB") + test matching.integration.spec.ts "speed-up KHÁC hoàn tất giữa lúc matcher đọc DB…"',
              },
            ],
          },
          { tag: 'WORKER', file: MW, dedent: true, ranges: [fn('private async cleanupShardIfEmpty(')] },
          { tag: 'REDIS', file: MQ, dedent: true, ranges: [fn('async peekWindow(')] },
          { tag: 'REDIS', file: MQ, dedent: true, ranges: [fn('async claimPair(')] },
          {
            tag: 'REDIS',
            file: MQ,
            dedent: true,
            ranges: [fn('async enqueue(')],
            inline: [
              {
                at: "await this.redis.zadd(shard, 'XX', 'LT', score, ticketId);",
                text: ['Redis >= 6.2: XX + LT trong một lệnh nguyên tử: chỉ cập nhật member đang có VÀ chỉ khi score mới NHỎ HƠN score hiện tại.'],
                src: 'doc enqueue matching-queue.port.ts (mode XX_LT)',
              },
            ],
          },
          { tag: 'REDIS', file: MQ, dedent: true, ranges: [fn('async remove(')] },
          {
            tag: 'REDIS',
            file: MQ,
            dedent: true,
            ranges: [{ at: 'const CLAIM_PAIR_SCRIPT = `', to: '^`;$' }],
          },
        ],
      },
      {
        n: '02',
        slug: 'job-matching-queue-repair',
        method: 'JOB',
        short: 'queue repair',
        route: 'QueueRepairService.runOnce (mỗi MATCHING_QUEUE_REPAIR_INTERVAL_MS, một pod duy nhất)',
        name: 'Repair hàng đợi ghép từ DB',
        title:
          'Quét một trang vé queued còn trong hạn theo cursor bền vững (enqueued_at, id), khôi phục vé thiếu trong Redis bằng NX rồi refresh score theo DB bằng XX LT, đánh dấu shard active và đánh thức matcher.',
        flow: '[WORKER] → [POSTGRES] → [REDIS]',
        roles: [
          ['WORKER', 'Cluster-singleton, chạy cả khi chưa có HTTP nào kích hoạt process; mỗi lượt xử lý tối đa MATCHING_QUEUE_REPAIR_BATCH_SIZE vé với 8 lệnh Redis song song, lưu cursor, đánh thức matcher khi có vé được khôi phục.'],
          ['POSTGRES', 'Nguồn sự thật: đọc vé queued còn trong hạn chờ theo keyset (enqueued_at, id) và đọc lại trạng thái trước khi refresh score; cursor nằm ở runtime_job_checkpoints (metadata dùng-được-bỏ, dựng lại được).'],
          ['REDIS', 'Hàng đợi dẫn xuất: NX khôi phục vé còn thiếu, XX LT chỉ hạ score theo boost mới nhất trong DB, đánh dấu lại shard active.'],
        ],
        tables: [
          ['match_tickets', 'vé queued còn trong hạn chờ (MATCHING_QUEUE_MAX_WAIT_SECONDS): id, enqueued_at, boost và trust penalty để tính lại score.'],
          ['runtime_job_checkpoints', 'một dòng cho mỗi job (job_key = matching-queue-repair) giữ cursor JSON {at, id}; mất thì quét lại từ đầu, không ảnh hưởng tính đúng đắn.'],
        ],
        redis: [
          ['matching:queue:{matchType}:{region}:{ageBand}', 'sorted set; NX thêm vé còn thiếu, XX LT chỉ hạ score; member = ticketId.'],
          ['matching:active-shards', 'tập shard đang có vé; repair đánh dấu lại để matcher biết cần duyệt.'],
        ],
        related: [
          ['Matcher tick', 'trang 01: người tiêu thụ hàng đợi; repair đánh thức nó khi khôi phục được vé.'],
          ['Speed-up', 'boost trả tiền nằm ở DB; refresh dùng XX LT để không ghi đè boost mới bằng score cũ (không chép).'],
          ['Định tuyến shard', 'trang 03: khi có nhiều Redis, enqueue đi tới đúng Redis của hàng đợi.'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<number> {', text: 'Một lượt repair: chỉ một lượt chạy trong process tại một thời điểm' },
          { at: 'const [checkpoint] = (await this.dataSource.query(', text: 'Đọc cursor bền vững: pod mới (đổi leader) tiếp tục chỗ cũ, không quay lại hàng đầu' },
          { at: 'const rows = (await this.dataSource.query(', text: 'Lấy một trang vé queued còn trong hạn theo keyset (enqueued_at, id)' },
          { at: 'await this.queue.enqueue(', text: 'NX: khôi phục vé còn thiếu trong Redis, không đụng vé đã có' },
          { at: "'XX_LT',", text: 'Refresh score theo DB bằng XX LT: chỉ hạ score, không ghi đè boost mới bằng score cũ' },
          { at: 'const state = rows.length === batchSize ? rows[rows.length - 1] : null;', text: 'Cursor: trang đầy thì tiếp tục sau hàng cuối, trang chưa đầy thì vòng sau bắt đầu lại' },
          { at: 'if (repaired > 0) this.wakeup.notify();', text: 'Có vé được khôi phục thì đánh thức matcher ngay' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: QR,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'const rows = (await this.dataSource.query(',
                text: ['Chỉ vé queued còn trong hạn chờ tối đa và theo keyset (enqueued_at, id), nên mỗi lượt tốn một lượng bị chặn bởi BATCH_SIZE chứ không tăng theo số vé sống. Thời gian hồi phục sau khi Redis mất dữ liệu vì thế phụ thuộc số vé sống và ngân sách quét.'],
                src: 'docs/services/matching-service.md (QueueRepairService: "Tối đa MATCHING_QUEUE_REPAIR_BATCH_SIZE ticket mỗi MATCHING_QUEUE_REPAIR_INTERVAL_MS ... Thời gian hồi phục phụ thuộc số ticket sống và ngân sách scan")',
              },
              {
                at: 'await this.queue.enqueue(',
                text: ['Redis chỉ là hàng đợi dẫn xuất nên mất dữ liệu (failover, restart) được dựng lại từ DB mà không cần client gửi lại yêu cầu. NX chỉ thêm vé đang thiếu: vé đã có, kể cả vé vừa được speed-up, không bị đụng.'],
                src: 'ADR 0015 (Matching: "bounded, cluster-singleton repair scan restores live tickets with NX and monotone score refresh") + doc QueueRepairService queue-repair.service.ts',
              },
              {
                at: "'XX_LT',",
                text: ['Refresh score theo boost mới nhất trong DB bằng XX LT: boost chỉ tăng nên score chỉ giảm, và LT chặn việc ghi đè một boost đã trả tiền mới hơn bằng score cũ khi repair chạy đồng thời với speed-up.'],
                src: 'comment gốc queue-repair.service.ts ("Monotone refresh cannot overwrite a newer paid boost with an older score") + docs/services/matching-service.md (refresh score XX_LT)',
              },
              {
                at: 'const state = rows.length === batchSize ? rows[rows.length - 1] : null;',
                text: ['Cursor đi tiếp ngay cả khi một Redis lỗi, để các Redis khoẻ vẫn được phục hồi; vé lỗi được thăm lại ở chu kỳ quét sau. Cursor được lưu bền nên đổi leader không làm quét lại từ hàng 1.'],
                src: 'comment gốc queue-repair.service.ts ("Advancing through a failed Redis shard lets healthy shards continue recovering; cursor persistence prevents leader turnover restarting at row 1")',
              },
              {
                at: 'if (repaired > 0) this.wakeup.notify();',
                text: ['Đánh thức matcher thay vì chờ chu kỳ backstop. Repair có thể chạy đồng thời với claim, cancel hay speed-up; điều đó vô hại vì matcher kiểm lại trạng thái trong DB dưới khoá trước khi ghép.'],
                src: 'docs/services/matching-service.md ("DB state recheck vẫn chặn ghép trùng khi repair đồng thời với claim/cancel/speed-up; lease/Redis không thay thế tính đúng đắn trong Postgres")',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: MQ,
            dedent: true,
            ranges: [fn('async enqueue(')],
            inline: [
              {
                at: "await this.redis.zadd(shard, 'XX', 'LT', score, ticketId);",
                text: ['Redis >= 6.2: XX + LT trong một lệnh nguyên tử: chỉ cập nhật member đang có VÀ chỉ khi score mới NHỎ HƠN score hiện tại.'],
                src: 'doc enqueue matching-queue.port.ts (mode XX_LT)',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: `${M}/redis/matching-redis.provider.ts`,
            dedent: true,
            ranges: [top('export function ticketScore(')],
          },
        ],
      },
      {
        n: '03',
        slug: 'queue-sharded-routing',
        method: 'QUEUE',
        short: 'định tuyến shard',
        route: 'ShardedMatchingQueue (khi MATCHING_REDIS_URLS có từ hai Redis trở lên)',
        name: 'Hàng đợi chia shard: định tuyến theo hash',
        title:
          'Mỗi hàng đợi logic được băm (FNV-1a) tới đúng MỘT Redis vật lý nên claim hai vé vẫn nguyên tử; liệt kê shard active gộp từ các Redis còn khoẻ và bỏ mục lỗi thời sau khi đổi topology.',
        flow: '[REDIS] → [REDIS]',
        roles: [
          ['REDIS', 'Bộ chọn Redis theo hash của tên hàng đợi (matchType/region/ageBand); mọi pod phải có cùng danh sách và thứ tự Redis.'],
          ['REDIS', 'Mỗi Redis vật lý giữ trọn một số hàng đợi logic (sorted set và tập active của riêng nó); script claim hai vé chạy trên đúng Redis chứa hàng đợi đó.'],
        ],
        tables: [],
        redis: [
          ['matching:queue:{matchType}:{region}:{ageBand}', 'nằm trọn trên một Redis do hash chọn; không bao giờ tách một hàng đợi sang hai Redis.'],
          ['matching:active-shards', 'mỗi Redis có tập active riêng; matcher gộp các tập này, chỉ nhận mục mà hash hiện tại trỏ đúng Redis đang giữ nó.'],
        ],
        related: [
          ['Matcher tick', 'trang 01: gọi listActiveShards, peekWindow và claimPair qua cùng một cổng hàng đợi (không chép).'],
          ['Đổi topology', 'phải dừng admission và matcher, bỏ hàng đợi dẫn xuất rồi dựng lại từ DB với danh sách mới trên mọi pod: thủ tục vận hành (ADR 0015), không phải code.'],
        ],
        nested: true,
        steps: [
          { at: 'claimPair(...args: Parameters<MatchingQueuePort[\'claimPair\']>) {', text: 'Mọi thao tác trên một hàng đợi đều đi qua cùng một hàm chọn Redis' },
          { at: 'return this.shards[fnv1aHash(key) % this.shards.length];', text: 'Hàng đợi logic → đúng một Redis bằng hash của tên hàng đợi' },
          { at: 'async listActiveShards(): Promise<string[]> {', text: 'Matcher hỏi mọi Redis xem hàng đợi nào đang có vé' },
          { at: 'if (this.shard(key) === this.shards[index]) active.add(key);', text: 'Chỉ nhận mục active nếu hash hiện tại trỏ đúng Redis đang giữ nó' },
          { at: 'if (healthy === 0)', text: 'Chỉ khi KHÔNG Redis nào trả lời mới là lỗi' },
        ],
        items: [
          {
            tag: 'REDIS',
            file: SQ,
            dedent: true,
            ranges: [fn("claimPair(...args"), fn('private shard('), fn('async listActiveShards(')],
            inline: [
              {
                at: 'return this.shards[fnv1aHash(key) % this.shards.length];',
                text: ['Mỗi hàng đợi logic và lệnh claim nguyên tử hai vé của nó phải nằm trên MỘT Redis; hash theo tên hàng đợi nên mọi pod chọn cùng Redis miễn là cùng danh sách có thứ tự. Đổi số hoặc thứ tự Redis là đổi chỗ của hàng đợi, nên cần dừng và dựng lại có phối hợp.'],
                src: 'doc ShardedMatchingQueue sharded-matching-queue.adapter.ts ("Keep each logical queue and its atomic pair claim on one physical Redis instance") + docs/services/matching-service.md (MATCHING_REDIS_URLS) + ADR 0015',
              },
              {
                at: "this.logger.warn({ shard: index }, 'Matching Redis shard unavailable');",
                text: ['Một Redis lỗi không ngăn matcher đọc hàng đợi active của các Redis còn khoẻ; vé trên Redis lỗi được thăm lại ở vòng quét repair kế tiếp.'],
                src: 'docs/services/matching-service.md ("Một Redis lỗi không ngăn matcher đọc active queues của các shard còn khỏe ... Lỗi một Redis được retry ở vòng scan kế tiếp")',
              },
              {
                at: 'if (this.shard(key) === this.shards[index]) active.add(key);',
                text: ['Mục active cũ còn sót lại sau khi đổi topology không bao giờ được phép chuyển hướng một hàng đợi: chỉ nhận mục khi hash hiện tại trỏ đúng Redis đang giữ nó.'],
                src: 'comment gốc sharded-matching-queue.adapter.ts ("Old active-set entries must never redirect a queue after a coordinated topology change")',
              },
              {
                at: 'if (healthy === 0)',
                text: ['Chỉ khi không Redis nào trả lời thì mới ném lỗi (matcher bỏ tick); còn ít nhất một Redis khoẻ thì phục vụ phần còn lại.'],
                src: 'listActiveShards sharded-matching-queue.adapter.ts ("All Matching Redis shards are unavailable") + docs/services/matching-service.md',
              },
            ],
          },
        ],
      },
    ],
  },
];
