import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { ArrowBigUp, ArrowBigDown, ArrowLeft, UserPlus, UserCheck } from "lucide-react";

export function ProfilePage() {
  const { pubkey: paramPubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const { ndk, user } = useNostr();
  const [profile, setProfile] = useState<any>(null);
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [following, setFollowing] = useState<string[]>([]);
  const [isFollowing, setIsFollowing] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const seenEventIds = useRef(new Set<string>());

  const profilePubkey = paramPubkey || user?.pubkey;

  useEffect(() => {
    if (!profilePubkey || !ndk) return;

    setIsLoading(true);
    
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

    // Fetch contacts (following/followers)
    ndk.subscribe(
      { kinds: [3], authors: [profilePubkey] },
      { closeOnEose: true }
    ).on("event", (event: NDKEvent) => {
      const contacts = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
      setFollowing(contacts);
    });

    // If viewing someone else, check if we follow them
    if (user && profilePubkey !== user.pubkey) {
      ndk.subscribe(
        { kinds: [3], authors: [user.pubkey] },
        { closeOnEose: true }
      ).on("event", (event: NDKEvent) => {
        const contacts = event.tags.filter((t) => t[0] === "p").map((t) => t[1]);
        setIsFollowing(contacts.includes(profilePubkey));
      });
    }

    setTimeout(() => setIsLoading(false), 500);

    return () => {
      postSub.stop();
    };
  }, [profilePubkey, ndk, user]);

  const handleFollow = async () => {
    if (!user || !profilePubkey) return;

    try {
      const event = new NDKEvent(ndk);
      event.kind = 3;
      event.tags = isFollowing
        ? following.filter((p) => p !== profilePubkey).map((p) => ["p", p])
        : [...following.map((p) => ["p", p]), ["p", profilePubkey]];

      await event.publish();
      setIsFollowing(!isFollowing);
    } catch (error) {
      console.error("Failed to follow/unfollow", error);
    }
  };

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
              <span><strong>{following.length}</strong> following</span>
            </div>
          </div>

          {user && profilePubkey !== user.pubkey && (
            <button
              onClick={handleFollow}
              className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-full font-bold text-sm hover:bg-orange-700 transition-all"
            >
              {isFollowing ? (
                <>
                  <UserCheck size={16} />
                  Following
                </>
              ) : (
                <>
                  <UserPlus size={16} />
                  Follow
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Posts */}
      <div className="space-y-4">
        <h2 className="text-lg font-bold">Posts</h2>
        {posts.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            No posts yet
          </div>
        ) : (
          posts.map((post) => (
            <div key={post.id} className="bg-card border rounded-xl shadow-sm p-4">
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
    </div>
  );
}
