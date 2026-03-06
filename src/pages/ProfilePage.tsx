import { useState, useEffect, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useNostr } from "../providers/NostrProvider";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import {
  ArrowBigUp,
  ArrowBigDown,
  ArrowLeft,
  Bookmark,
  MessageSquare,
  Loader2,
  Pencil,
  X,
  Globe,
  Zap,
  UserX,
} from "lucide-react";
import { useSavedPosts } from "../hooks/useSavedPosts";
import { useFollows } from "../hooks/useFollows";
import { useNip05 } from "../hooks/useNip05";
import { useGlobalBlocks } from "../hooks/useGlobalBlocks";
import { ZapButton } from "../components/ZapButton";
import { FollowButton } from "../components/FollowButton";
import { EmptyState } from "../components/EmptyState";
import { NDKProfile } from "../lib/types";
import { useToast } from "../lib/toast";
import { logger } from "../lib/logger";

interface ProfileFormState {
  name: string;
  displayName: string;
  about: string;
  website: string;
  nip05: string;
  lud16: string;
  image: string;
  banner: string;
}

type ProfileTab = "posts" | "comments" | "saved" | "muted" | "upvoted" | "downvoted";

const EDITABLE_PROFILE_KEYS = new Set([
  "name",
  "displayName",
  "display_name",
  "about",
  "bio",
  "website",
  "nip05",
  "lud16",
  "lud06",
  "image",
  "picture",
  "banner",
]);

const createProfileFormState = (profile: NDKProfile | null): ProfileFormState => ({
  name: profile?.name || "",
  displayName: profile?.displayName || "",
  about: profile?.about || profile?.bio || "",
  website: profile?.website || "",
  nip05: profile?.nip05 || "",
  lud16: profile?.lud16 || "",
  image: profile?.image || "",
  banner: profile?.banner || "",
});

const normalizeOptionalUrl = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) return "";

  const withProtocol = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;

  try {
    return new URL(withProtocol).toString();
  } catch {
    return null;
  }
};

const normalizeOptionalField = (value: string): string | undefined => {
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const getExternalWebsiteUrl = (website: string): string => {
  if (/^https?:\/\//i.test(website)) return website;
  return `https://${website}`;
};

const compactWebsiteLabel = (website: string): string => {
  return website.replace(/^https?:\/\//i, "").replace(/\/$/, "");
};

export function ProfilePage() {
  const { pubkey: paramPubkey } = useParams<{ pubkey: string }>();
  const navigate = useNavigate();
  const { ndk, user } = useNostr();
  const { success, error: showError } = useToast();
  const { savedPosts, unsavePost } = useSavedPosts();
  const { followingCount, followersCount } = useFollows();
  const { verification, checkProfileNip05 } = useNip05();
  const {
    blockedPubkeys,
    mutedHashtags,
    mutedEvents,
    mutedCount,
    unblockUser,
    unmuteTag,
    unmuteEvent,
  } = useGlobalBlocks();
  const [profile, setProfile] = useState<NDKProfile | null>(null);
  const [posts, setPosts] = useState<NDKEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<ProfileTab>("posts");
  const [unblockingPubkeys, setUnblockingPubkeys] = useState<Set<string>>(new Set());
  const [unmutingTags, setUnmutingTags] = useState<Set<string>>(new Set());
  const [unmutingEvents, setUnmutingEvents] = useState<Set<string>>(new Set());
  const [isEditingProfile, setIsEditingProfile] = useState(false);
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [profileUpdateError, setProfileUpdateError] = useState<string | null>(null);
  const [profileForm, setProfileForm] = useState<ProfileFormState>(() =>
    createProfileFormState(null)
  );

  const seenEventIds = useRef(new Set<string>());

  const profilePubkey = paramPubkey || user?.pubkey;
  const isOwnProfile = user?.pubkey === profilePubkey;
  const isGloballyBlockedProfile =
    !!profilePubkey && !isOwnProfile && blockedPubkeys.has(profilePubkey);

  useEffect(() => {
    if (!profilePubkey || !ndk) return;
    if (isGloballyBlockedProfile) {
      setIsLoading(false);
      setPosts([]);
      return;
    }

    let isActive = true;
    setIsLoading(true);
    setProfile(null);
    seenEventIds.current.clear();
    setPosts([]);

    void ndk
      .getUser({ pubkey: profilePubkey })
      .fetchProfile()
      .then((p) => {
        if (!isActive) return;
        setProfile((p as NDKProfile | null) || null);
      })
      .catch((error) => {
        logger.error("Failed to fetch profile metadata", error);
      });

    const postSub = ndk.subscribe(
      { kinds: [NDKKind.Text], authors: [profilePubkey], limit: 50 },
      { closeOnEose: true }
    );

    postSub.on("event", (event: NDKEvent) => {
      if (seenEventIds.current.has(event.id)) return;
      seenEventIds.current.add(event.id);

      setPosts((prev) => {
        const newPosts = [event, ...prev].sort(
          (a, b) => (b.created_at || 0) - (a.created_at || 0)
        );
        return newPosts.slice(0, 50);
      });
    });

    const loadingTimeout = window.setTimeout(() => {
      if (!isActive) return;
      setIsLoading(false);
    }, 500);

    return () => {
      isActive = false;
      postSub.stop();
      window.clearTimeout(loadingTimeout);
    };
  }, [profilePubkey, ndk, isGloballyBlockedProfile]);

  useEffect(() => {
    if (!isEditingProfile) {
      setProfileForm(createProfileFormState(profile));
    }
  }, [profile, isEditingProfile]);

  useEffect(() => {
    if (isOwnProfile) return;
    if (
      activeTab === "saved" ||
      activeTab === "muted" ||
      activeTab === "upvoted" ||
      activeTab === "downvoted"
    ) {
      setActiveTab("posts");
    }
  }, [isOwnProfile, activeTab]);

  // Check NIP-05 verification when profile loads
  useEffect(() => {
    if (profile?.nip05 && profilePubkey) {
      checkProfileNip05(profile.nip05, profilePubkey);
    }
  }, [profile?.nip05, profilePubkey, checkProfileNip05]);

  const handleOpenEditProfile = () => {
    setProfileForm(createProfileFormState(profile));
    setProfileUpdateError(null);
    setIsEditingProfile(true);
  };

  const handleCloseEditProfile = () => {
    if (isSavingProfile) return;
    setIsEditingProfile(false);
    setProfileUpdateError(null);
  };

  const handleProfileFieldChange = (field: keyof ProfileFormState, value: string) => {
    setProfileForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSaveProfile = async () => {
    if (!user || !isOwnProfile) return;

    const website = normalizeOptionalUrl(profileForm.website);
    const image = normalizeOptionalUrl(profileForm.image);
    const banner = normalizeOptionalUrl(profileForm.banner);

    if (profileForm.website.trim() && !website) {
      setProfileUpdateError("Website URL is not valid.");
      return;
    }

    if (profileForm.image.trim() && !image) {
      setProfileUpdateError("Avatar URL is not valid.");
      return;
    }

    if (profileForm.banner.trim() && !banner) {
      setProfileUpdateError("Banner URL is not valid.");
      return;
    }

    const nip05 = normalizeOptionalField(profileForm.nip05);
    const lud16 = normalizeOptionalField(profileForm.lud16);
    if (nip05 && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(nip05)) {
      setProfileUpdateError("NIP-05 must be in format name@domain.com.");
      return;
    }
    if (lud16 && !/^[^@\s]+@[^@\s]+$/.test(lud16)) {
      setProfileUpdateError("Lightning address must be in format name@domain.");
      return;
    }

    setProfileUpdateError(null);
    setIsSavingProfile(true);

    try {
      const preservedMetadata: Record<string, string | number | boolean> = {};
      if (profile) {
        Object.entries(profile).forEach(([key, value]) => {
          if (EDITABLE_PROFILE_KEYS.has(key)) return;
          if (
            typeof value === "string" ||
            typeof value === "number" ||
            typeof value === "boolean"
          ) {
            preservedMetadata[key] = value;
          }
        });
      }

      const name = normalizeOptionalField(profileForm.name);
      const displayName = normalizeOptionalField(profileForm.displayName);
      const about = normalizeOptionalField(profileForm.about);

      const metadataPayload: Record<string, string | number | boolean> = {
        ...preservedMetadata,
      };

      if (name) metadataPayload.name = name;
      if (displayName) {
        metadataPayload.displayName = displayName;
        metadataPayload.display_name = displayName;
      }
      if (about) {
        metadataPayload.about = about;
        metadataPayload.bio = about;
      }
      if (website) metadataPayload.website = website;
      if (nip05) metadataPayload.nip05 = nip05;
      if (lud16) metadataPayload.lud16 = lud16;
      if (image) {
        metadataPayload.picture = image;
        metadataPayload.image = image;
      }
      if (banner) metadataPayload.banner = banner;

      const event = new NDKEvent(ndk);
      event.kind = NDKKind.Metadata;
      event.content = JSON.stringify(metadataPayload);
      await event.publish();

      const updatedProfile: NDKProfile = { ...(profile || {}) };

      if (name) updatedProfile.name = name;
      else delete updatedProfile.name;

      if (displayName) updatedProfile.displayName = displayName;
      else delete updatedProfile.displayName;

      if (about) {
        updatedProfile.about = about;
        updatedProfile.bio = about;
      } else {
        delete updatedProfile.about;
        delete updatedProfile.bio;
      }

      if (website) updatedProfile.website = website;
      else delete updatedProfile.website;

      if (nip05) updatedProfile.nip05 = nip05;
      else delete updatedProfile.nip05;

      if (lud16) updatedProfile.lud16 = lud16;
      else delete updatedProfile.lud16;

      if (image) updatedProfile.image = image;
      else delete updatedProfile.image;

      if (banner) updatedProfile.banner = banner;
      else delete updatedProfile.banner;

      setProfile(updatedProfile);
      (user as any).profile = {
        ...((user as any).profile || {}),
        ...updatedProfile,
      };

      setIsEditingProfile(false);
      success("Profile updated successfully.");
    } catch (error) {
      logger.error("Failed to update profile metadata", error);
      setProfileUpdateError("Failed to update profile. Check your relay connection and signer.");
      showError("Failed to update profile. Check your relay connection and signer.");
    } finally {
      setIsSavingProfile(false);
    }
  };

  const handleUnblockUser = async (pubkey: string) => {
    if (!isOwnProfile || !user) return;

    setUnblockingPubkeys((prev) => new Set(prev).add(pubkey));
    try {
      const ok = await unblockUser(pubkey);
      if (ok) {
        success("User unblocked globally.");
      } else {
        showError("Failed to unblock user.");
      }
    } finally {
      setUnblockingPubkeys((prev) => {
        const next = new Set(prev);
        next.delete(pubkey);
        return next;
      });
    }
  };

  const handleUnmuteTag = async (tag: string) => {
    if (!isOwnProfile || !user) return;

    setUnmutingTags((prev) => new Set(prev).add(tag));
    try {
      const ok = await unmuteTag(tag);
      if (ok) {
        success("Hashtag unmuted.");
      } else {
        showError("Failed to unmute hashtag.");
      }
    } finally {
      setUnmutingTags((prev) => {
        const next = new Set(prev);
        next.delete(tag);
        return next;
      });
    }
  };

  const handleUnmuteEvent = async (eventId: string) => {
    if (!isOwnProfile || !user) return;

    setUnmutingEvents((prev) => new Set(prev).add(eventId));
    try {
      const ok = await unmuteEvent(eventId);
      if (ok) {
        success("Post unmuted.");
      } else {
        showError("Failed to unmute post.");
      }
    } finally {
      setUnmutingEvents((prev) => {
        const next = new Set(prev);
        next.delete(eventId);
        return next;
      });
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading profile...</div>
      </div>
    );
  }

  if (isGloballyBlockedProfile) {
    return (
      <div className="space-y-6">
        <button
          onClick={() => navigate("/")}
          className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-dark)] font-bold"
        >
          <ArrowLeft size={20} />
          Back
        </button>
        <div className="bg-card border rounded-xl p-8 text-center shadow-sm">
          <p className="text-muted-foreground">
            This profile is hidden because the user is globally blocked.
          </p>
        </div>
      </div>
    );
  }

  const avatarLabel = (profile?.displayName || profile?.name || "U").slice(0, 1).toUpperCase();
  const authoredComments = posts.filter((event) => event.tags.some((tag) => tag[0] === "e"));
  const authoredPosts = posts.filter((event) => !event.tags.some((tag) => tag[0] === "e"));
  const blockedUsers = Array.from(blockedPubkeys).sort();
  const mutedTagsList = [...mutedHashtags];
  const mutedEventIdsList = [...mutedEvents];
  const tabButtonClass = (tab: ProfileTab) =>
    `shrink-0 inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-bold whitespace-nowrap transition-all ${
      activeTab === tab
        ? "bg-card text-foreground border-[var(--primary)]/35 shadow-sm"
        : "text-muted-foreground border-transparent hover:text-foreground hover:bg-accent/60"
    }`;

  return (
    <div className="space-y-6">
      {/* Header */}
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-dark)] font-bold"
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
          <div className="w-20 h-20 rounded-xl bg-accent/40 border border-border overflow-hidden flex items-center justify-center">
            {profile?.image ? (
              <img src={profile.image} alt="profile" className="w-full h-full object-cover" />
            ) : (
              <span className="text-xl font-black text-muted-foreground">{avatarLabel}</span>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center flex-wrap gap-2">
              <h1 className="text-2xl font-black text-foreground">
                {profile?.displayName || profile?.name || profilePubkey?.slice(0, 8)}
              </h1>
              {verification?.isVerified && (
                <div
                  className="flex items-center gap-1 px-2 py-0.5 bg-blue-500/10 text-blue-500 rounded-full text-xs font-bold"
                  title={`Verified: ${verification.nip05}`}
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4 fill-current">
                    <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
                  </svg>
                  <span className="hidden sm:inline">{verification.nip05}</span>
                </div>
              )}
            </div>
            <p className="text-sm text-muted-foreground">{profilePubkey?.slice(0, 16)}...</p>
            {profile?.nip05 && !verification?.isVerified && (
              <p className="text-xs text-muted-foreground">{profile.nip05}</p>
            )}
            {(profile?.about || profile?.bio) && (
              <p className="text-sm text-foreground mt-2 whitespace-pre-wrap">
                {profile?.about || profile?.bio}
              </p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {profile?.website && (
                <a
                  href={getExternalWebsiteUrl(profile.website)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-accent/50 rounded-full text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Globe size={12} />
                  {compactWebsiteLabel(profile.website)}
                </a>
              )}
              {profile?.lud16 && (
                <span className="inline-flex items-center gap-1 text-xs px-2 py-1 bg-accent/50 rounded-full text-muted-foreground">
                  <Zap size={12} />
                  {profile.lud16}
                </span>
              )}
            </div>
            <div className="flex gap-4 mt-4 text-xs text-muted-foreground">
              <span>
                <strong>{authoredPosts.length}</strong> posts
              </span>
              <span>
                <strong>{isOwnProfile ? followingCount : "..."}</strong> following
              </span>
              <span>
                <strong>{isOwnProfile ? followersCount : "..."}</strong> followers
              </span>
            </div>
          </div>

          {isOwnProfile && (
            <button
              onClick={handleOpenEditProfile}
              className="inline-flex items-center gap-2 px-4 py-2 bg-accent/60 text-foreground rounded-full text-sm font-bold hover:bg-accent transition-colors"
            >
              <Pencil size={16} />
              Edit profile
            </button>
          )}

          {user && profilePubkey !== user.pubkey && (
            <div className="flex items-center gap-2">
              <FollowButton pubkey={profilePubkey!} size="md" />
              <ZapButton targetPubkey={profilePubkey!} size="md" showAmount={false} />
            </div>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div className="relative">
        <div className="pointer-events-none absolute left-0 top-0 bottom-0 w-6 bg-gradient-to-r from-background to-transparent z-10 md:hidden" />
        <div className="pointer-events-none absolute right-0 top-0 bottom-0 w-6 bg-gradient-to-l from-background to-transparent z-10 md:hidden" />
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar rounded-xl border bg-accent/30 px-1.5 py-1.5">
        <button
          onClick={() => setActiveTab("posts")}
          className={tabButtonClass("posts")}
        >
          Posts ({authoredPosts.length})
        </button>

        <button
          onClick={() => setActiveTab("comments")}
          className={tabButtonClass("comments")}
        >
          <MessageSquare size={16} />
          Comments ({authoredComments.length})
        </button>

        {isOwnProfile && (
          <>
            <button
              onClick={() => setActiveTab("saved")}
              className={tabButtonClass("saved")}
            >
              <Bookmark size={16} />
              Saved ({savedPosts.length})
            </button>

            <button
              onClick={() => setActiveTab("muted")}
              className={tabButtonClass("muted")}
            >
              <UserX size={16} />
              Muted ({mutedCount})
            </button>

            <button
              onClick={() => setActiveTab("upvoted")}
              className={tabButtonClass("upvoted")}
            >
              <ArrowBigUp size={16} />
              Upvoted (0)
            </button>

            <button
              onClick={() => setActiveTab("downvoted")}
              className={tabButtonClass("downvoted")}
            >
              <ArrowBigDown size={16} />
              Downvoted (0)
            </button>
          </>
        )}
        </div>
      </div>

      {/* Posts Tab */}
      {activeTab === "posts" && (
        <div className="space-y-4">
          {authoredPosts.length === 0 ? (
            <EmptyState
              icon={Bookmark}
              title="No posts yet"
              description={
                isOwnProfile
                  ? "You haven't created any posts yet. Start sharing your thoughts!"
                  : "This user hasn't created any posts yet."
              }
              action={
                isOwnProfile
                  ? {
                      label: "Create Post",
                      onClick: () => navigate("/"),
                    }
                  : undefined
              }
            />
          ) : (
            authoredPosts.map((post) => (
              <div
                key={post.id}
                className="bg-card border rounded-xl shadow-sm p-4 hover:border-[var(--primary)]/20 transition-all cursor-pointer"
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
                      {new Date((post.created_at || 0) * 1000).toLocaleString()}
                    </p>
                    <p className="text-foreground whitespace-pre-wrap">{post.content}</p>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {/* Comments Tab */}
      {activeTab === "comments" && (
        <div className="space-y-4">
          {authoredComments.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title="No comments yet"
              description={
                isOwnProfile
                  ? "You haven't written any comments yet."
                  : "This user hasn't written any comments yet."
              }
            />
          ) : (
            authoredComments.map((comment) => (
              <div
                key={comment.id}
                className="bg-card border rounded-xl shadow-sm p-4 hover:border-[var(--primary)]/20 transition-all cursor-pointer"
                onClick={() => navigate(`/post/${comment.id}`)}
              >
                <div className="flex gap-3">
                  <div className="w-10 flex flex-col items-center space-y-1">
                    <ArrowBigUp size={20} className="text-muted-foreground" />
                    <span className="text-xs font-bold">0</span>
                    <ArrowBigDown size={20} className="text-muted-foreground" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-muted-foreground mb-1">
                      {new Date((comment.created_at || 0) * 1000).toLocaleString()}
                    </p>
                    <p className="text-foreground whitespace-pre-wrap line-clamp-4">{comment.content}</p>
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
                className="bg-card border rounded-xl shadow-sm p-4 hover:border-[var(--primary)]/20 transition-all cursor-pointer"
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

                <p className="text-foreground whitespace-pre-wrap line-clamp-3">
                  {savedPost.postContent}
                </p>

                {savedPost.note && (
                  <p className="text-xs text-[var(--primary)] mt-2">Note: {savedPost.note}</p>
                )}
              </div>
            ))
          )}
        </div>
      )}

      {/* Muted Tab */}
      {activeTab === "muted" && isOwnProfile && (
        <div className="space-y-4">
          {mutedCount === 0 ? (
            <EmptyState
              icon={UserX}
              title="No muted items"
              description="Muted users, hashtags, and posts will appear here."
            />
          ) : (
            <>
              <div className="bg-accent/30 border rounded-lg px-4 py-3 text-sm text-muted-foreground">
                This is your NIP-51 mute list (kind 10000) synced via relays.
              </div>

              {blockedUsers.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Muted Users ({blockedUsers.length})
                  </h3>
                  {blockedUsers.map((pubkey) => {
                    const isUnblocking = unblockingPubkeys.has(pubkey);
                    return (
                      <div
                        key={pubkey}
                        className="bg-card border rounded-xl shadow-sm p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Muted user</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{pubkey}</p>
                        </div>
                        <button
                          onClick={() => void handleUnblockUser(pubkey)}
                          disabled={isUnblocking}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold bg-accent/60 hover:bg-accent transition-colors disabled:opacity-60"
                        >
                          {isUnblocking ? <Loader2 size={14} className="animate-spin" /> : null}
                          Unmute
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {mutedTagsList.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Muted Hashtags ({mutedTagsList.length})
                  </h3>
                  {mutedTagsList.map((tag) => {
                    const isPending = unmutingTags.has(tag);
                    return (
                      <div
                        key={tag}
                        className="bg-card border rounded-xl shadow-sm p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">#{tag}</p>
                        </div>
                        <button
                          onClick={() => void handleUnmuteTag(tag)}
                          disabled={isPending}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold bg-accent/60 hover:bg-accent transition-colors disabled:opacity-60"
                        >
                          {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                          Unmute
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {mutedEventIdsList.length > 0 && (
                <div className="space-y-2">
                  <h3 className="text-xs font-black uppercase tracking-[0.16em] text-muted-foreground">
                    Muted Posts ({mutedEventIdsList.length})
                  </h3>
                  {mutedEventIdsList.map((eventId) => {
                    const isPending = unmutingEvents.has(eventId);
                    return (
                      <div
                        key={eventId}
                        className="bg-card border rounded-xl shadow-sm p-4 flex items-center justify-between gap-4"
                      >
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Muted post</p>
                          <p className="text-xs text-muted-foreground font-mono truncate">{eventId}</p>
                        </div>
                        <button
                          onClick={() => void handleUnmuteEvent(eventId)}
                          disabled={isPending}
                          className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-bold bg-accent/60 hover:bg-accent transition-colors disabled:opacity-60"
                        >
                          {isPending ? <Loader2 size={14} className="animate-spin" /> : null}
                          Unmute
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Upvoted Tab */}
      {activeTab === "upvoted" && isOwnProfile && (
        <EmptyState
          icon={ArrowBigUp}
          title="No upvoted posts"
          description="Posts you upvote will appear here."
        />
      )}

      {/* Downvoted Tab */}
      {activeTab === "downvoted" && isOwnProfile && (
        <EmptyState
          icon={ArrowBigDown}
          title="No downvoted posts"
          description="Posts you downvote will appear here."
        />
      )}

      {/* Profile edit modal */}
      {isEditingProfile && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 p-4 flex items-start sm:items-center justify-center overflow-y-auto"
          onClick={handleCloseEditProfile}
        >
          <div
            className="w-full max-w-2xl bg-card border rounded-2xl shadow-2xl overflow-hidden my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="relative">
              <div className="h-36 sm:h-44 bg-gradient-to-r from-[var(--primary)]/30 via-accent/60 to-[var(--primary)]/20">
                {profileForm.banner && (
                  <img
                    src={profileForm.banner}
                    alt="Banner preview"
                    className="w-full h-full object-cover"
                  />
                )}
              </div>

              <button
                onClick={handleCloseEditProfile}
                disabled={isSavingProfile}
                className="absolute right-3 top-3 w-9 h-9 rounded-full bg-black/50 text-white flex items-center justify-center hover:bg-black/70 transition-colors disabled:opacity-50"
                aria-label="Close edit modal"
              >
                <X size={18} />
              </button>

              <div className="absolute left-6 -bottom-12 w-24 h-24 rounded-2xl bg-card border-4 border-card overflow-hidden shadow-lg flex items-center justify-center">
                {profileForm.image ? (
                  <img
                    src={profileForm.image}
                    alt="Avatar preview"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-3xl font-black text-muted-foreground">{avatarLabel}</span>
                )}
              </div>
            </div>

            <div className="px-6 pt-16 pb-6 space-y-4">
              <div>
                <h2 className="text-2xl font-black">Edit profile</h2>
                <p className="text-sm text-muted-foreground">
                  Updates are published as Nostr metadata (kind 0).
                </p>
              </div>

              {profileUpdateError && (
                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-500 text-sm">
                  {profileUpdateError}
                </div>
              )}

              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Banner URL
                  </label>
                  <input
                    type="url"
                    value={profileForm.banner}
                    onChange={(e) => handleProfileFieldChange("banner", e.target.value)}
                    placeholder="https://example.com/banner.jpg"
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Avatar URL
                  </label>
                  <input
                    type="url"
                    value={profileForm.image}
                    onChange={(e) => handleProfileFieldChange("image", e.target.value)}
                    placeholder="https://example.com/avatar.jpg"
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Display name
                  </label>
                  <input
                    type="text"
                    value={profileForm.displayName}
                    onChange={(e) => handleProfileFieldChange("displayName", e.target.value)}
                    placeholder="Your display name"
                    maxLength={80}
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Username
                  </label>
                  <input
                    type="text"
                    value={profileForm.name}
                    onChange={(e) => handleProfileFieldChange("name", e.target.value)}
                    placeholder="nostr_user"
                    maxLength={80}
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    About
                  </label>
                  <textarea
                    value={profileForm.about}
                    onChange={(e) => handleProfileFieldChange("about", e.target.value)}
                    placeholder="Tell people who you are..."
                    maxLength={500}
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm min-h-[110px] resize-none focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Website
                  </label>
                  <input
                    type="text"
                    value={profileForm.website}
                    onChange={(e) => handleProfileFieldChange("website", e.target.value)}
                    placeholder="example.com"
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    NIP-05
                  </label>
                  <input
                    type="text"
                    value={profileForm.nip05}
                    onChange={(e) => handleProfileFieldChange("nip05", e.target.value)}
                    placeholder="name@domain.com"
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>

                <div className="md:col-span-2">
                  <label className="block text-xs font-bold text-muted-foreground mb-1">
                    Lightning address (lud16)
                  </label>
                  <input
                    type="text"
                    value={profileForm.lud16}
                    onChange={(e) => handleProfileFieldChange("lud16", e.target.value)}
                    placeholder="name@wallet.domain"
                    className="w-full bg-accent/50 border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-1 focus:ring-[var(--primary)]"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>{profileForm.about.length}/500</span>
              </div>
            </div>

            <div className="px-6 pb-6 flex gap-3">
              <button
                onClick={handleCloseEditProfile}
                disabled={isSavingProfile}
                className="flex-1 px-4 py-2.5 bg-accent/60 rounded-lg font-semibold hover:bg-accent transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleSaveProfile}
                disabled={isSavingProfile}
                className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-lg font-bold hover:bg-[var(--primary-dark)] transition-colors disabled:opacity-50"
              >
                {isSavingProfile ? <Loader2 size={16} className="animate-spin" /> : null}
                {isSavingProfile ? "Saving..." : "Save profile"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
