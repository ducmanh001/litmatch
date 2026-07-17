import { extractYoutubeVideoId } from './youtube-url';

describe('extractYoutubeVideoId', () => {
  it('youtube.com/watch?v=... — trích đúng videoId', () => {
    expect(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
    ).toBe('dQw4w9WgXcQ');
  });

  it('youtu.be/... — trích đúng videoId', () => {
    expect(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe(
      'dQw4w9WgXcQ',
    );
  });

  it('youtube.com có thêm query khác — vẫn lấy đúng v=', () => {
    expect(
      extractYoutubeVideoId(
        'https://youtube.com/watch?list=abc&v=xyz123&t=30s',
      ),
    ).toBe('xyz123');
  });

  it('URL rác — trả về null thay vì crash', () => {
    expect(extractYoutubeVideoId('không phải url')).toBeNull();
  });

  it('domain không phải youtube — trả về null', () => {
    expect(extractYoutubeVideoId('https://example.com/watch?v=abc')).toBeNull();
  });

  it('youtube.com thiếu v= — trả về null', () => {
    expect(extractYoutubeVideoId('https://www.youtube.com/watch')).toBeNull();
  });

  it('youtu.be thiếu path — trả về null', () => {
    expect(extractYoutubeVideoId('https://youtu.be/')).toBeNull();
  });
});
