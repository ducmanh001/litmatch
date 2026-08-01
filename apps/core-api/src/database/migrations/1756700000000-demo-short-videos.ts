import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Demo content cho short-video khi môi trường chưa có luồng admin upload.
 *
 * Author chỉ là profile công khai: cố ý không tạo `auth_identities`, refresh token hay bất kỳ
 * credential nào. Video dùng sample MP4 công khai có audio; đến khi có CMS/upload thật, các row
 * này vẫn là video published bình thường và dùng nguyên API reaction/comment/view/gift.
 */
export const DEMO_VIDEO_AUTHOR_ID = '8ec6b59d-f7c6-45e8-9ba2-41b8b051b901';

export const DEMO_SHORT_VIDEOS = [
  {
    id: '8ec6b59d-f7c6-45e8-9ba2-41b8b051b911',
    storageKey: 'seed/short-video/sintel-trailer.mp4',
    playbackUrl: 'https://media.w3.org/2010/05/sintel/trailer.mp4',
    thumbnailUrl: 'https://media.w3.org/2010/05/sintel/poster.png',
    caption: 'Một chuyến phiêu lưu ngắn để bắt đầu ngày mới.',
    durationSeconds: 52,
    rankScore: 3,
    idempotencyKey: 'seed:short-video:sintel-trailer:v1',
  },
  {
    id: '8ec6b59d-f7c6-45e8-9ba2-41b8b051b912',
    storageKey: 'seed/short-video/bunny-trailer.mp4',
    playbackUrl: 'https://media.w3.org/2010/05/bunny/trailer.mp4',
    thumbnailUrl: 'https://media.w3.org/2010/05/bunny/poster.png',
    caption: 'Một chút vui nhộn cho giờ giải lao của bạn.',
    durationSeconds: 33,
    rankScore: 2,
    idempotencyKey: 'seed:short-video:bunny-trailer:v1',
  },
  {
    id: '8ec6b59d-f7c6-45e8-9ba2-41b8b051b913',
    storageKey: 'seed/short-video/movie-300.mp4',
    playbackUrl: 'https://media.w3.org/2010/05/video/movie_300.mp4',
    thumbnailUrl: 'https://media.w3.org/2010/05/video/poster.png',
    caption: 'Khoảnh khắc điện ảnh, xem cùng âm thanh nhé.',
    durationSeconds: 5,
    rankScore: 1,
    idempotencyKey: 'seed:short-video:movie-300:v1',
  },
] as const;

export class DemoShortVideos1756700000000 implements MigrationInterface {
  name = 'DemoShortVideos1756700000000';

  async up(queryRunner: QueryRunner): Promise<void> {
    // UUID cố định giúp migration có thể retry an toàn mà không ghi đè profile đang tồn tại.
    await queryRunner.query(
      `
        INSERT INTO users (
          id, nickname, gender, avatar_id, interests, is_guest
        ) VALUES (
          $1, 'Litmatch Demo', 'other', 'demo-short-video',
          '["video", "âm nhạc", "khám phá"]'::jsonb, false
        )
        ON CONFLICT DO NOTHING
      `,
      [DEMO_VIDEO_AUTHOR_ID],
    );

    await queryRunner.query(
      `
        INSERT INTO videos (
          id, author_user_id, status, storage_key, playback_url, thumbnail_url,
          caption, duration_seconds, rank_score, idempotency_key
        ) VALUES
          ${DEMO_SHORT_VIDEOS.map(
            (_, index) =>
              `($${index * 9 + 1}, $${index * 9 + 2}, 'published', $${index * 9 + 3}, $${index * 9 + 4}, $${index * 9 + 5}, $${index * 9 + 6}, $${index * 9 + 7}, $${index * 9 + 8}, $${index * 9 + 9})`,
          ).join(',\n          ')}
        ON CONFLICT DO NOTHING
      `,
      DEMO_SHORT_VIDEOS.flatMap((video) => [
        video.id,
        DEMO_VIDEO_AUTHOR_ID,
        video.storageKey,
        video.playbackUrl,
        video.thumbnailUrl,
        video.caption,
        video.durationSeconds,
        video.rankScore,
        video.idempotencyKey,
      ]),
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    // Xoá đúng row do migration sở hữu; nếu UUID bị collision với dữ liệu khác thì không đụng
    // nhầm row. Các view/reaction/comment của seed được cascade từ video.
    const seedVideoPairs = DEMO_SHORT_VIDEOS.map(
      (_, index) => `($${index * 2 + 2}, $${index * 2 + 3})`,
    ).join(', ');
    await queryRunner.query(
      `
        DELETE FROM videos
        WHERE author_user_id = $1
          AND (id, idempotency_key) IN (${seedVideoPairs})
      `,
      [
        DEMO_VIDEO_AUTHOR_ID,
        ...DEMO_SHORT_VIDEOS.flatMap((video) => [
          video.id,
          video.idempotencyKey,
        ]),
      ],
    );
    // Author là profile thật sau khi deploy: có thể đã nhận gift, có wallet/ledger hoặc được
    // dùng ở flow khác. Cố gắng dọn khi profile còn pristine; FK violation được giữ lại có chủ ý.
    await queryRunner.query(`
      DO $$
      BEGIN
        DELETE FROM users
        WHERE id = '${DEMO_VIDEO_AUTHOR_ID}'
          AND nickname = 'Litmatch Demo'
          AND gender = 'other'
          AND avatar_id = 'demo-short-video'
          AND interests = '["video", "âm nhạc", "khám phá"]'::jsonb
          AND status = 'active'
          AND role = 'user'
          AND trust_score = 100
          AND is_guest = false;
          -- role/trust_score are defaults on the seed profile; include them as ownership
          -- markers so a pre-existing user with the same UUID is never removed accidentally.
          -- The DELETE above is intentionally the only mutating statement in this block.
      EXCEPTION
        WHEN foreign_key_violation THEN NULL;
      END $$;
    `);
  }
}
