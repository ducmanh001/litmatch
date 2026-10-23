// Short Video: CHỈ endpoint có cơ chế thật (INSERT ... ON CONFLICT DO NOTHING + khóa dòng để đếm đúng 1 lần dưới race).
// Một file, luồng đi liền mạch từ trên xuống theo thứ tự chạy; mỗi đoạn có nhãn tầng.
// `src` = bằng chứng của từng comment (comment gốc trong code hoặc docs); engine bỏ qua, verify-annotated.mjs yêu cầu có.
const S = 'apps/core-api/src/modules/short-video';
const SC = `${S}/short-video.controller.ts`;
const SS = `${S}/short-video.service.ts`;
const SR = `${S}/redis/redis-video-counter-buffer.adapter.ts`;
const MIG = 'apps/core-api/src/database/migrations/1754800000000-short-video.ts';
const END_FN = '^  }$';
const END_SQL = '^    `\\);$';

const fn = (anchor) => ({ at: anchor, to: END_FN });
const sql = (anchor) => ({ at: anchor, to: END_SQL, pad: [1, 0] });

export const annotatedFeatures = [
  {
    id: '20-short-video',
    short: 'Short Video',
    title: 'Short Video',
    summary: 'Video ngắn: tác giả tải lên, người xem lướt, thả tim, bình luận; lượt xem và thứ hạng được đếm chống trùng.',
    arch: 'batch-jobs',
    diagramAnchor: '20-short-video',
    endpoints: [
      {
        n: '01',
        slug: 'post-record-view',
        method: 'POST',
        short: '/videos/:id/views',
        route: '/api/v1/videos/:id/views',
        name: 'Ghi nhận lượt xem video',
        title: 'Ghi watch-time của người xem và cộng viewCount đúng 1 lần khi xem đủ ngưỡng, kể cả khi nhiều request đến cùng lúc.',
        flow: '[CONTROLLER] → [SERVICE] → [POSTGRES]',
        roles: [
          ['CONTROLLER', 'Nhận watchTimeMs mà client báo, giao cho service và trả 204.'],
          ['SERVICE', 'Kiểm video xem được, bỏ qua tác giả tự xem, so watch-time với ngưỡng "xem đủ", cộng viewCount đúng 1 lần.'],
          ['POSTGRES', 'Dòng video_views (unique video, người xem) tạo bằng ON CONFLICT DO NOTHING rồi khóa FOR UPDATE; viewCount cộng nguyên tử trong cùng transaction.'],
        ],
        tables: [
          ['video_views', 'mỗi cặp (video, người xem) 1 dòng: watch_time_ms lớn nhất đã báo và cờ qualified (chỉ chuyển false → true 1 lần); unique (video_id, viewer_id).'],
          ['videos', 'đọc để kiểm quyền xem (tác giả hoặc đã published); view_count được cộng khi người xem đạt ngưỡng lần đầu.'],
        ],
        related: [
          ['VideoRankingService', 'job nền tính rankScore từ viewCount, likeCount, commentCount, nên đếm đúng 1 lần ảnh hưởng thứ hạng (chưa chép).'],
        ],
        nested: true, // lồng nhau tự động theo quan hệ gọi hàm; `skip` (hàm cơ bản không bung) và `steps` (đánh số bước) khai bên dưới
        skip: ['getVideoOrThrow'], // find-or-throw kèm kiểm quyền xem: chỉ giữ dòng gọi
        steps: [
          { at: "@Post(':id/views')", text: 'Nhận watchTimeMs mà client báo (user từ JWT, id video từ URL), trả 204' },
          { at: 'const video = await this.getVideoOrThrow(user, videoId);', text: 'Kiểm video xem được (tác giả hoặc đã published)' },
          { at: 'if (video.authorUserId === user.userId) return;', text: 'Tác giả tự xem thì không tính lượt xem' },
          { at: 'const nowQualifies = watchTimeMs >= qualifiedMinMs;', text: 'So watch-time với ngưỡng "xem đủ"' },
          { at: 'await this.dataSource.transaction(async (manager) => {', text: 'Mở transaction DB để đếm đúng 1 lần dưới race' },
          { at: 'await manager', text: 'Tạo dòng video_views nếu chưa có (INSERT ... ON CONFLICT DO NOTHING)' },
          { at: 'const view = await manager.findOneOrFail(VideoView, {', text: 'Khóa dòng (FOR UPDATE) để request song song xếp hàng' },
          { at: 'await manager.update(', text: 'Ghi watch-time lớn nhất và cờ qualified' },
          { at: 'if (shouldQualifyNow && !this.buffered) {', text: 'Bộ đệm TẮT (mặc định): lần đầu đạt ngưỡng thì cộng viewCount ngay trong transaction' },
          { at: 'await manager.query(', in: 'bumpCounter', text: 'UPDATE một hàng videos: cộng đếm và kéo hạn tính lại ranking về sớm' },
          { at: 'if (qualifiedNow && this.buffered) {', text: 'Bộ đệm BẬT: sau khi commit chỉ ghi delta vào Redis, một job nền gộp lại thành một UPDATE' },
          { at: 'await (this.counterBuffer as VideoCounterBufferPort).add(', text: 'Ghi delta vào Redis; lỗi Redis thì cộng thẳng vào DB' },
          { at: 'const results = await this.redis', text: 'MULTI: HINCRBY và SADD cùng một giao dịch Redis' },
        ],
        items: [
          // 1) Controller: không có gì khó, không comment
          { tag: 'CONTROLLER', file: SC, dedent: true, ranges: [fn("@Post(':id/views')")] },

          // 2) Service: tạo dòng + khóa dòng + cộng đúng 1 lần
          {
            tag: 'SERVICE',
            file: SS,
            dedent: true,
            ranges: [fn('async recordView(')],
            inline: [
              {
                at: 'const video = await this.getVideoOrThrow(user, videoId);',
                text: ['Không tồn tại, removed, rejected, hoặc chưa published (với người không phải tác giả) đều trả CÙNG mã 404.'],
                src: 'doc getVideoOrThrow short-video.service.ts L169 (comment gốc của hàm được gọi ở dòng này)',
              },
              {
                at: 'await manager',
                text: ['[POSTGRES] Tạo dòng bằng INSERT ... ON CONFLICT DO NOTHING: không ném unique violation nên Postgres không hủy transaction (insert lỗi rồi đọc lại trong cùng transaction sẽ dính "current transaction is aborted").'],
                src: 'comment gốc short-video.service.ts L269-270',
              },
              {
                at: 'const view = await manager.findOneOrFail(VideoView, {',
                text: ['Rồi KHÓA dòng (FOR UPDATE): 2 request đồng thời của cùng người xem chạy tuần tự, request sau thấy qualified = true của request trước nên không cộng viewCount lần nữa.'],
                src: 'comment gốc short-video.service.ts L270-271',
              },
              {
                at: 'const shouldQualifyNow = nowQualifies && !view.qualified;',
                text: ['qualified chỉ chuyển false → true đúng 1 lần; các lần cập nhật watch-time sau không cộng lại (idempotent theo cờ).'],
                src: 'doc recordView short-video.service.ts L249-253',
              },
              {
                at: 'if (shouldQualifyNow && !this.buffered) {',
                text: ['Mỗi video chỉ có MỘT hàng videos giữ view/like/comment_count: ở quy mô lớn mọi lượt xem đủ ngưỡng của video nóng cùng UPDATE một hàng và xếp hàng sau khoá hàng đó. Vì vậy có cờ VIDEO_COUNTER_BUFFER_ENABLED (mặc định TẮT): bật thì bỏ UPDATE này khỏi transaction.'],
                src: 'docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 7a (short-video: hàng nóng một hàng/video) + doc VideoCounterBufferPort',
              },
              {
                at: 'if (qualifiedNow && this.buffered) {',
                text: ['Ghi vào Redis SAU commit: nếu Redis timeout mơ hồ sau khi lệnh thực ra đã chạy, lần thử lại cộng thẳng vào DB sẽ đếm dư một lần. Đánh đổi chấp nhận được cho bộ đếm chỉ để hiển thị.'],
                src: 'docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md § 10 (review audit C12–C17, điểm 3A: ghi tài liệu, chấp nhận)',
              },
            ],
          },

          // 2b) Hai đường cộng bộ đếm: UPDATE trực tiếp, hoặc đệm Redis
          {
            tag: 'SERVICE',
            file: SS,
            dedent: true,
            ranges: [fn('private async bumpCounter('), fn('private async bufferCounter(')],
            inline: [
              {
                at: 'await manager.query(',
                text: ['[POSTGRES] Cùng câu UPDATE kéo rank_due_at về sớm: video đang có tương tác được tính lại ranking sớm (trong VIDEO_RANKING_ACTIVE_REFRESH_SECONDS) thay vì chờ chu kỳ tuổi-thích-nghi.'],
                src: 'doc bumpCounter short-video.service.ts + docs/plans/2026-10-17-realtime-matching-chat-scale-plan.md (C21 ranking theo hạn tính lại)',
              },
            ],
          },
          {
            tag: 'REDIS',
            file: SR,
            dedent: true,
            ranges: [fn('async add(')],
            inline: [
              {
                at: 'const results = await this.redis',
                text: ['[REDIS] MULTI (không phải pipeline): HINCRBY và SADD vào tập "dirty" cùng thành công hoặc cùng không chạy, nên không để lại hash mồ côi mà job flush không bao giờ thấy.'],
                src: 'comment đổi sang MULTI ở commit 7673b5a (plan § 10, điểm 3B) + doc redis-video-counter-buffer.adapter.ts',
              },
            ],
          },

          // 3) Service được gọi đầu hàm: guard quyền xem (chỉ còn dòng gọi, xem `skip`; comment "cùng mã 404" chuyển lên dòng gọi)
          { tag: 'SERVICE', file: SS, dedent: true, ranges: [fn('async getVideoOrThrow(')] },

          // 4) Postgres: unique chống đếm đôi
          {
            tag: 'POSTGRES',
            file: MIG,
            dedent: true,
            ranges: [sql('CREATE TABLE video_views (')],
          },
        ],
      },
    ],
  },
];
