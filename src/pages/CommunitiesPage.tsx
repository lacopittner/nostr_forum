import { useNostr } from "../providers/NostrProvider";
import { useEffect, useState } from "react";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { useNavigate } from "react-router-dom";
import { Plus, Search } from "lucide-react";
import { CreateCommunityModal } from "../components/CreateCommunityModal";

export function CommunitiesPage() {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const [communities, setCommunities] = useState<NDKEvent[]>([]);
  const [filteredCommunities, setFilteredCommunities] = useState<NDKEvent[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);

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
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center space-x-2 px-6 py-2 bg-orange-600 text-white rounded-full font-bold text-sm hover:bg-orange-700 transition-all"
            >
              <Plus size={16} />
              <span>New Community</span>
            </button>
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
            className="w-full pl-10 pr-4 py-2 bg-accent/50 border rounded-lg focus:ring-1 focus:ring-orange-500"
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
              className="px-6 py-2 bg-orange-600 text-white rounded-full font-bold hover:bg-orange-700 transition-all"
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
            const memberCount = Math.floor(Math.random() * 1000) + 1; // Placeholder
            
            return (
              <div
                key={`${community.pubkey}-${d}`}
                onClick={() => handleCommunityClick(community)}
                className="bg-card border rounded-xl p-6 shadow-sm hover:border-orange-500/20 hover:shadow-md transition-all cursor-pointer group"
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
                  <h3 className="font-bold text-lg mb-2 group-hover:text-orange-500 transition-colors line-clamp-2">
                    {name}
                  </h3>
                  <p className="text-gray-400 text-sm mb-4 line-clamp-2">
                    {description || "No description"}
                  </p>
                  
                  {/* Stats */}
                  <div className="flex items-center space-x-4 text-xs text-gray-400 pt-4 border-t border-accent">
                    <span>👥 {memberCount} members</span>
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
