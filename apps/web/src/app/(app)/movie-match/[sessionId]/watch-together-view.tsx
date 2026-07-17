'use client';

import { isApiError } from '@litmatch/api-client';

import { FriendAvatar } from '../../../../features/friend-chat/components/friend-avatar';
import { MessageComposer } from '../../../../features/friend-chat/components/message-composer';
import { MessageList } from '../../../../features/friend-chat/components/message-list';
import {
  useConversationWithFriend,
  usePartnerProfile,
} from '../../../../features/friend-chat/api';
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
  const partner = usePartnerProfile(partnerUserId ?? '');
  const conversation = useConversationWithFriend(partnerUserId ?? '', {
    enabled: partnerUserId !== undefined,
  });
  const isActive = session.data?.status === 'active';

  return (
    <div className="flex flex-1 flex-col">
      {isActive && partner.data !== undefined && (
        <div className="flex items-center gap-3 px-5 pb-3">
          <FriendAvatar
            userId={partner.data.id}
            nickname={partner.data.nickname}
            size={36}
          />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold">
              {partner.data.nickname}
            </p>
            <p className="truncate text-xs text-slate-500 dark:text-slate-400">
              Đang xem chung
            </p>
          </div>
        </div>
      )}
      <MovieSessionView sessionId={sessionId} />

      {partnerUserId !== undefined && isActive && (
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
