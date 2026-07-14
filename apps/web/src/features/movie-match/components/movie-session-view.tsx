'use client';

import { isApiError } from '@litmatch/api-client';
import { RealtimeEvents } from '@litmatch/common-dtos/pure';
import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { useRealtimeEvent } from '../../../shared/realtime/use-realtime-event';
import { Button } from '../../../shared/ui/button';
import {
  movieMatchKeys,
  useEndSession,
  useSession,
  useUpdateState,
} from '../api';
import { YoutubePlayer } from './youtube-player';

import type {
  MovieSessionEndedEventData,
  MovieStateChangedEventData,
} from '@litmatch/common-dtos/pure';

/** Vị trí hiển thị nội suy — chỉ để hiện đồng hồ mono, KHÔNG dùng để seek player mỗi giây. */
function interpolatePositionSeconds(
  positionSeconds: number,
  isPlaying: boolean,
  positionUpdatedAt: string,
  nowMs: number,
): number {
  if (!isPlaying) return positionSeconds;
  const elapsed = (nowMs - new Date(positionUpdatedAt).getTime()) / 1000;
  return positionSeconds + Math.max(elapsed, 0);
}

function formatTimer(totalSeconds: number): string {
  const clamped = Math.max(0, Math.floor(totalSeconds));
  const minutes = Math.floor(clamped / 60);
  const seconds = clamped % 60;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

export function MovieSessionView({ sessionId }: { sessionId: string }) {
  const queryClient = useQueryClient();
  const session = useSession(sessionId);
  const updateState = useUpdateState(sessionId);
  const endSession = useEndSession(sessionId);
  const [nowMs, setNowMs] = useState(() => Date.now());

  const invalidateSession = () => {
    void queryClient.invalidateQueries({
      queryKey: movieMatchKeys.session(sessionId),
    });
  };

  // Realtime chỉ gợi ý refetch sớm — poll của useSession vẫn là fallback thật (docs/12 §12.8).
  useRealtimeEvent<MovieStateChangedEventData>(
    RealtimeEvents.MovieStateChanged,
    (data) => {
      if (data.sessionId === sessionId) invalidateSession();
    },
  );
  useRealtimeEvent<MovieSessionEndedEventData>(
    RealtimeEvents.MovieSessionEnded,
    (data) => {
      if (data.sessionId === sessionId) invalidateSession();
    },
  );

  // Tick hiển thị đồng hồ mono mỗi giây — không seek player, chỉ để render số.
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (session.isPending) {
    return (
      <p className="px-5 py-4 text-center text-sm text-slate-500 dark:text-slate-400">
        Đang tải phiên xem chung…
      </p>
    );
  }

  if (session.isError) {
    // IDOR: 404 dùng chung cho "không tồn tại" và "không phải thành viên" — không cố phân biệt,
    // luôn hiện 1 câu chung (docs/06 §6, docs/10 §10.1.D).
    const message =
      isApiError(session.error) && session.error.status === 404
        ? 'Không tìm thấy phiên xem chung.'
        : isApiError(session.error)
          ? session.error.message
          : 'Có lỗi xảy ra, thử lại.';
    return (
      <p role="alert" className="px-5 py-4 text-sm text-destructive">
        {message}
      </p>
    );
  }

  const s = session.data;
  if (s === undefined) return null;

  if (s.status !== 'active') {
    return (
      <div className="flex flex-col items-center gap-3 px-8 py-10 text-center">
        <p className="text-sm text-slate-500 dark:text-slate-400">
          Phiên xem chung đã kết thúc.
        </p>
      </div>
    );
  }

  const displayPosition = interpolatePositionSeconds(
    s.positionSeconds,
    s.isPlaying,
    s.positionUpdatedAt,
    nowMs,
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="px-5">
        <YoutubePlayer
          videoUrl={s.videoUrl}
          positionSeconds={s.positionSeconds}
          isPlaying={s.isPlaying}
          positionUpdatedAt={s.positionUpdatedAt}
          onLocalStateChange={(positionSeconds, isPlaying) => {
            updateState.mutate({ positionSeconds, isPlaying });
          }}
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400">
            {formatTimer(displayPosition)}
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-rose-500"
            disabled={endSession.isPending}
            onClick={() => endSession.mutate()}
          >
            {endSession.isPending ? 'Đang kết thúc…' : 'Kết thúc'}
          </Button>
        </div>
      </div>
    </div>
  );
}
