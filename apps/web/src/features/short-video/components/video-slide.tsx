'use client';

import { useEffect, useRef, useState } from 'react';

import { confirmAction } from '../../../shared/lib/confirm-store';
import { showToast } from '../../../shared/lib/toast-store';
import { ProfileIcon } from '../../../shared/ui/icons';
import { useRecordVideoView, useReportVideo } from '../api';
import { VideoCommentsSheet } from './video-comments-sheet';
import { VideoLikeButton } from './video-like-button';

import type { VideoDto } from '../api';
import type { SVGProps } from 'react';

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={26}
      height={26}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function GiftIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={24}
      height={24}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M6 3h12l3 5-9 13L3 8z" />
      <path d="M3 8h18M9 3l3 5 3-5M12 8l-2 13M12 8l2 13" />
    </svg>
  );
}

function FlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={20}
      height={20}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      aria-hidden
      {...props}
    >
      <path d="M5 3v18" strokeLinecap="round" />
      <path d="M5 4h11l-2 4 2 4H5z" strokeLinejoin="round" />
    </svg>
  );
}

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

const MIN_TRACKED_WATCH_MS = 500;

/** Autoplay khi slide vào khung nhìn, pause + ghi nhận watch-time khi rời — cả hai chỉ chạy
 * ở trình duyệt thật vì jsdom (test env) không implement IntersectionObserver. */
export function VideoSlide({ video }: { video: VideoDto }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const watchStartRef = useRef<number | null>(null);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [reported, setReported] = useState(false);
  const [muted, setMuted] = useState(true);
  const recordView = useRecordVideoView(video.id);
  const reportVideo = useReportVideo(video.id);

  useEffect(() => {
    const container = containerRef.current;
    const el = videoRef.current;
    if (container === null || el === null) return;
    if (typeof IntersectionObserver === 'undefined') return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry === undefined) return;
        if (entry.isIntersecting) {
          watchStartRef.current = Date.now();
          void el.play().catch(() => undefined);
        } else {
          el.pause();
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
    // Chỉ theo dõi lại IntersectionObserver khi đổi video, không phải mỗi lần recordView đổi identity.
  }, [video.id]);

  const onReport = async () => {
    if (reported || reportVideo.isPending) return;
    const confirmed = await confirmAction({
      title: 'Báo cáo video',
      message: 'Bạn có chắc muốn báo cáo video này vì nội dung không phù hợp?',
      actionLabel: 'Báo cáo',
      tone: 'danger',
    });
    if (!confirmed) return;
    reportVideo.mutate(
      { reason: 'inappropriate_content' },
      {
        onSuccess: () => {
          setReported(true);
          showToast('Đã gửi báo cáo, cảm ơn bạn');
        },
        onError: () => {
          showToast('Không thể gửi báo cáo, thử lại.', 'warn');
        },
      },
    );
  };

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
          onClick={() => setMuted((current) => !current)}
          aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
          className="absolute right-3 top-3 z-20 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white backdrop-blur"
        >
          <SpeakerIcon muted={muted} />
        </button>
      )}

      <div className="relative z-20 flex w-full items-end justify-between gap-3 px-4 pb-6">
        <div className="w-[72%]">
          <p className="font-mono text-xs text-white/70">
            {new Date(video.createdAt).toLocaleDateString('vi-VN')} ·{' '}
            {video.viewCount} lượt xem
          </p>
          {video.caption !== null && (
            <p className="mt-1 text-sm leading-snug text-white">
              {video.caption}
            </p>
          )}
        </div>

        <div className="flex flex-col items-center gap-5">
          <span className="flex h-11 w-11 items-center justify-center rounded-full border-2 border-white bg-surf2">
            <ProfileIcon width={20} height={20} className="text-white" />
          </span>

          <VideoLikeButton video={video} />

          <button
            type="button"
            onClick={() => setCommentsOpen(true)}
            className="flex flex-col items-center gap-1 text-white transition-transform active:scale-90"
          >
            <CommentIcon />
            <span className="text-xs font-bold">{video.commentCount}</span>
          </button>

          <button
            type="button"
            disabled
            aria-label="Tặng quà (sắp có)"
            className="flex flex-col items-center gap-1 text-white/40"
          >
            <GiftIcon />
            <span className="text-xs font-bold">Tặng</span>
          </button>

          <button
            type="button"
            onClick={() => void onReport()}
            disabled={reported || reportVideo.isPending}
            aria-label={reported ? 'Đã báo cáo video này' : 'Báo cáo video'}
            className="flex flex-col items-center gap-1 text-white/70 transition-transform active:scale-90 disabled:opacity-50"
          >
            <FlagIcon />
            <span className="text-[10px] font-semibold">
              {reported ? 'Đã báo cáo' : 'Báo cáo'}
            </span>
          </button>
        </div>
      </div>

      <VideoCommentsSheet
        videoId={video.id}
        commentCount={video.commentCount}
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
      />
    </section>
  );
}
