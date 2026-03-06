import { useCallback } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { AlertCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { InfiniteScroll } from "../InfiniteScroll";
import { FeedItem } from "./FeedItem";
import { NDKProfile } from "../../lib/types";
import type { FeedFilter, FeedSort } from "../../hooks/useFeed";

interface FeedListProps {
  posts: NDKEvent[];
  isAuthenticated: boolean;
  profiles: Record<string, NDKProfile>;
  commentCounts: Record<string, number>;
  reactions: Record<string, number>;
  userVotes: Record<string, "UPVOTE" | "DOWNVOTE" | null>;
  votingIds: Set<string>;
  votingError: string | null;
  sortBy: FeedSort;
  feedFilter: FeedFilter;
  showFeedFilter: boolean;
  replyingTo: string | null;
  replyContent: string;
  isReplyPublishing: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  isFilterExhausted: boolean;
  onSetSortBy: (sort: FeedSort) => void;
  onFeedFilterChange: (nextFilter: FeedFilter) => void;
  onLoadMore: () => void;
  onLoadOlderPosts: () => void;
  onVote: (post: NDKEvent, type: "UPVOTE" | "DOWNVOTE") => void;
  onToggleReply: (postId: string) => void;
  onReplyContentChange: (value: string) => void;
  onCancelReply: () => void;
  onSubmitReply: (post: NDKEvent) => void;
  onEditPost: (postId: string, newContent: string) => Promise<void> | void;
  onDeletePost: (postId: string) => Promise<void> | void;
  onToggleMuteUser: (pubkey: string) => Promise<void> | void;
  onToggleMutePost: (postId: string) => Promise<void> | void;
  isUserMuted: (pubkey: string) => boolean;
  isPostMuted: (postId: string) => boolean;
}

const SORT_OPTIONS: FeedSort[] = ["hot", "new", "top"];

export function FeedList({
  posts,
  isAuthenticated,
  profiles,
  commentCounts,
  reactions,
  userVotes,
  votingIds,
  votingError,
  sortBy,
  feedFilter,
  showFeedFilter,
  replyingTo,
  replyContent,
  isReplyPublishing,
  isLoadingMore,
  hasMore,
  isFilterExhausted,
  onSetSortBy,
  onFeedFilterChange,
  onLoadMore,
  onLoadOlderPosts,
  onVote,
  onToggleReply,
  onReplyContentChange,
  onCancelReply,
  onSubmitReply,
  onEditPost,
  onDeletePost,
  onToggleMuteUser,
  onToggleMutePost,
  isUserMuted,
  isPostMuted,
}: FeedListProps) {
  const navigate = useNavigate();

  const handleOpenPost = useCallback(
    (postId: string) => {
      navigate(`/post/${postId}`);
    },
    [navigate]
  );

  const handleFeedFilterClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const nextFilter = event.currentTarget.dataset.filter as FeedFilter | undefined;
      if (!nextFilter) return;
      onFeedFilterChange(nextFilter);
    },
    [onFeedFilterChange]
  );

  const handleSortClick = useCallback(
    (event: ReactMouseEvent<HTMLButtonElement>) => {
      const nextSort = event.currentTarget.dataset.sort as FeedSort | undefined;
      if (!nextSort) return;
      onSetSortBy(nextSort);
    },
    [onSetSortBy]
  );

  return (
    <div className="space-y-4">
      {votingError && (
        <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
          <AlertCircle size={16} />
          <span>{votingError}</span>
        </div>
      )}

      {posts.length === 0 && !isLoadingMore && (
        <div className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/85 p-6 sm:p-8 shadow-[0_28px_62px_-45px_rgba(0,0,0,0.92)]">
          <div className="pointer-events-none absolute -left-14 top-0 h-44 w-44 rounded-full bg-[var(--primary)]/16 blur-3xl" />
          <div className="pointer-events-none absolute -right-20 bottom-0 h-48 w-48 rounded-full bg-cyan-400/14 blur-3xl" />
          <div className="relative z-10">
            <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">No active threads</p>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-foreground sm:text-4xl">The Relay is Quiet...</h1>
            <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
              No posts yet. Add relays in Relay Management and be the first to start the conversation.
            </p>
          </div>
        </div>
      )}

      {posts.length > 0 && (
        <div className="flex items-center justify-between bg-card border rounded-xl p-3 shadow-sm">
          <div className="flex items-center gap-4">
            {showFeedFilter && (
              <div className="flex items-center gap-2">
                <span className="text-sm font-bold text-gray-400">Feed:</span>
                <div className="flex items-center gap-1">
                  <button
                    data-filter="all"
                    onClick={handleFeedFilterClick}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                      feedFilter === "all"
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "bg-accent/50 text-gray-400 hover:bg-accent"
                    }`}
                  >
                    All
                  </button>
                  <button
                    data-filter="following"
                    onClick={handleFeedFilterClick}
                    className={`px-4 py-1.5 rounded-full text-sm font-bold transition-all ${
                      feedFilter === "following"
                        ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                        : "bg-accent/50 text-gray-400 hover:bg-accent"
                    }`}
                  >
                    Following
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-gray-400">Sort:</span>
            <div className="flex items-center gap-1">
              {SORT_OPTIONS.map((sort) => (
                <button
                  key={sort}
                  data-sort={sort}
                  onClick={handleSortClick}
                  className={`px-4 py-1.5 rounded-full text-sm font-bold capitalize transition-all ${
                    sortBy === sort ? "bg-[var(--primary)] text-[var(--primary-foreground)]" : "bg-accent/50 text-gray-400 hover:bg-accent"
                  }`}
                >
                  {sort}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <InfiniteScroll
        onLoadMore={onLoadMore}
        hasMore={hasMore}
        isLoading={isLoadingMore}
        noMoreText={isFilterExhausted ? "Reached scan limit. You can load older posts manually." : "No more posts"}
      >
        <div className="flex flex-col space-y-2">
          {posts.map((post) => (
            <FeedItem
              key={post.id}
              post={post}
              isAuthenticated={isAuthenticated}
              profile={profiles[post.pubkey]}
              reactionScore={reactions[post.id] || 0}
              userVote={userVotes[post.id]}
              isVoting={votingIds.has(post.id)}
              commentCount={commentCounts[post.id] || 0}
              isReplying={replyingTo === post.id}
              replyContent={replyContent}
              isReplyPublishing={isReplyPublishing}
              onOpenPost={handleOpenPost}
              onVote={onVote}
              onToggleReply={onToggleReply}
              onReplyContentChange={onReplyContentChange}
              onCancelReply={onCancelReply}
              onSubmitReply={onSubmitReply}
              onEditPost={onEditPost}
              onDeletePost={onDeletePost}
              onToggleMuteUser={onToggleMuteUser}
              onToggleMutePost={onToggleMutePost}
              isAuthorMuted={isUserMuted(post.pubkey)}
              isPostMuted={isPostMuted(post.id)}
            />
          ))}
        </div>
      </InfiniteScroll>

      {isFilterExhausted && !isLoadingMore && (
        <div className="flex justify-center">
          <button
            onClick={onLoadOlderPosts}
            className="px-4 py-2 rounded-full border border-border bg-accent/40 hover:bg-accent text-sm font-bold transition-colors"
          >
            Load older posts
          </button>
        </div>
      )}
    </div>
  );
}
