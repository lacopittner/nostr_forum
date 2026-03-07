import { useCallback, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { NDKEvent, NDKFilter, NDKKind } from "@nostr-dev-kit/ndk";
import { Search as SearchIcon, ArrowLeft, Filter, Calendar } from "lucide-react";
import { useNostr } from "../providers/NostrProvider";
import { useGlobalBlocks } from "../hooks/useGlobalBlocks";
import { logger } from "../lib/logger";

type SearchScope = "posts" | "users" | "hashtags";
type SortMode = "relevance" | "newest";

interface PostResult {
  type: "post";
  id: string;
  content: string;
  pubkey: string;
  createdAt: number;
  score: number;
  hashtags: string[];
  communityTags: string[];
}

interface UserResult {
  type: "user";
  pubkey: string;
  name: string;
  about: string;
  image?: string;
}

interface HashtagResult {
  type: "hashtag";
  tag: string;
  count: number;
}

type SearchResult = PostResult | UserResult | HashtagResult;

const tokenize = (value: string): string[] => {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9_#\-\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
};

const toUnixStart = (dateStr: string): number | undefined => {
  if (!dateStr) return undefined;
  const date = new Date(`${dateStr}T00:00:00`);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
};

const toUnixEnd = (dateStr: string): number | undefined => {
  if (!dateStr) return undefined;
  const date = new Date(`${dateStr}T23:59:59`);
  const ms = date.getTime();
  if (Number.isNaN(ms)) return undefined;
  return Math.floor(ms / 1000);
};

export function SearchPage() {
  const navigate = useNavigate();
  const { ndk } = useNostr();
  const { blockedPubkeys, isEventMuted } = useGlobalBlocks();

  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<SearchScope>("posts");
  const [sortMode, setSortMode] = useState<SortMode>("relevance");
  const [communityFilter, setCommunityFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [results, setResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchBackend, setSearchBackend] = useState<"relay-nip50" | "local-fallback" | "">("");

  const normalizedQuery = useMemo(() => query.trim().toLowerCase(), [query]);

  const handleSearch = useCallback(async () => {
    if (!normalizedQuery) {
      setResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      const since = toUnixStart(dateFrom);
      const until = toUnixEnd(dateTo);
      const queryTokens = tokenize(normalizedQuery);

      const postFilter: any = {
        kinds: [NDKKind.Text],
        limit: 500,
      };

      if (since) postFilter.since = since;
      if (until) postFilter.until = until;
      if (authorFilter.trim().match(/^[a-f0-9]{64}$/i)) {
        postFilter.authors = [authorFilter.trim()];
      }

      const shouldSearchPosts = scope === "posts" || scope === "hashtags";
      const shouldSearchUsers = scope === "users";
      const userEventsPromise = shouldSearchUsers
        ? ndk.fetchEvents({ kinds: [0], limit: 500 }, { closeOnEose: true })
        : Promise.resolve(new Set<NDKEvent>());

      let postEventsRaw = new Set<NDKEvent>();
      let usedNip50 = false;

      if (shouldSearchPosts) {
        const nip50Filter: NDKFilter<number> & { search?: string } = {
          ...postFilter,
          search: normalizedQuery,
          limit: 200,
        };

        try {
          const relaySearchResults = await ndk.fetchEvents(nip50Filter, { closeOnEose: true });
          if (relaySearchResults.size > 0) {
            postEventsRaw = relaySearchResults;
            usedNip50 = true;
          } else {
            postEventsRaw = await ndk.fetchEvents(postFilter, { closeOnEose: true });
          }
        } catch (error) {
          logger.warn("NIP-50 relay search failed, falling back to local index", error);
          postEventsRaw = await ndk.fetchEvents(postFilter, { closeOnEose: true });
        }
      }

      const userEventsRaw = await userEventsPromise;
      setSearchBackend(
        shouldSearchPosts
          ? usedNip50
            ? "relay-nip50"
            : "local-fallback"
          : "local-fallback"
      );

      const postEvents = Array.from(postEventsRaw).filter((event) => !isEventMuted(event));
      const communityFilterLower = communityFilter.trim().toLowerCase();

      const indexedPosts = postEvents
        .map((event) => {
          const hashtags = event.tags
            .filter((tag) => tag[0] === "t")
            .map((tag) => tag[1]?.toLowerCase())
            .filter((tag): tag is string => Boolean(tag));

          const communityTags = event.tags
            .filter((tag) => tag[0] === "a")
            .map((tag) => tag[1]?.toLowerCase())
            .filter((tag): tag is string => Boolean(tag));

          return {
            event,
            hashtags,
            communityTags,
            document: `${event.content.toLowerCase()} ${hashtags.join(" ")} ${communityTags.join(" ")}`,
          };
        })
        .filter((entry) => {
          if (!communityFilterLower) return true;
          return entry.communityTags.some((tag) => tag.includes(communityFilterLower));
        });

      const invertedIndex = new Map<string, Set<number>>();
      indexedPosts.forEach((entry, idx) => {
        tokenize(entry.document).forEach((token) => {
          if (!invertedIndex.has(token)) invertedIndex.set(token, new Set<number>());
          invertedIndex.get(token)?.add(idx);
        });
      });

      const candidateIndices = new Set<number>();
      queryTokens.forEach((token) => {
        const matches = invertedIndex.get(token);
        if (!matches) return;
        matches.forEach((idx) => candidateIndices.add(idx));
      });

      if (candidateIndices.size === 0 && queryTokens.length > 0) {
        indexedPosts.forEach((_, idx) => candidateIndices.add(idx));
      }

      const postResults: PostResult[] = Array.from(candidateIndices)
        .map((idx) => {
          const entry = indexedPosts[idx];
          if (!entry) return null;

          const tokenHits = queryTokens.reduce((acc, token) => {
            if (entry.document.includes(token)) return acc + 1;
            return acc;
          }, 0);

          const score = tokenHits + Math.max(0, 1 - ((Date.now() / 1000 - (entry.event.created_at || 0)) / 86400) / 30);
          const matchesQuery =
            tokenHits > 0 ||
            entry.event.content.toLowerCase().includes(normalizedQuery) ||
            entry.hashtags.some((tag) => tag.includes(normalizedQuery));

          if (!matchesQuery) return null;

          return {
            type: "post",
            id: entry.event.id,
            content: entry.event.content,
            pubkey: entry.event.pubkey,
            createdAt: entry.event.created_at || 0,
            score,
            hashtags: entry.hashtags,
            communityTags: entry.communityTags,
          };
        })
        .filter((result): result is PostResult => Boolean(result))
        .sort((a, b) => {
          if (sortMode === "newest") {
            return b.createdAt - a.createdAt;
          }
          if (b.score !== a.score) return b.score - a.score;
          return b.createdAt - a.createdAt;
        })
        .slice(0, 80);

      const hashtagResults: HashtagResult[] = Array.from(
        postResults.reduce((acc, result) => {
          result.hashtags.forEach((tag) => {
            if (!tag.includes(normalizedQuery) && !queryTokens.some((token) => tag.includes(token))) return;
            acc.set(tag, (acc.get(tag) || 0) + 1);
          });
          return acc;
        }, new Map<string, number>())
      )
        .map(([tag, count]) => ({ type: "hashtag" as const, tag, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 50);

      const userResults: UserResult[] = Array.from(userEventsRaw).flatMap((event) => {
          if (blockedPubkeys.has(event.pubkey)) return [];
          try {
            const metadata = JSON.parse(event.content || "{}") as Record<string, string | undefined>;
            const name = (metadata.display_name || metadata.name || "").trim();
            const about = (metadata.about || "").trim();
            const haystack = `${name.toLowerCase()} ${about.toLowerCase()} ${event.pubkey.toLowerCase()}`;
            if (!haystack.includes(normalizedQuery)) return [];

            const userResult: UserResult = {
              type: "user" as const,
              pubkey: event.pubkey,
              name: name || event.pubkey.slice(0, 12),
              about,
              image: metadata.picture || metadata.image,
            };
            return [userResult];
          } catch {
            return [];
          }
        })
        .slice(0, 80);

      if (scope === "posts") setResults(postResults);
      if (scope === "hashtags") setResults(hashtagResults);
      if (scope === "users") setResults(userResults);
    } catch (error) {
      logger.error("Search failed", error);
      setResults([]);
    } finally {
      setIsSearching(false);
    }
  }, [
    authorFilter,
    blockedPubkeys,
    communityFilter,
    dateFrom,
    dateTo,
    isEventMuted,
    ndk,
    normalizedQuery,
    scope,
    sortMode,
  ]);

  return (
    <div className="space-y-6">
      <button
        onClick={() => navigate("/")}
        className="flex items-center gap-2 text-[var(--primary)] hover:text-[var(--primary-dark)] font-bold"
      >
        <ArrowLeft size={20} />
        Back
      </button>

      <div className="bg-card border rounded-xl p-4 shadow-sm space-y-4">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3 text-muted-foreground" size={20} />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                void handleSearch();
              }
            }}
            placeholder="Search posts, hashtags, users..."
            className="w-full bg-accent/50 border-none rounded-lg pl-10 pr-24 py-2 text-sm focus:ring-1 focus:ring-[var(--primary)]"
          />
          <button
            onClick={() => void handleSearch()}
            className="absolute right-2 top-1.5 px-3 py-1.5 bg-[var(--primary)] text-[var(--primary-foreground)] rounded-md text-xs font-bold hover:bg-[var(--primary-dark)]"
          >
            Search
          </button>
        </div>

        <div className="flex gap-2 flex-wrap">
          {(["posts", "hashtags", "users"] as const).map((type) => (
            <button
              key={type}
              onClick={() => setScope(type)}
              className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
                scope === type
                  ? "bg-[var(--primary)] text-[var(--primary-foreground)]"
                  : "bg-accent text-foreground hover:bg-accent/80"
              }`}
            >
              {type.charAt(0).toUpperCase() + type.slice(1)}
            </button>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Community</label>
            <div className="flex items-center gap-2 bg-accent/40 border border-accent/60 rounded-lg px-3 py-2.5 hover:border-[var(--primary)]/30 transition-colors">
              <Filter size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={communityFilter}
                onChange={(e) => setCommunityFilter(e.target.value)}
                placeholder="atag contains..."
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">Author Pubkey</label>
            <div className="flex items-center gap-2 bg-accent/40 border border-accent/60 rounded-lg px-3 py-2.5 hover:border-[var(--primary)]/30 transition-colors">
              <Filter size={14} className="text-muted-foreground flex-shrink-0" />
              <input
                type="text"
                value={authorFilter}
                onChange={(e) => setAuthorFilter(e.target.value)}
                placeholder="Optional"
                className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
              />
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">From Date</label>
            <div className="flex items-center gap-2 bg-accent/40 border border-accent/60 rounded-lg px-0 py-1 overflow-hidden hover:border-[var(--primary)]/30 transition-colors focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/20">
              <Calendar size={14} className="text-muted-foreground flex-shrink-0 ml-3" />
              <input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none cursor-pointer py-2.5 px-2 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
              {dateFrom && (
                <button
                  onClick={() => setDateFrom("")}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mr-3 text-lg leading-none"
                  title="Clear date"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">To Date</label>
            <div className="flex items-center gap-2 bg-accent/40 border border-accent/60 rounded-lg px-0 py-1 overflow-hidden hover:border-[var(--primary)]/30 transition-colors focus-within:border-[var(--primary)] focus-within:ring-1 focus-within:ring-[var(--primary)]/20">
              <Calendar size={14} className="text-muted-foreground flex-shrink-0 ml-3" />
              <input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="flex-1 bg-transparent text-sm outline-none cursor-pointer py-2.5 px-2 [color-scheme:dark] [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-60 [&::-webkit-calendar-picker-indicator]:hover:opacity-100 [&::-webkit-outer-spin-button]:hidden [&::-webkit-inner-spin-button]:hidden"
              />
              {dateTo && (
                <button
                  onClick={() => setDateTo("")}
                  className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mr-3 text-lg leading-none"
                  title="Clear date"
                >
                  ✕
                </button>
              )}
            </div>
          </div>
        </div>

        {scope !== "users" && (
          <div className="flex items-center gap-2">
            <span className="text-sm text-muted-foreground">Sort:</span>
            <select
              value={sortMode}
              onChange={(e) => setSortMode(e.target.value as SortMode)}
              className="bg-accent/50 border-none rounded-lg px-3 py-1.5 text-sm focus:ring-1 focus:ring-[var(--primary)]"
            >
              <option value="relevance">Relevance</option>
              <option value="newest">Newest</option>
            </select>
          </div>
        )}

        {scope !== "users" && searchBackend && (
          <div className="text-xs text-muted-foreground">
            Search engine: {searchBackend === "relay-nip50" ? "Relay NIP-50" : "Local fallback"}
          </div>
        )}
      </div>

      {isSearching && (
        <div className="text-center py-10 text-muted-foreground">Searching...</div>
      )}

      {!isSearching && hasSearched && results.length === 0 && (
        <div className="text-center py-10 text-muted-foreground">
          No results found for "{query}"
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase">
            {results.length} Result{results.length !== 1 ? "s" : ""}
          </h3>
          {results.map((result) => {
            if (result.type === "post") {
              return (
                <div
                  key={result.id}
                  onClick={() => navigate(`/post/${result.id}`)}
                  className="bg-card border rounded-xl p-4 shadow-sm hover:border-[var(--primary)]/50 cursor-pointer transition-all"
                >
                  <div className="text-xs text-muted-foreground mb-1">
                    {new Date(result.createdAt * 1000).toLocaleString()} • {result.pubkey.slice(0, 12)}...
                  </div>
                  <div className="text-sm text-foreground whitespace-pre-wrap line-clamp-3">
                    {result.content}
                  </div>
                  {result.hashtags.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {result.hashtags.slice(0, 6).map((tag) => (
                        <span key={`${result.id}-${tag}`} className="text-xs px-2 py-0.5 rounded-full bg-accent/50 text-muted-foreground">
                          #{tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              );
            }

            if (result.type === "user") {
              return (
                <div
                  key={result.pubkey}
                  onClick={() => navigate(`/profile/${result.pubkey}`)}
                  className="bg-card border rounded-xl p-4 shadow-sm hover:border-[var(--primary)]/50 cursor-pointer transition-all"
                >
                  <div className="flex items-center gap-3">
                    {result.image && (
                      <img src={result.image} alt="" className="w-10 h-10 rounded-full object-cover" />
                    )}
                    <div>
                      <div className="font-bold text-foreground">{result.name}</div>
                      <div className="text-xs text-muted-foreground">{result.pubkey.slice(0, 20)}...</div>
                      {result.about && <div className="text-xs text-muted-foreground mt-1 line-clamp-2">{result.about}</div>}
                    </div>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={result.tag}
                onClick={() => {
                  setScope("hashtags");
                  setQuery(result.tag);
                }}
                className="bg-card border rounded-xl p-4 shadow-sm hover:border-[var(--primary)]/50 cursor-pointer transition-all"
              >
                <div className="font-bold text-[var(--primary)]">#{result.tag}</div>
                <div className="text-xs text-muted-foreground">{result.count} matching posts</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
