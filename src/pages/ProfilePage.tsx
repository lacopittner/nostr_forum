import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { ArrowBigUp, ArrowBigDown, ArrowLeft, Bookmark } from "lucide-react";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { useFollows } from "../hooks/useFollows";
import { ZapButton } from "../components/ZapButton";
import { FollowButton } from "../components/FollowButton";
import { EmptyState } from "../components/EmptyState";
import { NDKProfile } from "../lib/types";

export function ProfilePage() {
  const { pubkey: paramPubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const { ndk, user } = useNostr();
  const { savedPosts, unsavePost } = useSavedPosts();
  const { followingCount, followersCount } = useFollows();
  const [profile, setProfile] = useState<NDKProfile | null>(null);
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"posts" | "saved">("posts");

  const seenEventIds = useRef(new Set<string>());

  const profilePubkey = paramPubkey || user?.pubkey;
  const isOwnProfile = user?.pubkey === profilePubkey;

  useEffect(() => {
    if (!profilePubkey || !ndk) return;

    setIsLoading(true);
    seenEventIds.current.clear();
    setPosts([]);
    
    // Fetch profile metadata
    ndk.getUser({ pubkey: profilePubkey }).fetchProfile().then((p) => {
      setProfile(p);
    });

    // Fetch user's posts
    const postSub = ndk.subscribe(
      { kinds: [NDKKind.Text], authors: [profilePubkey], limit: 50 },
      { closeOnEose: true }
    );

    postSub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);

      setPosts((prev) => {
        const newPosts = [event, ...prev].sort((a, b) => b.created_at! - a.created_at!);
        return newPosts.slice(0, 50);
      });
    });

    setTimeout(() => setIsLoading(false), 500);

    return () => {
      postSub.stop();
    };
  }, [profilePubkey, ndk, user]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-orange-600 hover:text-orange-700 font-bold"
      >
        <ArrowLeft size={20} />
        Back
      </button>

      {/* Profile Card */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        {profile?.banner && (
          <img
            src={profile.banner}
            alt="banner"
            className="w-full h-40 object-cover rounded-lg mb-4"
          />
        )}
        <div className="flex items-start gap-4">
          {profile?.image && (
            <img
              src={profile.image}
              alt="profile"
              className="w-20 h-20 rounded-lg object-cover"
            />
          )}
          <div className="flex-1">
            <h1 className="text-2xl font-black text-foreground">
              {profile?.displayName || profile?.name || profilePubkey?.slice(0, 8)}
            </h1>
            <p className="text-sm text-muted-foreground">{profilePubkey?.slice(0, 16)}...</p>
            {profile?.about && (
              <p className="text-sm text-foreground mt-2">{profile.about}</p>
            )}
            <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
              <span><strong>{posts.length}</strong> posts</span>
              <span><strong>{isOwnProfile ? followingCount : '...'}</strong> following</span>
              <span><strong>{isOwnProfile ? followersCount : '...'}</strong> followers</span>
            </div>
          </div>

          {user && profilePubkey !== user.pubkey && (
            <div className="flex items-center gap-2">
              <FollowButton pubkey={profilePubkey!} size="md" />
              
              <ZapButton 
                targetPubkey={profilePubkey!} 
                size="md"
                showAmount={false}
              />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b">
        <button
          onClick={() => setActiveTab("posts")}
          className={`px-4 py-2 font-bold text-sm transition-colors ${
            activeTab === "posts"
              ? "text-orange-600 border-b-2 border-orange-600"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          Posts ({posts.length})
        </button>
        
        {isOwnProfile && (
          <button
            onClick={() => setActiveTab("saved")}
            className={`flex items-center gap-2 px-4 py-2 font-bold text-sm transition-colors ${
              activeTab === "saved"
                ? "text-orange-600 border-b-2 border-orange-600"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            <Bookmark size={16} />
            Saved ({savedPosts.length})
          </button>
        )}
      </div>

      {/* Posts Tab */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          {posts.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No posts yet"
              description={isOwnProfile 
                ? "You haven't created any posts yet. Start sharing your thoughts!"
                : "This user hasn't created any posts yet."
              }
              action={isOwnProfile ? {
                label: "Create Post",
                onClick: () => navigate("/")
              } : undefined}
            />
          ) : (
            posts.map((post) => (
              <div 
                key={post.id} 
                className="bg-card border rounded-xl shadow-sm p-4 hover:border-orange-500/20 transition-all cursor-pointer"
                onClick={() => navigate(`/post/${post.id}`)}
              >
                <div className="flex gap-3">
                  <div className="w-10 flex flex-col items-center space-y-1">
                    <ArrowBigUp size={20} className="text-muted-foreground" />
                    <span className="text-xs font-bold">0</span>
                    <ArrowBigDown size={20} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">
                      {new Date(post.created_at! * 1000).toLocaleString()}
                    </p>
                    <p className="text-foreground whitespace-pre-wrap">{post.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Saved Tab */}
      {activeTab === "saved" && isOwnProfile && (
        <div className="space-y-4">
          {savedPosts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Bookmark size={48} className="mx-auto mb-4 opacity-30" />
              <p>No saved posts yet</p>
              <p className="text-sm mt-2">Save posts to view them here</p>
            </div>
          ) : (
            savedPosts.map((savedPost) => (
              <div 
                key={savedPost.postId} 
                className="bg-card border rounded-xl shadow-sm p-4 hover:border-orange-500/20 transition-all cursor-pointer"
                onClick={() => navigate(`/post/${savedPost.postId}`)}
              >
                <div className="flex justify-between items-start mb-2">
                  <div className="flex items-center gap-2 text-sm text-muted-foreground">
                    <span className="font-mono">{savedPost.authorPubkey.slice(0, 12)}...</span>
                    <span>•</span>
                    <span>Saved {new Date(savedPost.savedAt).toLocaleDateString()}</span>
                  </div>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      unsavePost(savedPost.postId);
                    }}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                    title="Remove from saved"
                  >
                    <Bookmark size={16} fill="currentColor" />
                  </button>
                </div>
                
                <p className="text-foreground whitespace-pre-wrap line-clamp-3">{savedPost.postContent}</p>
                
                {savedPost.note && (
                  <p className="text-xs text-orange-500 mt-2">Note: {savedPost.note}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
