// Xếp hạng video ở 10M: không xoay vòng cả bảng mà tính lại theo HẠN (rank_due_at). Công việc mỗi giờ tỉ lệ với video trẻ và
// đang có tương tác, không với cả catalogue. Một tick = vài lô, mỗi lô là MỘT câu UPDATE chọn + tính + đặt hạn kế tiếp.
// `src` = bằng chứng của từng comment; engine bỏ qua, verify-annotated.mjs yêu cầu có.
const S = 'apps/core-api/src/modules/short-video';
const VR = `${S}/jobs/video-ranking.service.ts`;
const MIG = 'apps/core-api/src/database/migrations/1758700000000-video-rank-due.ts';
const END_FN = '^  }$';

const fn = (anchor) => ({ at: anchor, to: END_FN });

export const annotatedFeatures = [
  {
    id: '34-video-ranking',
    short: 'Video ranking',
    title: 'Xếp hạng video: tính lại theo hạn, không xoay vòng cả bảng',
    summary:
      'Điểm hạng = tương tác / (1 + tuổi/decay) đổi chậm theo thời gian nên mỗi video chỉ cần tính lại sau một khoảng tỉ lệ với (decay + tuổi): video mới ~30 phút, video nhiều tháng tuổi vài ngày. Việc mỗi giờ tỉ lệ với video trẻ và đang hoạt động, không tăng tuyến tính theo số video.',
    arch: 'batch-jobs',
    diagramAnchor: '20-short-video',
    endpoints: [
      {
        n: '01',
        slug: 'job-video-ranking-tick',
        method: 'JOB',
        short: 'ranking tick',
        route: 'VideoRankingService.runOnce (mỗi VIDEO_RANKING_JOB_INTERVAL_MS)',
        name: 'Tính lại điểm hạng các video đến hạn',
        title:
          'Mỗi tick chạy vài lô: mỗi lô là một câu UPDATE chọn các video published đến hạn (SKIP LOCKED), tính điểm mới và đặt hạn tính lại kế tiếp.',
        flow: '[WORKER] → [POSTGRES]',
        roles: [
          ['WORKER', 'Một pod duy nhất chạy tick (cluster-singleton); đọc trọng số và tham số lịch, lặp tối đa VIDEO_RANKING_MAX_BATCHES_PER_TICK lô, dừng sớm khi lô chưa đầy.'],
          ['POSTGRES', 'Một câu UPDATE cho mỗi lô: subquery chọn id đến hạn theo index một phần (rank_due_at ASC NULLS FIRST) với FOR UPDATE SKIP LOCKED, rồi ghi rank_score, rank_computed_at và rank_due_at.'],
        ],
        tables: [
          ['videos', 'rank_score (điểm), rank_computed_at (lần tính gần nhất), rank_due_at (hạn tính lại kế tiếp; NULL = đến hạn ngay: video mới hoặc chưa từng tính); index một phần idx_videos_rank_due_at (rank_due_at ASC NULLS FIRST, id ASC) WHERE status = published.'],
        ],
        related: [
          ['Counter buffer', 'trang Short Video: khi viewCount/likeCount/commentCount đổi, bộ đếm kéo rank_due_at về sớm (VIDEO_RANKING_ACTIVE_REFRESH_SECONDS) nên video đang nóng được tính lại nhanh (không chép).'],
          ['ManagedInterval', 'khung lịch chạy cluster-singleton dùng chung với các job nền khác; chi tiết ở trang Vòng đời dữ liệu (không chép).'],
        ],
        nested: true,
        steps: [
          { at: 'async runOnce(): Promise<number> {', text: 'Một tick: tính lại tối đa VIDEO_RANKING_MAX_BATCHES_PER_TICK lô video đến hạn' },
          { at: "const weightView = this.config.getOrThrow('VIDEO_RANK_WEIGHT_VIEW', {", text: 'Đọc trọng số công thức điểm và tham số lịch tính lại (cả hai chỉnh bằng cấu hình)' },
          { at: 'for (let batch = 0; batch < maxBatches; batch += 1) {', text: 'Lặp từng lô; mỗi lô là một câu UPDATE, không đọc về app rồi ghi từng dòng' },
          { at: 'const [, count] = (await this.dataSource.query(', text: 'Chọn video published đến hạn (SKIP LOCKED), tính điểm mới và hạn kế tiếp trong cùng câu lệnh' },
          { at: 'if (count < batchSize) break;', text: 'Lô chưa đầy nghĩa là hết video đến hạn: dừng sớm, tick sau mới chạy tiếp' },
        ],
        items: [
          {
            tag: 'WORKER',
            file: VR,
            dedent: true,
            ranges: [fn('async runOnce(')],
            inline: [
              {
                at: 'const stalenessFraction =',
                text: ['Tỉ lệ lệch tương đối cho phép (VIDEO_RANKING_STALENESS_PCT %) và trần khoảng tính lại: hai núm quyết định bao lâu một video được tính lại. Điểm = tương tác / (1 + tuổi/decay) chỉ lệch tương đối ≈ Δ / (decay + tuổi) sau Δ giờ, nên video càng già càng ít cần tính lại.'],
                src: 'doc VideoRankingService (video-ranking.service.ts) + migration 1758700000000-video-rank-due.ts',
              },
              {
                at: 'const [, count] = (await this.dataSource.query(',
                text: [
                  '[POSTGRES] Cả việc chọn lẫn tính nằm trong MỘT câu UPDATE: subquery lấy id đến hạn theo thứ tự hạn (rank_due_at ASC NULLS FIRST, id ASC) bằng index một phần chỉ chứa video published, nên mỗi lô chỉ chạm đúng LIMIT dòng, không quét cả bảng.',
                  'FOR UPDATE SKIP LOCKED: video đang bị moderation chuyển trạng thái thì bỏ qua thay vì chờ, tick sau nhặt lại.',
                  'Hạn kế tiếp = now + LEAST(trần, GREATEST(sàn 60 giây, tỉ lệ × (decay + tuổi_giờ) × 3600)). Sàn 60 giây bảo đảm hạn luôn nằm trong tương lai nên một video không bị tính hai lần trong một tick; công thức điểm không đổi so với bản cũ.',
                ],
                src: 'doc VideoRankingService + MIN_REFRESH_SECONDS (video-ranking.service.ts) + plan 2026-10-17 § 7a (ADR 0014)',
              },
              {
                at: 'if (count < batchSize) break;',
                text: ['Trước đây xoay vòng theo rank_computed_at: chu kỳ đầy đủ = số video / lô × chu kỳ tick, tăng tuyến tính theo số video (hàng chục triệu video không bao giờ kịp). Giờ lô chỉ gồm video ĐẾN HẠN nên số lô mỗi giờ tỉ lệ với video trẻ và hoạt động; lô chưa đầy nghĩa là đã hết việc.'],
                src: 'comment migration 1758700000000-video-rank-due.ts ("Xoay vòng theo rank_computed_at có chu kỳ đầy đủ...")',
              },
            ],
          },
          {
            tag: 'POSTGRES',
            file: MIG,
            dedent: true,
            ranges: [
              {
                at: 'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_videos_rank_due_at',
                to: '^    \\);$',
                pad: [1, 0],
              },
            ],
            inline: [
              {
                at: 'await queryRunner.query(',
                text: ['Index một phần theo đúng thứ tự job đọc (rank_due_at ASC NULLS FIRST, id ASC) và chỉ gồm video published: lô kế tiếp là đọc đầu index chứ không quét bảng. CONCURRENTLY nên không khoá ghi bảng videos khi migrate (vì vậy migration chạy ngoài transaction).'],
                src: 'comment migration 1758700000000-video-rank-due.ts ("Index một phần theo thứ tự đến hạn ... CONCURRENTLY, ngoài transaction")',
              },
            ],
          },
        ],
      },
    ],
  },
];
