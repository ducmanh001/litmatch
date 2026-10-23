// Broadcast thông báo ở 10M: gửi cho hàng triệu người không thể nằm trong một request. POST chỉ XẾP HÀNG (202, Idempotency-Key),
// một job nền chạy theo lô keyset, đẩy cursor cùng transaction với thông báo nên chạy lại/resume không gửi đôi.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-annotated.mjs yêu cầu có.
const A = 'apps/core-api/src/modules/admin';
const AC = `${A}/admin.controller.ts`;
const AS = `${A}/admin.service.ts`;
const BJ = `${A}/jobs/broadcast-dispatch.job.ts`;
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '33-admin-broadcast',
    short: 'Admin broadcast',
    title: 'Admin broadcast: xếp hàng rồi gửi nền theo lô',
    summary:
      'Gửi thông báo cho 10 triệu người = 10 triệu insert notification + 10 triệu lần push. Request chỉ ghi một dòng "queued" (idempotent); một job nền xử lý từng lô 500 người theo keyset, có thể huỷ và resume.',
    arch: 'batch-jobs',
    diagramAnchor: '22-support-va-admin-operations',
    endpoints: [
      {
        n: '01',
        slug: 'post-broadcast',
        method: 'POST',
        short: '/admin/notifications/broadcast',
        route: '/api/v1/admin/notifications/broadcast',
        name: 'Xếp hàng một broadcast',
        title:
          'Ghi một dòng broadcast ở trạng thái queued kèm audit (202); Idempotency-Key làm bấm hai lần chỉ tạo một broadcast.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', 'Chỉ admin có quyền ManageConfig; nhận title/body/audience + header Idempotency-Key bắt buộc; trả 202 kèm broadcastId và trạng thái.'],
          ['SERVICE', 'Đọc theo (người gửi, key) để replay; nếu chưa có thì ghi dòng queued + audit cùng transaction; đua đồng thời cùng key thì ràng buộc unique quyết định.'],
          ['POSTGRES', 'notification_broadcasts có unique một phần (actor_user_id, idempotency_key); audit ghi cùng transaction.'],
        ],
        tables: [
          ['notification_broadcasts', 'một dòng cho mỗi lần broadcast: status queued → running → completed/failed/cancelled, cursor_user_id, recipient_count; unique (actor_user_id, idempotency_key).'],
          ['admin_audit_logs', 'bản ghi notification.broadcast.queued, ghi cùng transaction.'],
        ],
        related: [
          ['Job gửi nền', 'trang kế tiếp: xử lý từng lô, đẩy cursor cùng transaction với thông báo.'],
          ['Huỷ broadcast', 'POST .../:id/cancel: UPDATE có điều kiện status IN (queued, running); lô đã commit không thu hồi được (không chép).'],
        ],
        nested: true,
        steps: [
          { at: "@Post('notifications/broadcast')", text: 'Nhận yêu cầu broadcast (chỉ admin, Idempotency-Key bắt buộc); trả 202 vì chỉ xếp hàng' },
          { at: 'const existing = await this.findBroadcastByKey(actorUserId, idempotencyKey);', text: 'Cùng (người gửi, key) đã có broadcast thì replay thay vì tạo mới' },
          { at: 'const broadcast = await repo.save(', text: 'Ghi MỘT dòng queued: request không gửi gì cả' },
          { at: 'await this.auditLogService.record(', text: 'Ghi audit cùng transaction' },
          { at: 'if (!isUniqueViolation(error)) throw error;', text: 'Hai request đồng thời cùng key: unique chặn bên thua, bên thua đọc lại bản của bên thắng' },
          { at: 'throw new DomainException(', in: 'replayBroadcast', text: 'Cùng key nhưng khác nội dung thì 409 (key đã dùng cho broadcast khác)' },
        ],
        items: [
          { tag: 'CONTROLLER', file: AC, dedent: true, ranges: [fn("@Post('notifications/broadcast')")] },
          {
            tag: 'SERVICE',
            file: AS,
            dedent: true,
            ranges: [fn('async broadcastNotification(')],
            inline: [
              {
                at: 'const broadcast = await repo.save(',
                text: ['Trước đây POST gửi cho mọi người ngay trong request. Với hàng triệu người nhận đó là một request giữ kết nối và transaction hàng giờ; nay request chỉ ghi một dòng và job nền gửi dần (xem trang kế tiếp).'],
                src: 'docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md C16 + doc broadcastNotification admin.service.ts',
              },
              {
                at: 'if (!isUniqueViolation(error)) throw error;',
                text: ['[POSTGRES] Unique một phần (actor_user_id, idempotency_key) là chốt thật: kiểm tra "đã có chưa" ở trên chỉ là đường nhanh, hai request cùng key đồng thời vẫn chỉ tạo một broadcast.'],
                src: 'migration 1758600000000-broadcast-idempotency-cancel.ts + plan C20',
              },
            ],
          },
          { tag: 'SERVICE', file: AS, dedent: true, ranges: [fn('private findBroadcastByKey(')] },
          { tag: 'SERVICE', file: AS, dedent: true, ranges: [fn('private replayBroadcast(')] },
        ],
      },
      {
        n: '02',
        slug: 'job-broadcast-dispatch-tick',
        method: 'JOB',
        short: 'broadcast tick',
        route: 'BroadcastDispatchJob.runOnce (mỗi ADMIN_BROADCAST_JOB_INTERVAL_MS)',
        name: 'Job gửi broadcast theo lô',
        title:
          'Nhặt broadcast queued/running cũ nhất, đọc một trang user theo keyset, tạo thông báo và đẩy cursor trong CÙNG transaction, rồi push sau commit.',
        flow: '[WORKER] → [POSTGRES]',
        roles: [
          ['WORKER', 'Mỗi tick xử lý tối đa vài lô; lỗi một lô chỉ tăng failure_count, quá ngưỡng thì failed; push sau commit với số lời gọi đồng thời có trần.'],
          ['POSTGRES', 'Khoá dòng broadcast và kiểm cursor còn đúng; tạo thông báo hàng loạt + đẩy cursor và recipient_count trong một transaction.'],
        ],
        tables: [
          ['notification_broadcasts', 'cursor_user_id (keyset theo users.id), recipient_count, failure_count, last_error.'],
          ['notifications', 'một thông báo cho mỗi người nhận trong lô, tạo trong cùng transaction với cursor.'],
          ['users', 'đọc một trang id user đang active (keyset theo id, không OFFSET) tới thời điểm tạo broadcast.'],
        ],
        related: [
          ['NotificationService', 'createBroadcastWithManager (insert hàng loạt) và sendPush (best-effort, không throw) — không chép.'],
          ['Push theo người nhận', 'push vẫn gửi từng người; cần nhà cung cấp hỗ trợ topic/batch để giảm tiếp (chưa làm).'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<number> {', text: 'Một tick: xử lý tối đa ADMIN_BROADCAST_MAX_BATCHES_PER_TICK lô' },
          { at: 'const broadcast = await this.nextOpenBroadcast();', text: 'Lấy broadcast queued/running cũ nhất' },
          { at: 'const advanced = await this.processBatch(broadcast, batchSize);', text: 'Xử lý một lô (mặc định 500 người)' },
          { at: 'const userIds = await this.userService.listActiveUserIdsPage({', text: 'Đọc một trang user theo keyset (id lớn hơn cursor), không OFFSET' },
          { at: 'const recipientIds = await this.filterAudience(broadcast.audience, userIds);', text: 'Lọc theo audience (tất cả / VIP / không VIP)' },
          { at: 'const [locked] = await manager.query<Array<{ id: string }>>(', text: 'Khoá dòng broadcast và kiểm cursor còn đúng (runner khác đẩy đi trước thì bỏ lô này)' },
          { at: 'const notifications =', text: 'Tạo thông báo hàng loạt cho lô này' },
          { at: 'const [rows] = await manager.query<', text: 'Đẩy cursor và cộng recipient_count TRONG CÙNG transaction với thông báo' },
          { at: 'await this.pushAll(created);', text: 'Push SAU commit với số lời gọi đồng thời có trần' },
          { at: 'await this.recordFailure(broadcast, error);', text: 'Lỗi một lô: tăng failure_count, quá ngưỡng thì failed; cursor không mất nên tick sau thử lại' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: BJ,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'if (!advanced) break;',
                text: ['Runner khác đã đẩy cursor đi trước: nhường tick sau đọc lại trạng thái mới, không ghi gì.'],
                src: 'comment gốc broadcast-dispatch.job.ts',
              },
            ],
          },
          { tag: 'WORKER', file: BJ, dedent: true, ranges: [fn('private nextOpenBroadcast(')] },
          {
            tag: 'WORKER',
            file: BJ,
            dedent: true,
            ranges: [fn('private async processBatch(')],
            inline: [
              {
                at: 'const done = userIds.length < batchSize;',
                text: ['Trang ngắn hơn lô nghĩa là đã hết user: hoàn tất ngay trong cùng transaction, khỏi tốn thêm một tick rỗng.'],
                src: 'comment gốc broadcast-dispatch.job.ts',
              },
              {
                at: 'const [locked] = await manager.query<Array<{ id: string }>>(',
                text: ['[POSTGRES] Khoá dòng broadcast và kiểm cursor ngay trong transaction (READ COMMITTED): hai pod cùng nhặt một broadcast thì chỉ một bên ghi được lô này, bên kia thấy cursor đã đổi và bỏ qua; huỷ broadcast cũng thấy ngay ở đây.'],
                src: 'plan C16 + test admin.integration.spec.ts',
              },
              {
                at: 'const [rows] = await manager.query<',
                text: ['Thông báo và cursor cùng một transaction: không có trạng thái "đã tạo thông báo mà cursor chưa đi" hay ngược lại, nên crash giữa chừng rồi resume không gửi đôi và không bỏ sót (in-app đúng đúng một lần).'],
                src: 'plan C16 ("cursor + recipient_count trong CÙNG transaction với lô thông báo")',
              },
            ],
          },
          { tag: 'WORKER', file: BJ, dedent: true, ranges: [fn('private async filterAudience(')] },
          {
            tag: 'WORKER',
            file: BJ,
            dedent: true,
            ranges: [fn('private async pushAll(')],
            inline: [
              {
                at: 'const worker = async (): Promise<void> => {',
                text: ['sendPush không bao giờ throw (best-effort) nên chỉ cần giới hạn số lời gọi đồng thời tới nhà cung cấp. Push vẫn đi từng người nhận: ở 10 triệu người cần topic/batch của nhà cung cấp (chưa làm).'],
                src: 'doc pushAll broadcast-dispatch.job.ts + plan § 7 (push theo từng người)',
              },
            ],
          },
          { tag: 'WORKER', file: BJ, dedent: true, ranges: [fn('private async recordFailure(')] },
        ],
      },
      {
        n: '03',
        slug: 'post-broadcast-cancel',
        method: 'POST',
        short: '/admin/notifications/broadcast/:id/cancel',
        route: '/api/v1/admin/notifications/broadcast/:id/cancel',
        name: 'Huỷ một broadcast đang xếp hàng hoặc đang gửi',
        title:
          'Một UPDATE có điều kiện đổi queued/running thành cancelled và là chốt chặn nguyên tử; audit chỉ ghi khi thật sự chuyển trạng thái nên huỷ lặp là idempotent; lô đã commit không thu hồi được.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', 'Chỉ admin có quyền ManageConfig; trả lại trạng thái hiện tại của broadcast.'],
          ['SERVICE', 'Một transaction: UPDATE có điều kiện, ghi audit khi có chuyển trạng thái, đọc lại dòng và phân biệt đã huỷ trước đó (trả nguyên) với đã hoàn tất/thất bại (409).'],
          ['POSTGRES', 'UPDATE … WHERE status IN (queued, running) RETURNING là một câu duy nhất, nên huỷ và job dispatch (khoá dòng trước mỗi lô) tuần tự hoá trên cùng hàng.'],
        ],
        tables: [
          ['notification_broadcasts', 'dòng broadcast: status queued → running → completed / failed / cancelled; job chỉ nhặt queued và running.'],
          ['audit_logs', 'một bản ghi notification.broadcast.cancelled cùng transaction, chỉ khi huỷ thật.'],
        ],
        related: [
          ['Job dispatch', 'trang 02: khoá dòng broadcast trước khi ghi mỗi lô nên một lô đang chạy dở hoàn tất rồi dừng (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async cancelBroadcast(', text: 'Endpoint huỷ broadcast (chỉ admin)' },
          { at: 'return this.dataSource.transaction(async (manager) => {', text: 'Một transaction: chuyển trạng thái, ghi audit, đọc lại' },
          { at: 'const [cancelled] = await manager.query<', text: 'UPDATE có điều kiện: chỉ queued hoặc running mới huỷ được' },
          { at: 'if (cancelled.length > 0) {', text: 'Chỉ ghi audit khi thật sự chuyển trạng thái' },
          { at: 'cancelled.length === 0 &&', text: 'Không chuyển được: đã cancelled thì trả nguyên, đã completed/failed thì 409' },
        ],
        items: [
          { tag: 'CONTROLLER', file: AC, dedent: true, ranges: [fn('async cancelBroadcast(')] },
          {
            tag: 'SERVICE',
            file: AS,
            dedent: true,
            ranges: [fn('async cancelBroadcast(')],
            inline: [
              {
                at: 'const [cancelled] = await manager.query<',
                text: ['Các lô ĐÃ commit không thu hồi được (thông báo đã tới người dùng); phần còn lại ngừng ngay vì job chỉ nhặt broadcast queued/running và khoá dòng trước khi ghi mỗi lô, nên một lô đang chạy dở hoàn tất rồi dừng. UPDATE … RETURNING qua manager.query trả cặp [hàng, số hàng].'],
                src: 'doc cancelBroadcast admin.service.ts ("các lô ĐÃ commit không thu hồi được ... một lô đang chạy dở hoàn tất rồi dừng") + comment gốc ("UPDATE ... RETURNING qua manager.query trả [rows, rowCount]")',
              },
              {
                at: 'if (cancelled.length > 0) {',
                text: ['Huỷ lại broadcast đã huỷ trả nguyên trạng thái và không ghi audit lần hai: audit chỉ ghi khi chính câu UPDATE này làm chuyển trạng thái.'],
                src: 'doc cancelBroadcast admin.service.ts ("Idempotent: huỷ lại broadcast đã huỷ trả lại nguyên trạng thái, không ghi audit lần hai")',
              },
              {
                at: 'cancelled.length === 0 &&',
                text: ['Broadcast đã completed hoặc failed thì không còn gì để huỷ: 409 thay vì giả vờ thành công.'],
                src: 'doc cancelBroadcast admin.service.ts ("broadcast đã completed/failed thì 409") + AdminErrors.BROADCAST_NOT_CANCELLABLE',
              },
            ],
          },
        ],
      },
    ],
  },
];
