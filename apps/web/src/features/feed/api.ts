import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { apiClient } from '../../shared/api/client';

import type { ApiSchema } from '@litmatch/api-client';

export type PostDto = ApiSchema<'PostDto'>;
export type CommentDto = ApiSchema<'CommentDto'>;
export type ReactionStatusDto = ApiSchema<'ReactionStatusDto'>;
export type CreatePostDto = ApiSchema<'CreatePostDto'>;

const FEED_PAGE_LIMIT = 10;
const COMMENTS_PAGE_LIMIT = 30;
const POST_AUTHOR_STALE_TIME_MS = 5 * 60 * 1000;

export const feedKeys = {
  list: ['feed', 'list'] as const,
  detail: (postId: string) => ['feed', 'detail', postId] as const,
  comments: (postId: string) => ['feed', 'comments', postId] as const,
  reaction: (postId: string) => ['feed', 'reaction', postId] as const,
  author: (userId: string) => ['feed', 'author', userId] as const,
  userTimeline: (userId: string) => ['feed', 'user-timeline', userId] as const,
};

const USER_TIMELINE_PAGE_LIMIT = 6;

export function useFeed() {
  return useInfiniteQuery({
    queryKey: feedKeys.list,
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/feed/posts', {
        params: { query: { limit: FEED_PAGE_LIMIT, cursor: pageParam } },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });
}

/** `PostDto` chỉ giữ authorUserId; profile công khai được hydrate qua contract Users hiện có. */
export function usePostAuthor(userId: string) {
  return useQuery({
    queryKey: feedKeys.author(userId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/users/{id}', {
        params: { path: { id: userId } },
      });
      return res.data?.data;
    },
    staleTime: POST_AUTHOR_STALE_TIME_MS,
  });
}

/** Timeline 1 tác giả (vd "bài viết của bạn" ở trang Hồ sơ) — audience tự khớp theo quan hệ. */
export function useUserTimeline(
  userId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: feedKeys.userTimeline(userId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/feed/users/{userId}/posts', {
        params: {
          path: { userId },
          query: { limit: USER_TIMELINE_PAGE_LIMIT },
        },
      });
      return res.data?.data;
    },
    enabled: options?.enabled ?? true,
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      body: CreatePostDto;
      idempotencyKey: string;
    }) => {
      const res = await apiClient.POST('/api/v1/feed/posts', {
        params: { header: { 'Idempotency-Key': input.idempotencyKey } },
        body: input.body,
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: feedKeys.list });
    },
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (postId: string) => {
      await apiClient.DELETE('/api/v1/feed/posts/{postId}', {
        params: { path: { postId } },
      });
    },
    onSuccess: (_data, postId) => {
      queryClient.removeQueries({
        queryKey: feedKeys.detail(postId),
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: feedKeys.comments(postId),
        exact: true,
      });
      queryClient.removeQueries({
        queryKey: feedKeys.reaction(postId),
        exact: true,
      });
      void queryClient.invalidateQueries({ queryKey: feedKeys.list });
    },
  });
}

export function usePost(postId: string) {
  return useQuery({
    queryKey: feedKeys.detail(postId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/feed/posts/{postId}', {
        params: { path: { postId } },
      });
      return res.data?.data;
    },
  });
}

export function useComments(postId: string) {
  return useInfiniteQuery({
    queryKey: feedKeys.comments(postId),
    queryFn: async ({ pageParam }) => {
      const res = await apiClient.GET('/api/v1/feed/posts/{postId}/comments', {
        params: {
          path: { postId },
          query: { limit: COMMENTS_PAGE_LIMIT, cursor: pageParam },
        },
      });
      return res.data?.data;
    },
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage?.nextCursor ?? undefined,
  });
}

export function useCreateComment(postId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (content: string) => {
      const res = await apiClient.POST('/api/v1/feed/posts/{postId}/comments', {
        params: { path: { postId } },
        body: { content },
      });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: feedKeys.comments(postId),
      });
      void queryClient.invalidateQueries({
        queryKey: feedKeys.detail(postId),
      });
      void queryClient.invalidateQueries({ queryKey: feedKeys.list });
    },
  });
}

export function useReactionStatus(postId: string) {
  return useQuery({
    queryKey: feedKeys.reaction(postId),
    queryFn: async () => {
      const res = await apiClient.GET('/api/v1/feed/posts/{postId}/reactions', {
        params: { path: { postId } },
      });
      return res.data?.data;
    },
  });
}

function useSetReaction(postId: string, liked: boolean) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = liked
        ? await apiClient.POST('/api/v1/feed/posts/{postId}/reactions', {
            params: { path: { postId } },
          })
        : await apiClient.DELETE('/api/v1/feed/posts/{postId}/reactions', {
            params: { path: { postId } },
          });
      return res.data?.data;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: feedKeys.reaction(postId),
      });
      void queryClient.invalidateQueries({ queryKey: feedKeys.list });
      void queryClient.invalidateQueries({
        queryKey: feedKeys.detail(postId),
      });
    },
  });
}

export function useLike(postId: string) {
  return useSetReaction(postId, true);
}

export function useUnlike(postId: string) {
  return useSetReaction(postId, false);
}
