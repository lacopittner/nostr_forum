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
}

const SORT_OPTIONS: FeedSort[] = ["hot", "new", "top"];

export function FeedList({
  posts,
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
        <div className="relative overflow-hidden bg-gradient-to-br from-[var(--primary)] to-[var(--primary-light)] rounded-2xl p-6 sm:p-8 text-white shadow-lg">
          <div className="relative z-10">
            <h1 className="text-3xl sm:text-4xl font-black tracking-tighter mb-2">The Relay is Quiet...</h1>
            <p className="text-white/80 text-sm sm:text-base max-w-xl leading-relaxed">
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
                        ? "bg-[var(--primary)] text-white"
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
                        ? "bg-[var(--primary)] text-white"
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
                    sortBy === sort ? "bg-[var(--primary)] text-white" : "bg-accent/50 text-gray-400 hover:bg-accent"
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
