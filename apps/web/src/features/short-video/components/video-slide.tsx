'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';

import { getUserDisplayName } from '../../../shared/lib/user-display-name';
import { useLocale } from '../../../shared/i18n/locale-store';
import { PlaceholderAvatar } from '../../../shared/ui/placeholder-avatar';
import { useRecordVideoView } from '../api';

import type { VideoDto } from '../api';
import type { SVGProps } from 'react';

function SpeakerIcon({
  muted,
  ...props
}: SVGProps<SVGSVGElement> & { muted: boolean }) {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      {...props}
    >
      <path d="M4 9v6h4l5 5V4L8 9H4z" />
      {!muted && <path d="M17.5 8.5a5 5 0 010 7" strokeLinecap="round" />}
      {muted && <path d="M17 9l5 6M22 9l-5 6" strokeLinecap="round" />}
    </svg>
  );
}

function MusicNoteIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={12}
      height={12}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <path d="M12 3v10.55A4 4 0 1014 17V7h4V3z" />
    </svg>
  );
}

function VoiceIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      aria-hidden
      {...props}
    >
      <path d="M12 1a3 3 0 00-3 3v8a3 3 0 006 0V4a3 3 0 00-3-3z" />
      <path d="M19 10v2a7 7 0 01-14 0v-2M12 19v4M8 23h8" />
    </svg>
  );
}

const MIN_TRACKED_WATCH_MS = 500;

/** Autoplay khi slide vào khung nhìn, pause + ghi nhận watch-time khi rời — cả hai chỉ chạy
 * ở trình duyệt thật vì jsdom (test env) không implement IntersectionObserver. Nút
 * like/comment/tặng/report giờ nằm ở `VideoReelFeed` (dùng chung 1 bộ, tránh lệch state khi
 * mobile/desktop có 2 vị trí hiển thị khác nhau như mockup). */
export function VideoSlide({
  video,
  onActiveChange,
  muted,
  onMutedChange,
}: {
  video: VideoDto;
  onActiveChange: (video: VideoDto) => void;
  muted: boolean;
  onMutedChange: (muted: boolean) => void;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchStartRef = useRef<number | null>(null);
  const locale = useLocale();
  // Tương thích response core-api cũ trong lúc web và API được deploy/restart lệch phiên bản.
  const author = video.author ?? {
    id: video.authorUserId,
    nickname: getUserDisplayName(video.author, locale),
    avatarId: video.authorUserId,
  };
  const recordView = useRecordVideoView(video.id);

  useEffect(() => {
    const container = containerRef.current;
    const el = videoRef.current;
    if (container === null) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined) return;
        if (entry.isIntersecting) {
          onActiveChange(video);
          watchStartRef.current = Date.now();
          if (el !== null) void el.play().catch(() => undefined);
        } else {
          el?.pause();
          const startedAt = watchStartRef.current;
          watchStartRef.current = null;
          if (startedAt !== null) {
            const watchTimeMs = Date.now() - startedAt;
            if (watchTimeMs > MIN_TRACKED_WATCH_MS) {
              recordView.mutate(watchTimeMs);
            }
          }
        }
      },
      { threshold: 0.6 },
    );
    observer.observe(container);
    return () => observer.disconnect();
    // Chỉ theo dõi lại IntersectionObserver khi đổi video, không phải mỗi lần callback/mutation đổi identity.
  }, [video.id]);

  return (
    <section
      ref={containerRef}
      className="relative flex h-full w-full shrink-0 snap-start snap-always items-end overflow-hidden bg-gradient-to-br from-surf2 to-ink"
    >
      {video.playbackUrl !== null ? (
        <video
          ref={videoRef}
          src={video.playbackUrl}
          poster={video.thumbnailUrl ?? undefined}
          className="absolute inset-0 h-full w-full object-cover"
          preload="metadata"
          muted={muted}
          loop
          playsInline
        />
      ) : video.thumbnailUrl !== null ? (
        <img
          src={video.thumbnailUrl}
          alt=""
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <p className="absolute inset-0 flex items-center justify-center text-sm text-white/70">
          Video đang xử lý…
        </p>
      )}
      <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/5 to-black/30" />

      {video.playbackUrl !== null && (
        <button
          type="button"
          onClick={() => onMutedChange(!muted)}
          aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
        >
          <SpeakerIcon muted={muted} />
        </button>
      )}

      {/* pb-24 chừa chỗ cho bottom nav di động (h-16, đè lên video full-bleed) — desktop
          không có bottom nav nên chỉ cần pb-6 như mockup. */}
      <div className="relative z-20 w-[78%] px-4 pb-24 md:pb-6">
        {/* <p className="font-mono text-xs text-white/70">
          {new Date(video.createdAt).toLocaleDateString('vi-VN')} ·{' '}
          {video.viewCount} lượt xem
        </p> */}
        <Link
          href={`/users/${author.id}`}
          className="mt-3 inline-flex items-center gap-2 text-xs font-bold text-white hover:underline"
        >
          <PlaceholderAvatar
            seed={author.avatarId}
            alt=""
            size={28}
            className=" border-white/50"
          />
          {author.nickname}
        </Link>
        {video.caption !== null && (
          <p className="mt-1 text-sm leading-snug text-white">
            {video.caption}
          </p>
        )}
        <p></p>
        {/* <p className="mt-2 flex items-center gap-1.5 text-xs text-white/90">
          <MusicNoteIcon />
          Âm thanh gốc · {author.nickname}
        </p> */}
        <Link
          href="/matching"
          className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-xs font-bold text-white backdrop-blur"
        >
          <VoiceIcon />
          Voice Match ngay
        </Link>
      </div>
    </section>
  );
}
