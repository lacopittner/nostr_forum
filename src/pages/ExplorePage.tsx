import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { TrendingUp, Hash, Users, ArrowRight, Flame } from "lucide-react";
import { useNostr } from "../providers/NostrProvider";
import { useGlobalBlocks } from "../hooks/useGlobalBlocks";
import { EmptyState } from "../components/EmptyState";
import { logger } from "../lib/logger";

interface TrendingHashtag {
  tag: string;
  count: number;
}

interface TrendingCommunity {
  id: string;
  pubkey: string;
  name: string;
  description: string;
  memberCount: number;
}

export function ExplorePage() {
  const { ndk } = useNostr();
  const navigate = useNavigate();
  const [trendingTags, setTrendingTags] = useState<TrendingHashtag[]>([]);
  const [trendingCommunities, setTrendingCommunities] = useState<TrendingCommunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const { blockedPubkeys } = useGlobalBlocks();

  useEffect(() => {
    const loadTrending = async () => {
      setIsLoading(true);
      try {
        // Fetch recent posts to extract hashtags
        const events = await ndk.fetchEvents(
          { kinds: [NDKKind.Text], limit: 500 },
          { closeOnEose: true }
        );

        // Count hashtags
        const tagCounts = new Map<string, number>();
        Array.from(events).forEach((event: NDKEvent) => {
          if (blockedPubkeys.has(event.pubkey)) return;
          event.tags
            .filter((tag) => tag[0] === "t")
            .forEach((tag) => {
              const hashtag = tag[1].toLowerCase();
              tagCounts.set(hashtag, (tagCounts.get(hashtag) || 0) + 1);
            });
        });

        // Sort by count and take top 10
        const sorted = Array.from(tagCounts.entries())
          .map(([tag, count]) => ({ tag, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10);

        setTrendingTags(sorted);

        // Fetch communities for trending
        const communityEvents = await ndk.fetchEvents(
          { kinds: [34550 as any], limit: 50 },
          { closeOnEose: true }
        );

        const communities = Array.from(communityEvents).map((event: NDKEvent) => {
          const d = event.tags.find((t) => t[0] === "d")?.[1] || event.id;
          const name = event.tags.find((t) => t[0] === "name")?.[1] || "Unnamed";
          const description = event.tags.find((t) => t[0] === "description")?.[1] || "";
          return {
            id: d,
            pubkey: event.pubkey,
            name,
            description,
            memberCount: Math.floor(Math.random() * 1000) + 10, // Placeholder
          };
        });

        setTrendingCommunities(communities.slice(0, 6));
      } catch (error) {
        logger.error("Failed to load trending:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadTrending();
  }, [ndk, blockedPubkeys]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="text-muted-foreground">Loading trending topics...</div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 bg-[var(--primary)] rounded-xl flex items-center justify-center">
          <Flame size={24} className="text-white" />
        </div>
        <div>
          <h1 className="text-2xl font-black">Explore</h1>
          <p className="text-sm text-muted-foreground">Discover trending topics and communities</p>
        </div>
      </div>

      {/* Trending Hashtags */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex items-center gap-2 mb-4">
          <TrendingUp size={20} className="text-[var(--primary)]" />
          <h2 className="text-lg font-bold">Trending Topics</h2>
        </div>

        {trendingTags.length === 0 ? (
          <EmptyState
            icon={Hash}
            title="No trending topics"
            description="Start using hashtags in your posts to see them here!"
          />
        ) : (
          <div className="flex flex-wrap gap-2">
            {trendingTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => navigate(`/search?q=%23${tag}`)}
                className="flex items-center gap-2 px-4 py-2 bg-accent/50 hover:bg-accent rounded-full transition-all group"
              >
                <Hash size={14} className="text-[var(--primary)]" />
                <span className="font-bold text-sm">{tag}</span>
                <span className="text-xs text-muted-foreground">{count} posts</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Trending Communities */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Users size={20} className="text-[var(--primary)]" />
            <h2 className="text-lg font-bold">Popular Communities</h2>
          </div>
          <button
            onClick={() => navigate("/communities")}
            className="flex items-center gap-1 text-sm text-[var(--primary)] hover:text-[var(--primary-dark)] font-bold"
          >
            View all
            <ArrowRight size={16} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {trendingCommunities.map((community) => (
              <button
              key={`${community.pubkey}:${community.id}`}
              onClick={() => navigate(`/community/${community.pubkey}/${community.id}`)}
              className="text-left p-4 bg-accent/30 hover:bg-accent/50 rounded-xl transition-all border border-transparent hover:border-[var(--primary)]/20"
            >
              <div className="flex items-center gap-3 mb-2">
                <div className="w-10 h-10 bg-[var(--primary)] rounded-lg flex items-center justify-center">
                  <span className="text-white font-bold text-lg">r/</span>
                </div>
                <div>
                  <h3 className="font-bold text-sm">{community.name}</h3>
                  <span className="text-xs text-muted-foreground">
                    {community.memberCount} members
                  </span>
                </div>
              </div>
              <p className="text-sm text-muted-foreground line-clamp-2">
                {community.description}
              </p>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
