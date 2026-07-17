/**
 * Trích `videoId` từ 2 dạng URL phổ biến nhất: `youtube.com/watch?v=...` và `youtu.be/...`.
 * Không cần bao quát mọi biến thể (shorts, embed, playlist…) — server là nguồn validate thật
 * (whitelist host + domain thật, docs/services/movie-match-service.md § 3); ở đây chỉ cần đủ
 * để phát được video hoặc trả `null` cho FE tự hiện fallback thay vì crash player.
 */
export function extractYoutubeVideoId(url: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }

  const host = parsed.hostname.replace(/^www\./, '').replace(/^m\./, '');

  if (host === 'youtu.be') {
    const id = parsed.pathname.slice(1);
    return id.length > 0 ? id : null;
  }

  if (host === 'youtube.com') {
    const id = parsed.searchParams.get('v');
    return id !== null && id.length > 0 ? id : null;
  }

  return null;
}
