import { NostrProvider } from "./providers/NostrProvider";
import { AppShell } from "./components/layout/AppShell";
import { Loader2 } from "lucide-react";
import { BrowserRouter as Router, Routes, Route } from "react-router-dom";
import { ProfilePage } from "./pages/ProfilePage";
import { SearchPage } from "./pages/SearchPage";
import { ExplorePage } from "./pages/ExplorePage";
import { RelayManagementPage } from "./pages/RelayManagementPage";
import { CommunitiesPage } from "./pages/CommunitiesPage";
import { CommunityDetailPage } from "./pages/CommunityDetailPage";
import { PostDetailPage } from "./pages/PostDetailPage";
import { AboutPage } from "./pages/AboutPage";
import { CreatePost } from "./components/CreatePost";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { ConnectionStatus } from "./components/ConnectionStatus";
import { ToastContainer } from "./components/Toast";
import { FeedList } from "./components/feed/FeedList";
import { useFeed } from "./hooks/useFeed";
import { PwaBanner } from "./components/PwaBanner";

function Feed() {
  const {
    user,
    myCommunities,
    sortedPosts,
    profiles,
    commentCounts,
    sortBy,
    setSortBy,
    feedFilter,
    votingError,
    reactions,
    userVotes,
    votingIds,
    replyingTo,
    replyContent,
    setReplyContent,
    isReplyPublishing,
    isLoadingMore,
    hasMore,
    isFilterExhausted,
    isPulling,
    pullDistance,
    isRefreshing,
    refreshFeed,
    resetFeedAndLoad,
    loadMore,
    loadOlderPosts,
    toggleReply,
    cancelReply,
    handleVote,
    handleReply,
    handleEditPost,
    handleDeletePost,
    handleSetSpoiler,
    handleSetNsfw,
    handleToggleMuteUser,
    handleToggleMutePost,
    isUserMuted,
    isPostMuted,
  } = useFeed();

  return (
    <div className="space-y-6">
      {user && <CreatePost communities={myCommunities} onPostCreated={refreshFeed} />}

      {isPulling && (
        <div
          className="flex flex-col items-center justify-center py-4 transition-all"
          style={{ transform: `translateY(${Math.min(pullDistance / 2, 40)}px)` }}
        >
          <Loader2
            size={24}
            className={`text-[var(--primary)] transition-all ${isRefreshing ? "animate-spin" : ""}`}
            style={{ opacity: Math.min(pullDistance / 60, 1) }}
          />
          <span className="text-xs text-muted-foreground mt-1">
            {isRefreshing ? "Refreshing..." : "Pull to refresh"}
          </span>
        </div>
      )}

      <FeedList
        posts={sortedPosts}
        isAuthenticated={Boolean(user)}
        profiles={profiles}
        commentCounts={commentCounts}
        reactions={reactions}
        userVotes={userVotes}
        votingIds={votingIds}
        votingError={votingError}
        sortBy={sortBy}
        feedFilter={feedFilter}
        showFeedFilter={Boolean(user)}
        replyingTo={replyingTo}
        replyContent={replyContent}
        isReplyPublishing={isReplyPublishing}
        isLoadingMore={isLoadingMore}
        hasMore={hasMore}
        isFilterExhausted={isFilterExhausted}
        onSetSortBy={setSortBy}
        onFeedFilterChange={resetFeedAndLoad}
        onLoadMore={loadMore}
        onLoadOlderPosts={loadOlderPosts}
        onVote={handleVote}
        onToggleReply={toggleReply}
        onReplyContentChange={setReplyContent}
        onCancelReply={cancelReply}
        onSubmitReply={handleReply}
        onEditPost={handleEditPost}
        onDeletePost={handleDeletePost}
        onSetSpoiler={handleSetSpoiler}
        onSetNsfw={handleSetNsfw}
        onToggleMuteUser={handleToggleMuteUser}
        onToggleMutePost={handleToggleMutePost}
        isUserMuted={isUserMuted}
        isPostMuted={isPostMuted}
      />
    </div>
  );
}

function App() {
  return (
    <ErrorBoundary>
      <NostrProvider>
        <Router>
          <AppShell>
            <ConnectionStatus />
            <ToastContainer />
            <PwaBanner />
            <Routes>
              <Route path="/" element={<Feed />} />
              <Route path="/explore" element={<ExplorePage />} />
              <Route path="/post/:postId" element={<PostDetailPage />} />
              <Route path="/profile/:pubkey" element={<ProfilePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/about" element={<AboutPage />} />
              <Route path="/relays" element={<RelayManagementPage />} />
              <Route path="/communities" element={<CommunitiesPage />} />
              <Route path="/community/:pubkey/:communityId" element={<CommunityDetailPage />} />
            </Routes>
          </AppShell>
        </Router>
      </NostrProvider>
    </ErrorBoundary>
  );
}

export default App;
