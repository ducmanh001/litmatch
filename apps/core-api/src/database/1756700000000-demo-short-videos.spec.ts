import {
  DEMO_SHORT_VIDEOS,
  DEMO_VIDEO_AUTHOR_ID,
  DemoShortVideos1756700000000,
} from './migrations/1756700000000-demo-short-videos';

import type { QueryRunner } from 'typeorm';

function queryRunnerStub() {
  return {
    query: jest.fn().mockResolvedValue([]),
  } as unknown as QueryRunner;
}

describe('DemoShortVideos1756700000000', () => {
  it('seed một profile không credential và ba video published có playback/metadata', async () => {
    const runner = queryRunnerStub();

    await new DemoShortVideos1756700000000().up(runner);

    expect(runner.query).toHaveBeenCalledTimes(2);
    expect(runner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO users'),
      [DEMO_VIDEO_AUTHOR_ID],
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('ON CONFLICT DO NOTHING'),
      [DEMO_VIDEO_AUTHOR_ID],
    );

    const [videoInsert, values] = (runner.query as jest.Mock).mock.calls[1];
    expect(videoInsert).toContain("'published'");
    expect(videoInsert).toContain('ON CONFLICT DO NOTHING');
    expect(values).toHaveLength(DEMO_SHORT_VIDEOS.length * 9);
    for (const video of DEMO_SHORT_VIDEOS) {
      expect(values).toEqual(
        expect.arrayContaining([
          video.id,
          DEMO_VIDEO_AUTHOR_ID,
          video.playbackUrl,
          video.thumbnailUrl,
          video.durationSeconds,
          video.idempotencyKey,
        ]),
      );
    }
  });

  it('rollback xóa đúng seed theo thứ tự child rồi dọn author pristine', async () => {
    const runner = queryRunnerStub();

    await new DemoShortVideos1756700000000().down(runner);

    expect(runner.query).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('(id, idempotency_key) IN'),
      [
        DEMO_VIDEO_AUTHOR_ID,
        ...DEMO_SHORT_VIDEOS.flatMap((video) => [
          video.id,
          video.idempotencyKey,
        ]),
      ],
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('DELETE FROM users'),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('foreign_key_violation'),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining("gender = 'other'"),
    );
    expect(runner.query).toHaveBeenNthCalledWith(
      2,
      expect.stringContaining('interests'),
    );
  });
});
