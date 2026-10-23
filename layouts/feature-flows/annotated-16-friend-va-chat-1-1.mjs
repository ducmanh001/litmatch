// Friend và Chat 1-1: CHỈ endpoint khó, có cơ chế kỹ thuật thật (idempotency, streak khóa dòng, realtime, thông báo). Endpoint đơn giản không viết.
// Một file, luồng đi liền mạch từ trên xuống theo thứ tự chạy; mỗi đoạn có nhãn tầng (tô màu ở bản HTML).
// Hàm được chép NGUYÊN VẸN (không cắt giữa hàm). Comment chỉ trả lời "vì sao" ở chỗ logic khó, đặt ngay cạnh dòng code;
// comment ở chỗ luồng chuyển sang tầng khác (Postgres, Redis...) mở đầu bằng nhãn tầng đó.
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const F = 'apps/core-api/src/modules/friend';
const FC = `${F}/friend.controller.ts`;
const FS = `${F}/friend.service.ts`;
const NF = 'apps/core-api/src/modules/friend/services/friend-message-notifier.service.ts';
const WG = 'apps/core-api/src/common/redis/redis-window-gate.adapter.ts';
const CS = `${F}/services/conversation.service.ts`;
const SS = `${F}/services/streak.service.ts`;
const MIG = 'apps/core-api/src/database/migrations/1752600000000-friend-chat.ts';
const END_FN = '^  }$';
const END_SQL = '^    `\\);$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
// Câu lệnh SQL trong migration: lấy cả dòng `await queryRunner.query(` ở ngay trên và dòng đóng "`);"
const sql = (anchor) => ({ at: anchor, to: END_SQL, pad: [1, 0] });

export const annotatedFeatures = [
  {
    id: '16-friend-va-chat-1-1',
    short: 'Friend và Chat 1-1',
    title: 'Friend và Chat 1-1',
    summary: 'Chat 1-1 bền vững giữa hai người đã là bạn hoặc đã mở chat từ hồ sơ: gửi tin nhắn, streak, realtime và thông báo.',
    arch: 'hot-paths',
    diagramAnchor: '16-friend-va-chat-1-1',
    endpoints: [
      {
        n: '01',
        slug: 'post-send-message',
        method: 'POST',
        short: '/conversations/:id/messages',
        route: '/api/v1/conversations/:id/messages',
        name: 'Gửi tin nhắn chat 1-1',
        title: 'Gửi tin nhắn idempotent, cập nhật streak ngày, phát realtime cho 2 người và thông báo cho người nhận.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [REDIS]',
        roles: [
          ['CONTROLLER', 'Nhận tin nhắn kèm Idempotency-Key bắt buộc; nếu có imageAssetId thì kiểm quyền sở hữu ảnh rồi đổi thành URL, HTTP chỉ tạo được attachment kiểu ảnh.'],
          ['SERVICE', 'Kiểm tra user thuộc hội thoại và không bị block 2 chiều, ghi tin nhắn idempotent, cập nhật streak, phát realtime cho 2 người, rồi tạo thông báo cho người nhận (trừ khi đã mute).'],
          ['POSTGRES', 'Unique idempotency_key chặn nhân đôi tin nhắn; seq do DB cấp cho cursor; streak cập nhật trong transaction riêng, khóa dòng FOR UPDATE.'],
          ['REDIS', 'Pub/sub báo friend.message (và friend.streak.increased khi chạm mốc) cho cả 2 người.'],
        ],
        tables: [
          ['conversations', 'hội thoại 1-1 của một cặp (low < high), unique theo cặp; last_message_at cập nhật sau mỗi tin để sắp xếp danh sách chat.'],
          ['messages', 'tin nhắn chỉ thêm: nội dung, attachment, idempotency_key unique, seq tăng dần.'],
          ['conversation_streaks', 'chuỗi ngày cả 2 cùng nhắn của hội thoại; dòng bị khóa FOR UPDATE khi cập nhật.'],
          ['conversation_member_states', 'chỉ đọc: người nhận có đang mute hội thoại hay không.'],
          ['blocks', 'chỉ đọc (qua Safety): dòng block mới nhất của mỗi chiều cho biết đang block hay đã bỏ block.'],
          ['notifications', 'thông báo friend_message cho người nhận, tạo ở transaction riêng và best-effort.'],
        ],
        redis: [
          ['realtime:user:{userId}', 'kênh pub/sub theo người nhận; core-api phát friend.message và friend.streak.increased, signaling-gateway chuyển xuống socket.'],
        ],
        related: [
          ['Safety', 'isBlocked: kiểm block theo từng chiều; bị block trả cùng lỗi 404 với "không phải thành viên".'],
          ['Media', 'resolveImageUrl: kiểm ảnh thuộc user và đã upload, trả URL để làm attachment.'],
          ['Notification', 'create tạo thông báo friend_message, sendPush gửi push; cả hai best-effort sau khi tin đã lưu.'],
          ['signaling-gateway', 'subscribe kênh realtime của user, đẩy friend.message xuống client.'],
        ],
        nested: true, // lồng nhau tự động theo quan hệ gọi hàm; `skip` (hàm cơ bản không bung) và `steps` (đánh số bước) khai bên dưới
        skip: ['getConversationForMember'], // find-or-throw + kiểm thành viên: chỉ giữ dòng gọi
        steps: [
          { at: "@Post('conversations/:id/messages')", text: 'Nhận request (user từ JWT, id hội thoại từ URL, Idempotency-Key)' },
          { at: 'const imageUrl = dto.imageAssetId', text: 'Có ảnh đính kèm thì kiểm quyền sở hữu và đổi thành URL' },
          { at: 'const conversation = await this.getConversationForMember(', text: 'Kiểm user thuộc hội thoại' },
          { at: 'const partnerId =', text: 'Kiểm block 2 chiều, độ dài tin nhắn, tin rỗng' },
          { at: 'const prefixedKey = messageIdempotencyKey(senderUserId, idempotencyKey);', text: 'Lưu tin nhắn idempotent (retry trả lại tin cũ, khác nội dung thì 409)' },
          { at: 'const { milestoneHit } = await this.streakService.recordActivity(', text: 'Cập nhật streak sau khi tin đã lưu, trong transaction riêng' },
          { at: 'await manager.query(', text: 'Tạo dòng streak nếu chưa có, khóa dòng FOR UPDATE' },
          { at: 'if (bothActiveToday && row.lastConfirmedDate !== today) {', text: 'Cả 2 đã nhắn hôm nay thì tăng streak 1 lần/ngày, cứu lỡ 1 ngày' },
          { at: 'if (milestoneHit !== null) {', text: 'Chạm mốc streak thì phát friend.streak.increased qua Redis' },
          { at: 'const envelope: RealtimeEnvelope<FriendMessageEventData> = {', text: 'Phát friend.message cho cả 2 người qua Redis (sau khi lưu)' },
          { at: 'await this.messageNotifier.notify({', text: 'Thông báo cho người nhận (best-effort, transaction riêng): gộp theo cửa sổ và tôn trọng mute' },
          { at: 'if (!(await this.gate.tryAcquire(gateKey, windowSeconds))) {', text: 'Cổng gộp trên Redis: chỉ tin ĐẦU TIÊN của (người nhận, hội thoại) trong cửa sổ được thông báo' },
          { at: 'const state = await this.memberStateRepo.findOne({', text: 'Người nhận mute hội thoại thì bỏ qua cả in-app lẫn push' },
          { at: 'const notification = await this.notificationService.create({', text: 'Tạo notification (insert) rồi gửi push' },
          { at: 'return MessageDto.from(message);', text: 'Controller trả tin nhắn vừa lưu' },
        ],
        items: [
          // 1) Controller: ảnh đính kèm chỉ đi qua cổng kiểm tra
          {
            tag: 'CONTROLLER',
            file: FC,
            dedent: true,
            ranges: [fn("@Post('conversations/:id/messages')")],
            inline: [
              {
                at: 'imageUrl !== undefined',
                text: ['HTTP chỉ tạo được attachment kiểu ảnh, từ asset đã được xác thực. Các kind khác (vd story_reply) chỉ đi qua DI giữa module, client không tự gắn tùy ý.'],
                src: 'comment gốc friend.controller.ts L221-222 + doc friend.service.ts L327-329',
              },
            ],
          },

          // 2) Service: quyền, block, ghi tin, streak, realtime, thông báo
          {
            tag: 'SERVICE',
            file: FS,
            dedent: true,
            ranges: [fn('async sendMessage('), fn('private async getConversationForMember(')],
            inline: [
              {
                at: 'const partnerId =',
                text: ['Block kiểm cả 2 chiều và trả CÙNG mã lỗi 404 với "không phải thành viên", để không ai biết ai block ai qua mã lỗi.'],
                src: 'doc gốc friend.service.ts L323-326',
              },
              {
                at: 'const { milestoneHit } = await this.streakService.recordActivity(',
                text: ['Streak chạy SAU khi tin đã lưu, trong transaction RIÊNG: nếu chung transaction với insert tin thì lần dính unique của retry làm cả transaction bị abort. Replay gọi lại cũng không tăng streak lần 2.'],
                src: 'comment gốc friend.service.ts L383-385 + docs/services/streak-service.md mục 2',
              },
              {
                at: 'this.logger.error(',
                text: ['Streak là phụ: lỗi tính streak chỉ ghi log, không rollback tin đã gửi.'],
                src: 'comment gốc friend.service.ts L404',
              },
              {
                at: 'await Promise.all(',
                text: ['[REDIS] Phát friend.message cho cả 2 thành viên qua kênh realtime:user:{id}, SAU khi lưu. Best-effort, không dùng outbox: client vẫn poll được GET /conversations/:id/messages.'],
                src: 'docs/services/friend-service.md mục 5 + doc common/realtime/publish-realtime.ts',
              },
              {
                at: 'await this.messageNotifier.notify({',
                text: ['Thông báo chạy transaction riêng và best-effort: tin đã lưu xong nên lỗi ở đây không được làm hỏng luồng gửi. Gộp theo cửa sổ và tôn trọng mute nằm trong FriendMessageNotifier.'],
                src: 'comment gốc friend.service.ts (đoạn "In-app notification + push cho người nhận") + ADR 0013',
              },
            ],
          },

          // 2b) Thông báo: gộp theo cửa sổ (ADR 0013) — ở 3.000 tin/giây mỗi tin một notification là 3.000 insert/giây
          {
            tag: 'SERVICE',
            file: NF,
            dedent: true,
            ranges: [fn('async notify('), fn('private async releaseGate(')],
            inline: [
              {
                at: 'if (!(await this.gate.tryAcquire(gateKey, windowSeconds))) {',
                text: [
                  'Chỉ tin ĐẦU TIÊN của (người nhận, hội thoại) trong mỗi cửa sổ tạo notification + push; tin sau vẫn được lưu, phát realtime và tính unread. Ở 3.000 tin/giây đây là khác biệt giữa 3.000 insert notification/giây và ~83 (mô hình, ADR 0013).',
                  'Không dựa vào "đang online" (presence trễ tới một lease, có thể nuốt push của app nền) hay "còn notification chưa đọc" (đọc hội thoại không đánh dấu notification đã đọc nên sẽ im lặng vĩnh viễn).',
                ],
                src: 'doc class FriendMessageNotifier (friend-message-notifier.service.ts) + ADR 0013',
              },
              {
                at: "this.observe('gate_error');",
                text: ['Fail-open: lỗi Redis không được nuốt thông báo — quay về hành vi cũ (mỗi tin một thông báo). Cổng chỉ là trạng thái tạm để giảm tải, không phải nguồn sự thật.'],
                src: 'comment gốc friend-message-notifier.service.ts ("Fail-open") + doc window-gate.port.ts',
              },
              {
                at: 'if (acquired && !notified) await this.releaseGate(gateKey);',
                text: ['Đã chiếm cổng mà cuối cùng không tạo được thông báo (mute hoặc lỗi) thì mở lại cổng, để tin kế tiếp trong cửa sổ không bị nuốt.'],
                src: 'doc notify() friend-message-notifier.service.ts ("Nếu đã chiếm cổng mà cuối cùng không tạo được thông báo…")',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: WG,
            dedent: true,
            ranges: [fn('async tryAcquire('), fn('async release(')],
            inline: [
              {
                at: "return (await this.redis.set(key, '1', 'EX', windowSeconds, 'NX')) === 'OK';",
                text: ['SET key 1 EX window NX: một lệnh nguyên tử và tự hết hạn nên không cần dọn; hai tin đồng thời chỉ một tin thắng.'],
                src: 'doc class RedisWindowGateAdapter (redis-window-gate.adapter.ts)',
              },
            ],
          },

          // 3) Ghi tin nhắn idempotent
          {
            tag: 'SERVICE',
            file: CS,
            dedent: true,
            ranges: [fn('async sendMessage(')],
            inline: [
              {
                at: 'const prefixedKey = messageIdempotencyKey(senderUserId, idempotencyKey);',
                text: ['[POSTGRES] Key của client được gắn prefix friend:msg:{userId}: unique ở DB (xem bên dưới), retry không nhân đôi tin nhắn.'],
                src: 'message.entity.ts L49 (doc idempotencyKey)',
              },
              {
                at: 'if (!isUniqueViolation(err)) throw err;',
                text: ['Retry sau timeout mạng: dính unique thì đọc lại. Cùng hội thoại và cùng nội dung thì trả tin cũ (replay); khác thì 409.'],
                src: 'suy ra từ code: nhánh catch so existing.conversationId và content; comment gốc conversation.service.ts L181',
              },
              {
                at: 'await this.conversationRepo.update(',
                text: ['last_message_at chỉ để sắp xếp danh sách chat, không phải nguồn sự thật nên không cần chung transaction.'],
                src: 'comment gốc conversation.service.ts L189',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG,
            dedent: true,
            ranges: [sql('CREATE TABLE messages (')],
            inline: [
              {
                at: 'await queryRunner.query(`',
                text: ['Unique idempotency_key là chốt chặn thật chống nhân đôi tin nhắn. seq bigint IDENTITY là thứ tự do DB cấp cho cursor, tránh trùng hoặc mất dòng khi phân trang theo created_at.'],
                src: 'comment migration 1752600000000-friend-chat.ts + message.entity.ts L34-35',
              },
            ],
          },

          // 4) Streak: khóa dòng, tăng đúng 1 lần mỗi ngày UTC
          {
            tag: 'SERVICE',
            file: SS,
            dedent: true,
            ranges: [fn('async recordActivity(')],
            inline: [
              {
                at: 'await manager.query(',
                text: ['[POSTGRES] Tạo dòng streak khi cần bằng ON CONFLICT DO NOTHING rồi khóa FOR UPDATE: 2 bên nhắn gần như cùng lúc vẫn tăng streak đúng 1 lần.'],
                src: 'doc class streak.service.ts L30-36 + docs/services/streak-service.md mục 2',
              },
              {
                at: 'if (bothActiveToday && row.lastConfirmedDate !== today) {',
                text: ['Chỉ tăng khi cả 2 đã nhắn hôm nay và hôm nay chưa xác nhận, nên gọi lại trong cùng ngày không tăng lần 2. Ngày tính theo UTC của server, không theo múi giờ client.'],
                src: 'doc recordActivity streak.service.ts L48-50 + docs/services/streak-service.md mục 3',
              },
              {
                at: 'row.currentStreak += 1;',
                nth: 1,
                text: ['Lỡ đúng 1 ngày vẫn được cứu: vẫn +1 chứ không reset, ghi lại ngày được cứu. Lỡ từ 2 ngày trở lên thì reset về 1.'],
                src: 'comment gốc streak.service.ts L85 + docs/services/streak-service.md mục 3',
              },
            ],
          },
        ],
      },
    ],
  },
];
