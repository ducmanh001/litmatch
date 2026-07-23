import { FriendsList } from '../../../features/friend-chat/components/friends-list';

import type { Metadata } from 'next';
import { MatchIcon } from '../../../shared/ui/icons';
import { PageHeader } from '../../../shared/ui/page-header';

export const metadata: Metadata = { title: 'Tin nhắn' };

export default function FriendsPage() {
  return (
    /*
      1. Section bao ngoài:
         - Mobile: h-auto (chạy chiều cao tự nhiên)
         - PC (md:): h-[calc(100dvh-5.5rem)] để ép khung chat khớp màn hình PC
    */
    <section className="mx-auto flex h-auto w-full max-w-[1040px] flex-col min-w-0 px-4 md:h-[calc(100dvh-5.5rem)] md:px-5">
      {/* Container bọc Header + Chat (Giới hạn max-w-2xl cho cả 2 thiết bị) */}
      <div className="mx-auto flex w-full max-w-2xl flex-1 flex-col min-h-0">
        {/* 1. Header (Không bị co) */}
        <div className="shrink-0 ">
          <PageHeader
            eyebrow="Kết nối có chủ đích"
            eyebrowIcon={<MatchIcon width={16} height={16} />}
          />
        </div>

        {/*
          2. Khung Chat:
             - Mobile: Không bg, không border, không rounded, không shadow.
             - PC (md:): Bật full background surf/white, rounded-2xl, border & shadow.
        */}
        <div
          className="flex flex-1 flex-col min-h-0 overflow-hidden
                        md:rounded-2xl md:border md:border-black/5 md:bg-white md:p-4 md:shadow-sm md:shadow-black/[0.02]
                        md:dark:border-white/5 md:dark:bg-surf md:dark:text-white md:dark:shadow-black/20 rounded-2xl"
        >
          <div className="flex-1 min-h-0 overflow-y-auto">
            <FriendsList />
          </div>
        </div>
      </div>
    </section>
  );
}
