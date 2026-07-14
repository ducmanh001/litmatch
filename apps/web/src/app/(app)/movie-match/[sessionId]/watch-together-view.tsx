'use client';

import { isApiError } from '@litmatch/api-client';

import { MessageComposer } from '../../../../features/friend-chat/components/message-composer';
import { MessageList } from '../../../../features/friend-chat/components/message-list';
import { useConversationWithFriend } from '../../../../features/friend-chat/api';
import { useSession } from '../../../../features/movie-match/api';
import { MovieSessionView } from '../../../../features/movie-match/components/movie-session-view';

/**
 * Composition ở tầng ROUTE (không phải trong `features/movie-match`) — 1 feature không được
 * import feature khác trực tiếp (docs/13 §13.3), nhưng route thì được phép ghép nhiều feature,
 * đúng tinh thần `app/(app)/home/page.tsx` ghép `party-room` + `wallet`. Chat trong lúc xem
 * TÁI DÙNG thẳng Friend Chat có sẵn (`MessageList`/`MessageComposer`, keyed theo
 * `partnerUserId`), không dựng message system riêng cho Movie Match (docs/services/
 * movie-match-service.md §2 — module này không có bảng message riêng).
 */
export function WatchTogetherView({ sessionId }: { sessionId: string }) {
  const session = useSession(sessionId);
  const partnerUserId = session.data?.partnerUserId;
  const conversation = useConversationWithFriend(partnerUserId ?? '', {
    enabled: partnerUserId !== undefined,
  });

  return (
    <div className="flex flex-1 flex-col">
      <MovieSessionView sessionId={sessionId} />

      {partnerUserId !== undefined && session.data?.status === 'active' && (
        <div className="mt-2 flex flex-1 flex-col border-t border-black/5 pt-3 dark:border-white/5">
          {conversation.isPending && (
            <p className="px-5 text-sm text-slate-500 dark:text-slate-400">
              Đang tải trò chuyện…
            </p>
          )}
          {conversation.isError && (
            <p role="alert" className="px-5 text-sm text-destructive">
              {isApiError(conversation.error)
                ? conversation.error.message
                : 'Không tải được trò chuyện.'}
            </p>
          )}
          {conversation.data !== undefined && (
            <>
              <div className="flex-1 overflow-y-auto px-5">
                <MessageList conversationId={conversation.data.id} />
              </div>
              <div className="px-5 py-3">
                <MessageComposer conversationId={conversation.data.id} />
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
