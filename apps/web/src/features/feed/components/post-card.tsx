'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState } from 'react';

import { useCurrentUser } from '../../../shared/auth/use-current-user';
import { confirmAction } from '../../../shared/lib/confirm-store';
import { formatRelativeTime } from '../../../shared/lib/format-relative-time';
import { showToast } from '../../../shared/lib/toast-store';
import { useDeletePost, usePostAuthor } from '../api';
import { LikeButton } from './like-button';
import { PostAuthorAvatar } from './post-author-avatar';

import type { PostDto } from '../api';
import type { SVGProps } from 'react';

function CommentIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" />
    </svg>
  );
}

function ShareIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M4 12v7a2 2 0 002 2h12a2 2 0 002-2v-7" />
      <path d="M16 6l-4-4-4 4M12 2v14" />
    </svg>
  );
}

function MoreIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={18}
      height={18}
      viewBox="0 0 24 24"
      fill="currentColor"
      {...props}
    >
      <circle cx="5" cy="12" r="2" />
      <circle cx="12" cy="12" r="2" />
      <circle cx="19" cy="12" r="2" />
    </svg>
  );
}

function TrashIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={15}
      height={15}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      <path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6" />
    </svg>
  );
}

const AUDIENCE_LABEL: Record<PostDto['audience'], string> = {
  public: 'Công khai',
  friends: 'Bạn bè',
  only_me: 'Chỉ mình tôi',
};

const POST_CONTENT_PREVIEW_CHARACTERS = 280;
const POST_CONTENT_PREVIEW_LINES = 6;

function AudienceIcon({
  audience,
  ...props
}: SVGProps<SVGSVGElement> & { audience: PostDto['audience'] }) {
  return (
    <svg
      width={13}
      height={13}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {audience === 'public' && (
        <>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18" />
        </>
      )}
      {audience === 'friends' && (
        <>
          <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
          <circle cx="9" cy="7" r="4" />
          <path d="M22 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75" />
        </>
      )}
      {audience === 'only_me' && (
        <>
          <rect x="4" y="10" width="16" height="11" rx="2" />
          <path d="M8 10V7a4 4 0 018 0v3" />
        </>
      )}
    </svg>
  );
}

/** Menu "..." chỉ có tác dụng thật cho bài của chính mình (xoá bài, DELETE thật) — bài người
 * khác chưa có endpoint report theo postId (safety/reports chỉ nhận targetUserId), không bịa. */
function PostMenu({ postId, isOwner }: { postId: string; isOwner: boolean }) {
  const [open, setOpen] = useState(false);
  const deletePost = useDeletePost();
  const disclosureId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const deleteButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) deleteButtonRef.current?.focus();
  }, [open]);

  if (!isOwner) return null;

  const onDelete = async () => {
    setOpen(false);
    const confirmed = await confirmAction({
      title: 'Xoá bài viết?',
      message: 'Bài viết sẽ bị xoá vĩnh viễn khỏi Bảng tin.',
      actionLabel: 'Xoá',
      tone: 'danger',
    });
    if (!confirmed) return;
    deletePost.mutate(postId, {
      onSuccess: () => showToast('Đã xoá bài viết'),
      onError: () => showToast('Không thể xoá bài viết, thử lại.', 'warn'),
    });
  };

  return (
    <div
      className="relative"
      onKeyDown={(event) => {
        if (event.key !== 'Escape' || !open) return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        aria-label="Tuỳ chọn bài viết"
        aria-controls={disclosureId}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex h-8 w-8 items-center justify-center rounded-full text-slate-400 transition hover:bg-black/5 hover:text-slate-600 dark:hover:bg-white/5 dark:hover:text-slate-300"
      >
        <MoreIcon />
      </button>
      {open && (
        <>
          <button
            type="button"
            aria-label="Đóng menu"
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
          />
          <div
            id={disclosureId}
            aria-label="Tuỳ chọn bài viết"
            className="absolute right-0 top-9 z-20 w-40 overflow-hidden rounded-xl border border-black/5 bg-white py-1 shadow-xl shadow-black/10 dark:border-white/10 dark:bg-surf2"
          >
            <button
              ref={deleteButtonRef}
              type="button"
              onClick={() => void onDelete()}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm font-semibold text-rose-500 hover:bg-rose-500/10"
            >
              <TrashIcon /> Xoá bài viết
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export function PostCard({
  post,
  commentHref = `/feed/${post.id}`,
}: {
  post: PostDto;
  commentHref?: string;
}) {
  const { data: currentUser } = useCurrentUser();
  const author = usePostAuthor(post.authorUserId);
  const [contentExpanded, setContentExpanded] = useState(false);
  const contentRef = useRef<HTMLParagraphElement>(null);
  const authorNickname = author.data?.nickname ?? 'Thành viên Litmatch';
  const contentLikelyOverflows =
    post.content !== null &&
    (post.content.length > POST_CONTENT_PREVIEW_CHARACTERS ||
      post.content.split(/\r?\n/).length > POST_CONTENT_PREVIEW_LINES);
  const [contentOverflows, setContentOverflows] = useState(
    contentLikelyOverflows,
  );
  const [contentMeasured, setContentMeasured] = useState(false);
  const contentNeedsClamp = contentMeasured
    ? contentOverflows
    : contentLikelyOverflows;
  const shouldClamp =
    post.content !== null &&
    !contentExpanded &&
    (!contentMeasured || contentOverflows);

  useEffect(() => {
    if (contentExpanded || post.content === null) return;

    const measureOverflow = () => {
      const content = contentRef.current;
      if (content === null || content.clientHeight === 0) return;
      setContentOverflows(content.scrollHeight > content.clientHeight + 1);
      setContentMeasured(true);
    };

    measureOverflow();
    window.addEventListener('resize', measureOverflow);
    const observer =
      typeof ResizeObserver === 'undefined'
        ? null
        : new ResizeObserver(measureOverflow);
    if (contentRef.current !== null) observer?.observe(contentRef.current);

    return () => {
      window.removeEventListener('resize', measureOverflow);
      observer?.disconnect();
    };
  }, [contentExpanded, post.content]);

  const onShare = async () => {
    const url = `${window.location.origin}/feed/${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      showToast('Đã sao chép liên kết bài viết');
    } catch {
      showToast('Không thể sao chép liên kết, thử lại.', 'warn');
    }
  };

  return (
    <article className="overflow-hidden rounded-2xl border border-black/5 bg-white px-4 pt-4 pb-1 shadow-sm shadow-black/[0.02] transition hover:border-black/10 dark:border-white/5 dark:bg-surf dark:shadow-black/20 dark:hover:border-white/10">
      <div className="mb-3.5 flex items-center gap-3">
        <PostAuthorAvatar seed={post.authorUserId} nickname={authorNickname} />
        <div className="min-w-0 flex-1">
          <p
            className="truncate text-sm font-bold"
            aria-busy={author.isPending}
          >
            {authorNickname}
          </p>
          <div className="mt-0.5 flex min-w-0 items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400">
            <time dateTime={post.createdAt}>
              {formatRelativeTime(post.createdAt)}
            </time>
            <span aria-hidden>·</span>
            <span className="inline-flex items-center gap-1">
              <AudienceIcon audience={post.audience} />
              {AUDIENCE_LABEL[post.audience]}
            </span>
          </div>
        </div>
        <PostMenu
          postId={post.id}
          isOwner={currentUser?.id === post.authorUserId}
        />
      </div>
      {post.content !== null && (
        <div className="mb-3.5">
          <p
            ref={contentRef}
            className={`whitespace-pre-wrap [overflow-wrap:anywhere] text-[15px] leading-6 text-foreground ${
              shouldClamp ? 'line-clamp-6' : ''
            }`}
          >
            {post.content}
          </p>
          {contentNeedsClamp && (
            <button
              type="button"
              aria-expanded={contentExpanded}
              onClick={() => setContentExpanded((value) => !value)}
              className="mt-1 text-xs font-bold text-irisl transition hover:opacity-80"
            >
              {contentExpanded ? 'Thu gọn' : 'Xem thêm'}
            </button>
          )}
        </div>
      )}
      {post.imageUrl !== null && (
        // Ảnh từ URL người dùng tự nhập, domain bất kỳ — next/image cần remotePatterns cấu
        // hình trước (docs/13 § 13.9), wildcard domain ở đây sẽ mở SSRF qua image proxy nên
        // dùng <img> thuần cho luồng test này.
        <img
          src={post.imageUrl}
          alt="Ảnh bài viết"
          loading="lazy"
          decoding="async"
          className="mb-2 max-h-[520px] w-full rounded-2xl bg-black/5 object-cover dark:bg-white/5"
        />
      )}
      <div className="flex items-center justify-between gap-3 px-1 py-2 text-xs text-slate-500 dark:text-slate-400">
        <span>
          <span className="font-bold text-foreground">{post.likeCount}</span>{' '}
          lượt thích
        </span>
        <Link href={commentHref} className="transition hover:text-irisl">
          <span className="font-bold text-foreground">{post.commentCount}</span>{' '}
          bình luận
        </Link>
      </div>
      <div className="grid grid-cols-3 border-t border-black/5 dark:border-white/5">
        <LikeButton postId={post.id} fallbackLikeCount={post.likeCount} />
        <Link
          href={commentHref}
          aria-label={`Bình luận bài viết, ${post.commentCount} bình luận`}
          className="flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-black/5 hover:text-irisl dark:text-slate-400 dark:hover:bg-white/5"
        >
          <CommentIcon />
          <span>Bình luận</span>
        </Link>
        <button
          type="button"
          onClick={() => void onShare()}
          aria-label="Chia sẻ bài viết"
          className="flex min-w-0 items-center justify-center gap-2 rounded-xl px-2 py-2.5 text-sm font-semibold text-slate-500 transition hover:bg-black/5 hover:text-irisl dark:text-slate-400 dark:hover:bg-white/5"
        >
          <ShareIcon />
          <span>Chia sẻ</span>
        </button>
      </div>
    </article>
  );
}
