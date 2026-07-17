'use client';

import { useEffect, useId, useRef, useState } from 'react';

import { extractYoutubeVideoId } from '../youtube-url';

/** Cửa sổ coi 1 state đến từ poll/realtime là "echo" của chính PATCH mình vừa gửi. */
const SELF_ECHO_WINDOW_MS = 2000;
/** Sai số vị trí chấp nhận được khi so khớp echo — playback ephemeral, không cần khớp tuyệt đối. */
const POSITION_ECHO_TOLERANCE_SECONDS = 2;
/** Thời gian cờ "đang tự áp remote" tồn tại — đủ để nuốt các onStateChange do seekTo/play/pause
 *  tự gây ra, nhưng không chặn thao tác user thật ngay sau đó. */
const APPLYING_REMOTE_FLAG_MS = 500;

// Chỉ khai đủ phần API thực dùng — tránh phụ thuộc @types/youtube cho cả app.
interface YTPlayerInstance {
  getCurrentTime(): number;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  destroy(): void;
}

interface YTPlayerStateChangeEvent {
  data: number;
}

interface YTNamespace {
  Player: new (
    elementId: string,
    options: {
      videoId: string;
      events: {
        onReady: () => void;
        onStateChange: (event: YTPlayerStateChangeEvent) => void;
      };
    },
  ) => YTPlayerInstance;
  PlayerState: { PLAYING: number; PAUSED: number };
}

declare global {
  interface Window {
    YT?: YTNamespace;
    onYouTubeIframeAPIReady?: () => void;
  }
}

let apiLoadPromise: Promise<YTNamespace> | null = null;

/**
 * `iframe_api` chỉ nên chèn 1 lần cho cả trang. Component này có thể mount lại trong cùng phiên
 * page (vd rời session rồi vào session khác) — promise nhớ ở module-level để lần mount sau tái
 * dùng, không gắn thêm `<script>` và không ghi đè `onYouTubeIframeAPIReady` đã đăng ký.
 */
function loadYoutubeIframeApi(): Promise<YTNamespace> {
  if (window.YT?.Player !== undefined) return Promise.resolve(window.YT);
  if (apiLoadPromise !== null) return apiLoadPromise;
  apiLoadPromise = new Promise((resolve) => {
    window.onYouTubeIframeAPIReady = () => resolve(window.YT as YTNamespace);
    if (document.getElementById('youtube-iframe-api-script') === null) {
      const script = document.createElement('script');
      script.id = 'youtube-iframe-api-script';
      script.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(script);
    }
  });
  return apiLoadPromise;
}

export interface YoutubePlayerProps {
  videoUrl: string;
  /** State remote (server) — nguồn sự thật để áp vào player khi KHÔNG phải echo của chính mình. */
  positionSeconds: number;
  isPlaying: boolean;
  positionUpdatedAt: string;
  onLocalStateChange: (positionSeconds: number, isPlaying: boolean) => void;
}

/**
 * Wrapper thuần cho YouTube IFrame Player API — không gọi network/API nào, chỉ điều khiển
 * player theo props "remote" và báo lại hành động local qua callback. Đồng bộ 2 chiều nên có
 * nguy cơ vòng lặp phản hồi (mình áp state remote → player tự bắn onStateChange → tưởng là
 * hành động user → PATCH lại → …) — xem 2 guard bên dưới (`applyingRemoteRef`,
 * `lastLocalMutationRef`).
 */
export function YoutubePlayer({
  videoUrl,
  positionSeconds,
  isPlaying,
  positionUpdatedAt,
  onLocalStateChange,
}: YoutubePlayerProps) {
  const rawId = useId();
  const elementId = `yt-player-${rawId.replace(/[^a-zA-Z0-9]/g, '')}`;
  const playerRef = useRef<YTPlayerInstance | null>(null);
  const [playerReady, setPlayerReady] = useState(false);
  // true trong lúc CHÍNH component này đang gọi seekTo/playVideo/pauseVideo để áp state remote —
  // onStateChange bắn ra bởi các lệnh đó không phải hành động user thật, phải bỏ qua.
  const applyingRemoteRef = useRef(false);
  // Dấu vết PATCH gần nhất do CHÍNH client này gây ra. Server không phát version id nên dùng
  // heuristic: khớp gần đúng (positionSeconds, isPlaying) trong 1 cửa sổ thời gian ngắn ⇒ coi
  // là bản echo của chính mình quay lại qua poll/realtime, bỏ qua thay vì seek lại (tránh giật
  // hình + tránh khả năng lặp nếu seekTo cũng sinh thêm onStateChange).
  const lastLocalMutationRef = useRef<{
    positionSeconds: number;
    isPlaying: boolean;
    at: number;
  } | null>(null);

  const videoId = extractYoutubeVideoId(videoUrl);

  useEffect(() => {
    if (videoId === null) return;
    let cancelled = false;

    void loadYoutubeIframeApi().then((YT) => {
      if (cancelled) return;
      if (document.getElementById(elementId) === null) return;
      playerRef.current = new YT.Player(elementId, {
        videoId,
        events: {
          onReady: () => setPlayerReady(true),
          onStateChange: (event) => {
            if (applyingRemoteRef.current) return;
            const isPlayOrPause =
              event.data === YT.PlayerState.PLAYING ||
              event.data === YT.PlayerState.PAUSED;
            if (!isPlayOrPause) return;
            const player = playerRef.current;
            if (player === null) return;
            const nowPlaying = event.data === YT.PlayerState.PLAYING;
            const position = player.getCurrentTime();
            lastLocalMutationRef.current = {
              positionSeconds: position,
              isPlaying: nowPlaying,
              at: Date.now(),
            };
            onLocalStateChange(position, nowPlaying);
          },
        },
      });
    });

    return () => {
      cancelled = true;
      playerRef.current?.destroy();
      playerRef.current = null;
      setPlayerReady(false);
    };
    // Chỉ tạo lại player khi đổi video — `onLocalStateChange` đổi identity mỗi render không nên
    // huỷ/tạo lại iframe, nên cố ý không đưa nó vào deps.
  }, [videoId, elementId]);

  useEffect(() => {
    const player = playerRef.current;
    if (!playerReady || player === null) return;

    const last = lastLocalMutationRef.current;
    const isEchoOfOwnMutation =
      last !== null &&
      Date.now() - last.at < SELF_ECHO_WINDOW_MS &&
      Math.abs(last.positionSeconds - positionSeconds) <
        POSITION_ECHO_TOLERANCE_SECONDS &&
      last.isPlaying === isPlaying;
    if (isEchoOfOwnMutation) return;

    applyingRemoteRef.current = true;
    player.seekTo(positionSeconds, true);
    if (isPlaying) player.playVideo();
    else player.pauseVideo();
    const timer = setTimeout(() => {
      applyingRemoteRef.current = false;
    }, APPLYING_REMOTE_FLAG_MS);
    return () => clearTimeout(timer);
  }, [positionSeconds, isPlaying, positionUpdatedAt, playerReady]);

  if (videoId === null) {
    return (
      <div className="flex aspect-video w-full items-center justify-center rounded-2xl bg-gradient-to-br from-surf2 to-ink text-sm text-white/70">
        Không phát được video này.
      </div>
    );
  }

  return (
    <div className="relative aspect-video w-full overflow-hidden rounded-2xl bg-gradient-to-br from-surf2 to-ink">
      <div id={elementId} className="h-full w-full" />
      {!playerReady && (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
          Video đang tải…
        </p>
      )}
    </div>
  );
}
