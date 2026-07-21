import { useComments } from '../api';
import { ContentCommentList } from '../../../shared/ui/content-comment-list';

export function CommentList({ postId }: { postId: string }) {
  const comments = useComments(postId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = comments;

  const items = comments.data?.pages.flatMap((page) => page?.items ?? []) ?? [];

  return (
    <ContentCommentList
      comments={items}
      error={comments.error}
      isPending={comments.isPending}
      hasNextPage={hasNextPage}
      isFetchingNextPage={isFetchingNextPage}
      onLoadMore={() => void fetchNextPage()}
      variant="card"
    />
  );
}
