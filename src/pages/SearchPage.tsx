import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useNostr } from "../providers/NostrProvider";
import { Search as SearchIcon, ArrowLeft } from "lucide-react";
import { NDKKind } from "@nostr-dev-kit/ndk";

export function SearchPage() {
  const navigate = useNavigate();
  const { ndk } = useNostr();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<any[]>([]);
  const [resultType, setResultType] = useState<"hashtags" | "users" | "content">("hashtags");
  const [isSearching, setIsSearching] = useState(false);

  const handleSearch = useCallback(
    async (searchQuery: string) => {
      if (!searchQuery.trim() || !ndk) {
        setResults([]);
        return;
      }

      setIsSearching(true);
      const newResults: any[] = [];

      try {
        if (resultType === "hashtags") {
          // Search for hashtags in posts
          const sub = ndk.subscribe(
            { kinds: [NDKKind.Text], limit: 100 },
            { closeOnEose: true }
          );

          sub.on("event", (event: any) => {
            const hashtags = event.tags.filter((t: any) => t[0] === "t");
            const matchingTags = hashtags.filter((t: any) =>
              t[1]?.toLowerCase().includes(searchQuery.toLowerCase())
            );

            if (matchingTags.length > 0) {
              matchingTags.forEach((tag: any) => {
                if (!newResults.find((r) => r.tag === tag[1])) {
                  newResults.push({
                    type: "hashtag",
                    tag: tag[1],
                    label: `#${tag[1]}`,
                  });
                }
              });
            }
          });
        } else if (resultType === "users") {
          // Search for users (by pubkey or name - simplified)
          const sub = ndk.subscribe(
            { kinds: [0], limit: 200 },
            { closeOnEose: true }
          );

          sub.on("event", (event: any) => {
            try {
              const metadata = JSON.parse(event.content);
              const name = metadata.name || metadata.display_name || "";
              const pubkey = event.pubkey;

              if (
                name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                pubkey.toLowerCase().includes(searchQuery.toLowerCase())
              ) {
                if (!newResults.find((r) => r.pubkey === pubkey)) {
                  newResults.push({
                    type: "user",
                    pubkey,
                    name: name || pubkey.slice(0, 8),
                    metadata,
                  });
                }
              }
            } catch (e) {
              // Skip invalid metadata
            }
          });
        } else if (resultType === "content") {
          // Search in post content
          const sub = ndk.subscribe(
            { kinds: [NDKKind.Text], limit: 100 },
            { closeOnEose: true }
          );

          sub.on("event", (event: any) => {
            if (event.content.toLowerCase().includes(searchQuery.toLowerCase())) {
              if (!newResults.find((r) => r.id === event.id)) {
                newResults.push({
                  type: "post",
                  id: event.id,
                  content: event.content,
                  pubkey: event.pubkey,
                  created_at: event.created_at,
                });
              }
            }
          });
        }

        // Wait a moment for results to populate
        setTimeout(() => {
          setResults(newResults.slice(0, 20));
          setIsSearching(false);
        }, 1500);
      } catch (error) {
        console.error("Search error:", error);
        setIsSearching(false);
      }
    },
    [ndk, resultType]
  );

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    handleSearch(newQuery);
  };

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

      {/* Search Input */}
      <div className="bg-card border rounded-xl p-4 shadow-sm">
        <div className="relative">
          <SearchIcon className="absolute left-3 top-3 text-muted-foreground" size={20} />
          <input
            type="text"
            value={query}
            onChange={handleSearchChange}
            placeholder="Search hashtags, users, or content..."
            className="w-full bg-accent/50 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2">
        {["hashtags", "users", "content"].map((type) => (
          <button
            key={type}
            onClick={() => {
              setResultType(type as any);
              setResults([]);
            }}
            className={`px-4 py-2 rounded-full text-sm font-bold transition-all ${
              resultType === type
                ? "bg-[var(--primary)] text-white"
                : "bg-accent text-foreground hover:bg-accent/80"
            }`}
          >
            {type.charAt(0).toUpperCase() + type.slice(1)}
          </button>
        ))}
      </div>

      {/* Results */}
      {isSearching && (
        <div className="text-center py-8 text-muted-foreground">Searching...</div>
      )}

      {!isSearching && results.length === 0 && query && (
        <div className="text-center py-8 text-muted-foreground">
          No results found for "{query}"
        </div>
      )}

      {!isSearching && results.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-bold text-muted-foreground uppercase">
            {results.length} Result{results.length !== 1 ? "s" : ""}
          </h3>
          {results.map((result, idx) => (
            <div
              key={idx}
              onClick={() => {
                if (result.type === "hashtag") {
                  navigate(`/?tag=${result.tag}`);
                } else if (result.type === "user") {
                  navigate(`/profile/${result.pubkey}`);
                }
              }}
              className="bg-card border rounded-xl p-4 shadow-sm hover:border-[var(--primary)]/50 cursor-pointer transition-all"
            >
              {result.type === "hashtag" && (
                <div className="flex items-center gap-2">
                  <span className="text-[var(--primary)] font-bold">#{result.tag}</span>
                </div>
              )}
              {result.type === "user" && (
                <div className="flex items-center gap-3">
                  {result.metadata?.image && (
                    <img src={result.metadata.image} alt="" className="w-10 h-10 rounded-full" />
                  )}
                  <div>
                    <div className="font-bold text-foreground">{result.name}</div>
                    <div className="text-xs text-muted-foreground">{result.pubkey.slice(0, 16)}...</div>
                  </div>
                </div>
              )}
              {result.type === "post" && (
                <div>
                  <div className="text-xs text-muted-foreground mb-1">
                    {new Date(result.created_at * 1000).toLocaleString()}
                  </div>
                  <div className="text-sm text-foreground truncate">{result.content}</div>
                  <div className="text-xs text-muted-foreground mt-1">
                    By {result.pubkey.slice(0, 8)}...
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
