import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type VideoDto = ApiSchema<'VideoDto'>;
export type VideoCommentDto = ApiSchema<'VideoCommentDto'>;
export type ReactionStatusDto = ApiSchema<'ReactionStatusDto'>;
export type ReportVideoDto = ApiSchema<'ReportVideoDto'>;

/** `sort` thật từ backend (short-video.dtos.ts `ListVideosQueryDto`). */
export type VideoFeedSort = 'recent' | 'ranked';
/** Tab video.html: "Dành cho bạn" = for_you (mọi video), "Đang theo dõi" = following (video bạn bè). */
export type VideoFeedScope = 'for_you' | 'following';

const VIDEO_FEED_PAGE_LIMIT = 10;
const VIDEO_COMMENTS_PAGE_LIMIT = 30;
const VIDEO_AUTHOR_STALE_TIME_MS = 5 * 60 * 1000;

export const shortVideoKeys = {
  listAll: ['short-video', 'list'] as const,
  list: (sort: VideoFeedSort, scope: VideoFeedScope) =>
    ['short-video', 'list', sort, scope] as const,
  comments: (videoId: string) => ['short-video', 'comments', videoId] as const,
};

export function useVideoFeed(sort: VideoFeedSort, scope: VideoFeedScope) {
  return useInfiniteQuery({
    queryKey: shortVideoKeys.list(sort, scope),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/videos', {
        params: {
          query: {
            sort,
            feed: scope,
            limit: VIDEO_FEED_PAGE_LIMIT,
            cursor: pageParam,
          },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });
}

/** Tặng quà cho tác giả video — server suy người nhận từ video, giá đọc từ catalog server. */
export function useSendVideoGift(videoId: string) {
  return useMutation({
    mutationFn: async (input: { giftId: string; idempotencyKey: string }) => {
      const res = await apiClient.POST('/api/v1/videos/{videoId}/gifts', {
        params: {
          path: { videoId },
          header: { 'Idempotency-Key': input.idempotencyKey },
        },
        body: { giftId: input.giftId },
      });
      return res.data?.data;
    },
  });
}

export function useVideoComments(
  videoId: string,
  options?: { enabled?: boolean },
) {
  return useInfiniteQuery({
    queryKey: shortVideoKeys.comments(videoId),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/videos/{id}/comments', {
        params: {
          path: { id: videoId },
          query: { limit: VIDEO_COMMENTS_PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
    enabled: options?.enabled ?? true,
  });
}

export function useCreateVideoComment(videoId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await apiClient.POST('/api/v1/videos/{id}/comments', {
        params: { path: { id: videoId } },
        body: { content },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: shortVideoKeys.comments(videoId),
      });
      void queryClient.invalidateQueries({ queryKey: shortVideoKeys.listAll });
    },
  });
}

function useSetVideoReaction(videoId: string, liked: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = liked
        ? await apiClient.POST('/api/v1/videos/{id}/reactions', {
            params: { path: { id: videoId } },
          })
        : await apiClient.DELETE('/api/v1/videos/{id}/reactions', {
            params: { path: { id: videoId } },
          });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: shortVideoKeys.listAll });
    },
  });
}

export function useLikeVideo(videoId: string) {
  return useSetVideoReaction(videoId, true);
}

export function useUnlikeVideo(videoId: string) {
  return useSetVideoReaction(videoId, false);
}

export function useRecordVideoView(videoId: string) {
  return useMutation({
    mutationFn: async (watchTimeMs: number) => {
      await apiClient.POST('/api/v1/videos/{id}/views', {
        params: { path: { id: videoId } },
        body: { watchTimeMs },
      });
    },
  });
}

export function useReportVideo(videoId: string) {
  return useMutation({
    mutationFn: async (dto: ReportVideoDto) => {
      await apiClient.POST('/api/v1/videos/{id}/report', {
        params: { path: { id: videoId } },
        body: dto,
      });
    },
  });
}

/** Nickname thật của tác giả (đúng "Âm thanh gốc · {tác giả}" ở layouts/web/video.html) —
 * `VideoDto` chỉ có `authorUserId`, tra thêm qua `GET /users/{id}` như party-room đã làm. */
export function useAuthorProfile(userId: string) {
  return useQuery({
    queryKey: ['short-video', 'author', userId],
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/users/{id}', {
        params: { path: { id: userId } },
      });
      return res.data?.data;
    },
    staleTime: VIDEO_AUTHOR_STALE_TIME_MS,
  });
}
