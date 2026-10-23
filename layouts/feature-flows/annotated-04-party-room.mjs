// Party Room ở 10M: bình luận trong phòng đông người không được xếp hàng sau một khoá hàng duy nhất của phòng.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-10m.mjs yêu cầu có.
const P = 'apps/core-api/src/modules/party-room';
const PC = `${P}/party-room.controller.ts`;
const PS = `${P}/party-room.service.ts`;
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '04-party-room',
    short: 'Party Room',
    title: 'Party Room: bình luận không xếp hàng sau khoá phòng',
    summary:
      'Phòng đông người có rất nhiều bình luận. Nếu mỗi bình luận khoá FOR UPDATE hàng của phòng thì mọi bình luận xếp hàng nối đuôi nhau. Bình luận chỉ cần giữ FOR SHARE: chúng chạy song song với nhau, còn join, leave, đổi role và đóng phòng (FOR UPDATE) vẫn chờ các bình luận đang chạy xong.',
    arch: 'hot-paths',
    diagramAnchor: '04-party-room',
    endpoints: [
      {
        n: '01',
        slug: 'post-comment',
        method: 'POST',
        short: '/party/rooms/:id/comments',
        route: '/api/v1/party/rooms/:id/comments',
        name: 'Gửi bình luận trong phòng',
        title:
          'Giữ FOR SHARE trên hàng phòng, kiểm membership dưới khoá, chèn bình luận append-only có idempotency, rồi phát realtime cho các thành viên SAU commit.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES] → [REDIS]',
        roles: [
          ['CONTROLLER', 'Nhận bình luận kèm header Idempotency-Key, giới hạn 60 bình luận mỗi phút cho mỗi user; user lấy từ JWT, phòng từ URL.'],
          ['SERVICE', 'Kiểm độ dài, mở một transaction ngắn, gắn khoá share lên phòng, kiểm membership rồi chèn; replay cùng khoá trả bình luận cũ; phát realtime sau commit.'],
          ['POSTGRES', 'Hàng phòng bị khoá FOR SHARE (bình luận) hoặc FOR UPDATE (đổi state); bình luận append-only với unique idempotency_key.'],
          ['REDIS', 'Phát sự kiện tới kênh riêng của từng thành viên; best-effort, sau commit.'],
        ],
        tables: [
          ['party_rooms', 'hàng của phòng: khoá FOR SHARE khi gửi bình luận, FOR UPDATE khi join/leave/đổi role/đóng phòng.'],
          ['party_room_members', 'thành viên còn trong phòng (chưa rời, chưa disconnect): được kiểm dưới khoá; fanout chỉ đọc userId.'],
          ['party_room_comments', 'append-only; unique idempotency_key và seq tăng dần dùng để phân trang.'],
        ],
        redis: [
          ['realtime:user:{userId}', 'kênh pub/sub của từng thành viên; gateway chỉ SUBSCRIBE kênh của user đang có socket trên pod.'],
        ],
        related: [
          ['Join / leave / đổi role', 'giữ FOR UPDATE nên chờ các bình luận đang chạy xong (không chép).'],
          ['Realtime gateway', 'nhận event từ Redis và đẩy tới socket của user (xem trang gateway).'],
        ],
        nested: true,
        steps: [
          { at: 'async createComment(', text: 'Endpoint gửi bình luận (Idempotency-Key bắt buộc, 60 lần mỗi phút)' },
          { at: 'const content = dto.content.trim();', text: 'Kiểm độ dài nội dung trước khi mở transaction' },
          { at: 'const comment = await this.dataSource.transaction(async (manager) => {', text: 'Một transaction ngắn: khoá phòng, kiểm membership, chèn bình luận' },
          { at: "mode: mode === 'read' ? 'pessimistic_read' : 'pessimistic_write',", text: 'Bình luận giữ FOR SHARE; thao tác đổi state giữ FOR UPDATE' },
          { at: 'const membership = await manager.findOneBy(PartyRoomMember, {', text: 'Membership được kiểm DƯỚI khoá phòng' },
          { at: 'return manager.save(', text: 'Chèn bình luận append-only với idempotency_key duy nhất' },
          { at: 'await this.publishToRoomMembers(roomId, {', text: 'Phát realtime cho thành viên SAU commit' },
          { at: 'const members = await this.memberRepo.find({', text: 'Fanout chỉ đọc userId của thành viên còn trong phòng' },
          { at: 'const existing = await this.commentRepo.findOneBy({', text: 'Replay cùng Idempotency-Key: trả bình luận cũ, không bắn lại sự kiện' },
        ],
        items: [
          { tag: 'CONTROLLER', file: PC, dedent: true, ranges: [fn('async createComment(')] },
          {
            tag: 'SERVICE',
            file: PS,
            dedent: true,
            ranges: [fn('async sendComment(')],
            inline: [
              {
                at: "await this.lockActiveRoom(manager, roomId, 'read');",
                text: ['Bình luận chỉ cần phòng còn active và membership không đổi trong lúc kiểm tra và chèn, nên chỉ giữ FOR SHARE: nhiều bình luận cùng phòng chạy song song thay vì xếp hàng trên một khoá hàng cho mọi bình luận.'],
                src: 'doc lockActiveRoom party-room.service.ts ("read (FOR SHARE): gửi bình luận chỉ cần phòng còn active và membership KHÔNG đổi trong lúc kiểm tra + insert")',
              },
              {
                at: 'const membership = await manager.findOneBy(PartyRoomMember, {',
                text: ['Membership được kiểm dưới khoá phòng để REST leave và send đồng thời có thứ tự xác định: không có bình luận nào từ người vừa rời.'],
                src: 'doc sendComment party-room.service.ts ("membership được kiểm tra dưới lock phòng để REST leave và send đồng thời có thứ tự xác định")',
              },
              {
                at: 'await this.publishToRoomMembers(roomId, {',
                text: ['Sự kiện chỉ bắn SAU khi transaction commit và replay không bắn lại: client không bao giờ thấy một bình luận chưa tồn tại hoặc bị lặp.'],
                src: 'doc sendComment party-room.service.ts ("event chỉ bắn sau transaction commit và replay không bắn lại")',
              },
              {
                at: 'const existing = await this.commentRepo.findOneBy({',
                text: ['Vi phạm unique trên idempotency_key nghĩa là yêu cầu này đã được xử lý: cùng phòng, người gửi và nội dung thì trả bình luận cũ; khác nội dung thì 409 thay vì ghi đè.'],
                src: 'sendComment party-room.service.ts (nhánh isUniqueViolation UQ_PARTY_ROOM_COMMENTS_IDEMPOTENCY) + migration 1756800000000-party-room-presence-chat.ts',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: PS,
            dedent: true,
            ranges: [fn('private async lockActiveRoom(')],
            inline: [
              {
                at: "mode: mode === 'read' ? 'pessimistic_read' : 'pessimistic_write',",
                text: ['FOR SHARE vẫn xung đột với FOR UPDATE: join, leave, đổi role và đóng phòng chờ các bình luận đang chạy xong, nên thứ tự leave/send vẫn xác định dù bình luận không còn chặn nhau.'],
                src: 'doc lockActiveRoom party-room.service.ts + test party-room.integration.spec.ts ("bình luận chỉ giữ FOR SHARE trên phòng: không chặn nhau, còn thao tác đổi state (FOR UPDATE) vẫn chờ")',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: PS,
            dedent: true,
            ranges: [fn('private async publishToRoomMembers(')],
            inline: [
              {
                at: 'const members = await this.memberRepo.find({',
                text: ['Chỉ cần userId: không nạp cả hàng member (token, mốc thời gian...) cho mỗi sự kiện fanout. Fanout dùng kênh riêng của từng user, gateway không có kênh theo phòng.'],
                src: 'comment gốc publishToRoomMembers party-room.service.ts ("Chỉ cần userId: không nạp cả hàng member") + doc ("Fanout per-user channel hiện có — gateway zero-logic")',
              },
            ],
          },
        ],
      },
    ],
  },
];
