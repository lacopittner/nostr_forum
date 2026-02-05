import { useNostr } from "../providers/NostrProvider";
import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNavigate } from "react-router-dom";
import { Plus, Search, UserPlus, UserCheck, Beaker } from "lucide-react";
import { CreateCommunityModal } from "../components/CreateCommunityModal";
import { useCommunityMembership } from "../hooks/useCommunityMembership";

export function CommunitiesPage() {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const { isMember, joinCommunity, leaveCommunity } = useCommunityMembership();
  const [communities, setCommunities] = useState<NDKEvent[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<NDKEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    const fetchCommunities = async () => {
      setIsLoading(true);
      try {
        const subscription = ndk.subscribe(
          { kinds: [34550] as any, limit: 100 },
          { closeOnEose: true }
        );

        const communityList: NDKEvent[] = [];
        
        subscription.on("event", (event: NDKEvent) => {
          communityList.push(event);
        });

        subscription.on("eose", () => {
          setCommunities(communityList.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
          setIsLoading(false);
        });
      } catch (error) {
        console.error("Failed to fetch communities", error);
        setIsLoading(false);
      }
    };

    fetchCommunities();
  }, [ndk]);

  // Filter communities by search query
  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const filtered = communities.filter(community => {
      const name = community.tags.find(t => t[0] === "name")?.[1] || "";
      const description = community.tags.find(t => t[0] === "description")?.[1] || "";
      const d = community.tags.find(t => t[0] === "d")?.[1] || "";
      
      return (
        name.toLowerCase().includes(query) ||
        description.toLowerCase().includes(query) ||
        d.toLowerCase().includes(query)
      );
    });
    setFilteredCommunities(filtered);
  }, [searchQuery, communities]);

  const getCommunityInfo = (community: NDKEvent) => {
    const name = community.tags.find(t => t[0] === "name")?.[1] || "Unnamed Community";
    const description = community.tags.find(t => t[0] === "description")?.[1] || "";
    const image = community.tags.find(t => t[0] === "image")?.[1] || "";
    const d = community.tags.find(t => t[0] === "d")?.[1] || "";
    
    return { name, description, image, d };
  };

  const handleCommunityClick = (community: NDKEvent) => {
    const { d } = getCommunityInfo(community);
    navigate(`/community/${community.pubkey}/${d}`);
  };

  const createTestingCommunity = async () => {
    if (!user) {
      alert("Please log in first to create a community");
      return;
    }

    try {
      const communityId = "testing_community";
      
      const event = new NDKEvent(ndk);
      event.kind = 34550; // NIP-72 Community
      event.content = "A testing community for trying out features";
      
      event.tags = [
        ["d", communityId],
        ["name", "Testing Community"],
        ["description", "A community for testing NostrReddit features. Feel free to post test content here!"],
        ["image", ""],
        ["rules", "1. Be respectful\n2. Test freely\n3. Have fun!"],
        ["p", user.pubkey, "", "moderator"]
      ];

      await event.publish();
      alert("Testing community created! Refresh the page to see it.");
      
      // Refresh communities
      const subscription = ndk.subscribe(
        { kinds: [34550] as any, limit: 100 },
        { closeOnEose: true }
      );

      const communityList: NDKEvent[] = [];
      
      subscription.on("event", (event: NDKEvent) => {
        communityList.push(event);
      });

      subscription.on("eose", () => {
        setCommunities(communityList.sort((a, b) => (b.created_at || 0) - (a.created_at || 0)));
      });
    } catch (err) {
      console.error("Failed to create testing community", err);
      alert("Failed to create community. Make sure your relay is running.");
    }
  };

  return (
    <div className="space-y-6">
      {showCreateModal && (
        <CreateCommunityModal exit={() => setShowCreateModal(false)} />
      )}

      {/* Header */}
      <div className="bg-card border rounded-xl p-6 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-black">Communities</h1>
          {user && (
            <div className="flex gap-2">
              <button
                onClick={createTestingCommunity}
                className="flex items-center space-x-2 px-4 py-2 bg-accent text-foreground border border-[var(--primary)]/30 rounded-full font-bold text-sm hover:bg-accent/70 transition-all"
                title="Quick create testing community"
              >
                <Beaker size={16} className="text-[var(--primary)]" />
                <span className="hidden sm:inline">Create Test Community</span>
                <span className="sm:hidden">Test</span>
              </button>
              <button
                onClick={() => setShowCreateModal(true)}
                className="flex items-center space-x-2 px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold text-sm hover:bg-[var(--primary-dark)] transition-all"
              >
                <Plus size={16} />
                <span>New Community</span>
              </button>
            </div>
          )}
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-3 text-gray-400" size={20} />
          <input
            type="text"
            placeholder="Search communities..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 bg-accent/50 border rounded-lg focus:ring-1 focus:ring-[var(--primary)]"
          />
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex justify-center py-12">
          <div className="text-gray-400">Loading communities...</div>
        </div>
      )}

      {/* Communities Grid */}
      {!isLoading && filteredCommunities.length === 0 && (
        <div className="bg-card border rounded-xl p-12 text-center shadow-sm">
          <p className="text-gray-400 mb-4">
            {searchQuery ? "No communities found" : "No communities yet"}
          </p>
          {!searchQuery && user && (
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-6 py-2 bg-[var(--primary)] text-white rounded-full font-bold hover:bg-[var(--primary-dark)] transition-all"
            >
              Create First Community
            </button>
          )}
        </div>
      )}

      {!isLoading && filteredCommunities.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {filteredCommunities.map((community) => {
            const { name, description, image, d } = getCommunityInfo(community);
            const isJoined = isMember(community.pubkey, d);
            const isJoining = joiningId === `${community.pubkey}:${d}`;
            
            const handleJoinClick = async (e: React.MouseEvent) => {
              e.stopPropagation();
              if (!user) return;
              
              setJoiningId(`${community.pubkey}:${d}`);
              if (isJoined) {
                await leaveCommunity(community.pubkey, d);
              } else {
                await joinCommunity(community.pubkey, d);
              }
              setJoiningId(null);
            };
            
            return (
              <div
                key={`${community.pubkey}-${d}`}
                onClick={() => handleCommunityClick(community)}
                className="bg-card border rounded-xl p-6 shadow-sm hover:border-[var(--primary)]/20 hover:shadow-md transition-all cursor-pointer group"
              >
                {/* Community Image */}
                {image && (
                  <img
                    src={image}
                    alt={name}
                    className="w-full h-32 object-cover rounded-lg mb-4"
                  />
                )}
                
                {/* Community Info */}
                <div>
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-bold text-lg group-hover:text-[var(--primary)] transition-colors line-clamp-2">
                      {name}
                    </h3>
                    
                    {user && (
                      <button
                        onClick={handleJoinClick}
                        disabled={isJoining}
                        className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                          isJoined
                            ? "bg-accent text-foreground hover:bg-accent/70"
                            : "bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
                        } ${isJoining ? "opacity-50" : ""}`}
                      >
                        {isJoining ? (
                          <span>...</span>
                        ) : isJoined ? (
                          <>
                            <UserCheck size={12} />
                            <span>Joined</span>
                          </>
                        ) : (
                          <>
                            <UserPlus size={12} />
                            <span>Join</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {description || "No description"}
                  </p>
                  
                  {/* Stats */}
                  <div className="flex items-center space-x-4 text-xs text-gray-400 pt-4 border-t border-accent">
                    <span>📅 {new Date((community.created_at || 0) * 1000).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
