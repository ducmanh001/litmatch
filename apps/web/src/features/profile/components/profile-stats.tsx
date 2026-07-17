'use client';

import Link from 'next/link';

import { useFriends } from '../../friend-chat/api';
import { useWallet } from '../../wallet/api';

/**
 * Không có endpoint tổng số bài viết (PostsPageDto chỉ có cursor pagination, không có
 * total) — chỉ hiển thị 2 số thật (Diamond từ ví, Bạn bè từ danh sách bạn bè), không dựng số
 * "Bài viết" giả bằng độ dài trang đầu tiên.
 */
export function ProfileStats() {
  const wallet = useWallet();
  const friends = useFriends();

  const balance = wallet.data?.balance;
  const friendCount = friends.data?.length;

  if (balance === undefined && friendCount === undefined) {
    return null;
  }

  return (
    <div className="mb-6 grid grid-cols-2 gap-3">
      {balance !== undefined && (
        <Link
          href="/wallet"
          className="rounded-2xl border border-black/5 bg-white py-3 text-center dark:border-white/5 dark:bg-surf"
        >
          <p className="text-sm font-extrabold text-sky-600 dark:text-diamond">
            {balance}
          </p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Diamond
          </p>
        </Link>
      )}
      {friendCount !== undefined && (
        <Link
          href="/friends"
          className="rounded-2xl border border-black/5 bg-white py-3 text-center dark:border-white/5 dark:bg-surf"
        >
          <p className="text-sm font-extrabold">{friendCount}</p>
          <p className="text-[11px] text-slate-500 dark:text-slate-400">
            Bạn bè
          </p>
        </Link>
      )}
    </div>
  );
}
