import React, { useState, useEffect } from "react";
import { Home, LogIn, Menu, X, Search, User, Settings, Bell, Compass, Palette, LogOut, Users } from "lucide-react";
import { useNostr } from "../../providers/NostrProvider";
import { useNavigate } from "react-router-dom";
import { NDKEvent, NDKKind } from "@nostr-dev-kit/ndk";
import { BottomNav } from "./BottomNav";
import { LoginModal } from "../LoginModal";
import { PinUnlockModal } from "../PinUnlockModal";
import { ThemeModal } from "../ThemeModal";
import { useTheme } from "../../hooks/useTheme";
import { useCommunityMembership } from "../../hooks/useCommunityMembership";
import { logger } from "../../lib/logger";

interface Community {
  id: string;
  pubkey: string;
  name: string;
}

interface TrendingCommunity extends Community {
  description: string;
  memberCount: number;
  weeklyPosts: number;
  activeAuthors: number;
  score: number;
  createdAt: number;
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, ndk, logout, unlockWithPin, requiresPinUnlock, pinUnlockError, dismissPinUnlock } = useNostr();
  const navigate = useNavigate();
  useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [isUnlockingPin, setIsUnlockingPin] = useState(false);

  // Track scroll for sticky header effect
  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Fetch user's communities
  useEffect(() => {
    if (!user || !ndk) {
      setMyCommunities([]);
      return;
    }

    const sub = ndk.subscribe(
      {
        kinds: [30001],
        authors: [user.pubkey],
        "#d": ["communities"]
      },
      { closeOnEose: true }
    );

    sub.on("event", (event: NDKEvent) => {
      const communityRefs = event.tags
        .filter(t => t[0] === "a")
        .map(t => t[1])
        .filter(atag => atag.startsWith("34550:"));

      // Fetch community details
      communityRefs.forEach(async (atag) => {
        const [, pubkey, id] = atag.split(":");
        const community = await ndk.fetchEvent({
          kinds: [34550 as any],
          authors: [pubkey],
          "#d": [id]
        });
        
        if (community) {
          const name = community.tags.find(t => t[0] === "name")?.[1] || "Unnamed";
          setMyCommunities(prev => {
            const exists = prev.some(c => c.id === id && c.pubkey === pubkey);
            if (exists) return prev;
            return [...prev, { id, pubkey, name }];
          });
        }
      });
    });

    return () => {
      sub.stop();
    };
  }, [ndk, user]);

  const handleLogout = () => {
    logout();
    navigate("/");
    setSidebarOpen(false);
  };

  const handlePinUnlock = async (pin: string) => {
    setIsUnlockingPin(true);
    try {
      const success = await unlockWithPin(pin);
      if (success) {
        setShowLoginModal(false);
      }
    } finally {
      setIsUnlockingPin(false);
    }
  };

  const handleClosePinUnlock = () => {
    dismissPinUnlock();
    setShowLoginModal(true);
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Top Navbar - Clean & Modern */}
      <header className={`sticky top-0 z-50 flex items-center justify-between px-4 h-16 border-b bg-background/80 backdrop-blur-xl transition-shadow ${scrolled ? "shadow-sm" : ""}`}>
        <div className="flex items-center gap-3">
          {/* Hamburger menu */}
          <button 
            className="lg:hidden p-2 -ml-2 hover:bg-secondary rounded-xl transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          {/* Logo */}
          <div 
            className="flex items-center gap-2.5 cursor-pointer group"
            onClick={() => navigate("/")}
          >
            <div className="w-9 h-9 rounded-xl bg-[var(--primary)] flex items-center justify-center text-white font-bold text-lg shadow-sm">
              N
            </div>
            <span className="font-bold text-lg tracking-tight hidden sm:block">NostrReddit</span>
          </div>
        </div>
        
        {/* Search - Clean minimal style */}
        <div className="flex-1 max-w-xl mx-4 hidden md:block">
          <div className="relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/50" size={18} />
            <input 
              type="text" 
              placeholder="Search..." 
              onFocus={() => navigate("/search")}
              className="search-input"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center gap-1">
          {/* Mobile search */}
          <button 
            onClick={() => navigate("/search")}
            className="md:hidden p-2.5 hover:bg-secondary rounded-xl transition-colors text-muted-foreground"
          >
            <Search size={20} />
          </button>

          {/* Theme picker */}
          <button 
            onClick={() => setShowThemeModal(true)}
            className="p-2.5 hover:bg-secondary rounded-xl transition-colors text-muted-foreground"
            title="Change appearance"
          >
            <Palette size={20} className="text-primary-custom" />
          </button>

          {/* Settings */}
          <button 
            onClick={() => navigate("/relays")}
            className="hidden sm:flex p-2.5 hover:bg-secondary rounded-xl transition-colors text-muted-foreground"
          >
            <Settings size={20} />
          </button>

          {user ? (
            <div className="flex items-center gap-2 ml-2">
              {/* Notifications */}
              <button className="relative p-2.5 hover:bg-secondary rounded-xl transition-colors text-muted-foreground">
                <Bell size={20} />
                <span className="absolute top-2 right-2 w-2 h-2 bg-[var(--primary)] rounded-full"></span>
              </button>
              
              {/* User avatar */}
              <button 
                onClick={() => navigate(`/profile/${user.pubkey}`)}
                className="flex items-center gap-2 pl-2 pr-3 py-1.5 hover:bg-secondary rounded-xl transition-colors"
              >
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gray-200 to-gray-300 dark:from-gray-700 dark:to-gray-600 flex items-center justify-center text-sm font-medium">
                  {user.profile?.name?.[0]?.toUpperCase() || "U"}
                </div>
                <span className="hidden lg:block text-sm font-medium">
                  {user.profile?.name || "User"}
                </span>
              </button>

              <button
                onClick={handleLogout}
                className="hidden sm:flex items-center gap-2 px-3 py-2 hover:bg-secondary rounded-xl transition-colors text-muted-foreground hover:text-foreground"
                title="Log out"
              >
                <LogOut size={18} />
                <span className="hidden xl:inline text-sm font-medium">Log Out</span>
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowLoginModal(true)}
              className="ml-2 btn-primary"
            >
              <LogIn size={18} />
              <span className="hidden sm:inline">Log In</span>
            </button>
          )}
        </div>
      </header>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />
      <PinUnlockModal
        isOpen={requiresPinUnlock && !user}
        onClose={handleClosePinUnlock}
        onUnlock={(pin) => {
          if (isUnlockingPin) return;
          void handlePinUnlock(pin);
        }}
        error={pinUnlockError}
        isLoading={isUnlockingPin}
      />
      <ThemeModal isOpen={showThemeModal} onClose={() => setShowThemeModal(false)} />

      <div className="flex flex-1 w-full relative">
        {/* Sidebar backdrop for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar - Fixed width on desktop */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 w-[272px] bg-background z-50 transform lg:translate-x-0 transition-transform duration-300 ease-in-out border-r
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
          top-14 lg:top-0 h-[calc(100vh-3.5rem)] lg:h-auto
        `}>
          <div className="flex flex-col h-full p-4 space-y-6 overflow-y-auto">
            {/* Navigation */}
            <div className="space-y-1">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-2 mb-3">Navigation</p>
              
              <SidebarItem 
                icon={<Home size={20} />} 
                label="Home" 
                onClick={() => { navigate("/"); setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={<Compass size={20} />} 
                label="Explore" 
                onClick={() => { navigate("/explore"); setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={<Search size={20} />} 
                label="Search" 
                onClick={() => { navigate("/search"); setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={<Users size={20} />} 
                label="Communities" 
                onClick={() => { navigate("/communities"); setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={<Settings size={20} />} 
                label="Relays" 
                onClick={() => { navigate("/relays"); setSidebarOpen(false); }} 
              />
              
              {user && (
                <>
                  <SidebarItem 
                    icon={<User size={20} />} 
                    label="Profile" 
                    onClick={() => { navigate(`/profile/${user.pubkey}`); setSidebarOpen(false); }} 
                  />
                  <SidebarItem
                    icon={<LogOut size={20} />}
                    label="Log Out"
                    onClick={handleLogout}
                  />
                </>
              )}
            </div>

            {/* My Communities */}
            <div className="space-y-1 pt-6 border-t flex-1 overflow-hidden">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-2 mb-3">My Communities</p>
              
              {!user ? (
                <div className="px-2">
                  <div className="text-xs text-muted-foreground italic bg-accent/30 p-4 rounded-lg border border-dashed text-center">
                    Sign in to see your communities
                  </div>
                </div>
              ) : myCommunities.length === 0 ? (
                <div className="px-2">
                  <div className="text-xs text-muted-foreground italic bg-accent/30 p-4 rounded-lg border border-dashed text-center">
                    Join communities to see them here
                  </div>
                </div>
              ) : (
                <div className="space-y-1 max-h-48 overflow-y-auto scrollbar-thin">
                  {myCommunities.map((community) => (
                    <div
                      key={`${community.pubkey}:${community.id}`}
                      onClick={() => {
                        navigate(`/community/${community.pubkey}/${community.id}`);
                        setSidebarOpen(false);
                      }}
                      className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all group"
                    >
                      <div className="w-6 h-6 bg-[var(--primary)]/20 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-[var(--primary)]">{community.name[0].toUpperCase()}</span>
                      </div>
                      <span className="text-sm font-medium truncate group-hover:text-[var(--primary)] transition-colors">
                        r/{community.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content - Reddit-like max-width */}
        <main className="flex-1 min-w-0 p-0 sm:p-4 lg:p-6 pb-20 lg:pb-6">
          <div className="max-w-[920px] mx-auto">
            {children}
          </div>
        </main>

        {/* Right Sidebar - Desktop only, fixed width 316px */}
        <aside className="w-[316px] hidden xl:block p-6 space-y-6 flex-shrink-0">
          <TrendingCommunities />
          <NostrGuide />
        </aside>
      </div>

      {/* Bottom Navigation - Mobile only */}
      <BottomNav />
    </div>
  );
};

// Helper components
const SidebarItem: React.FC<{ icon: React.ReactNode; label: string; onClick: () => void }> = ({ 
  icon, label, onClick 
}) => (
  <div 
    onClick={onClick}
    className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all"
  >
    {icon}
    <span className="text-sm font-medium">{label}</span>
  </div>
);

const TrendingCommunities: React.FC = () => {
  const { ndk, user } = useNostr();
  const navigate = useNavigate();
  const { isMember, joinCommunity, leaveCommunity } = useCommunityMembership();
  const [communities, setCommunities] = useState<TrendingCommunity[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [joiningId, setJoiningId] = useState<string | null>(null);

  useEffect(() => {
    let isActive = true;

    const loadTrendingCommunities = async () => {
      setIsLoading(true);

      try {
        const [communityEvents, membershipEvents, recentPosts] = await Promise.all([
          ndk.fetchEvents({ kinds: [34550 as any], limit: 100 }, { closeOnEose: true }),
          ndk.fetchEvents(
            { kinds: [30001], "#d": ["communities"], limit: 1000 },
            { closeOnEose: true }
          ),
          ndk.fetchEvents({ kinds: [NDKKind.Text], limit: 1500 }, { closeOnEose: true }),
        ]);

        const communityList = Array.from(communityEvents).map((event) => {
          const id = event.tags.find((tag) => tag[0] === "d")?.[1] || event.id;
          const name = event.tags.find((tag) => tag[0] === "name")?.[1] || "Unnamed";
          const description = event.tags.find((tag) => tag[0] === "description")?.[1] || "";

          return {
            id,
            pubkey: event.pubkey,
            name,
            description,
            memberCount: 0,
            weeklyPosts: 0,
            activeAuthors: 0,
            score: 0,
            createdAt: event.created_at || 0,
          } satisfies TrendingCommunity;
        });

        const latestMembershipByAuthor = new Map<string, NDKEvent>();
        Array.from(membershipEvents).forEach((event) => {
          const existing = latestMembershipByAuthor.get(event.pubkey);
          if (!existing || (event.created_at || 0) > (existing.created_at || 0)) {
            latestMembershipByAuthor.set(event.pubkey, event);
          }
        });

        const memberCounts = new Map<string, number>();
        latestMembershipByAuthor.forEach((event) => {
          event.tags
            .filter((tag) => tag[0] === "a" && tag[1]?.startsWith("34550:"))
            .forEach((tag) => {
              const atag = tag[1];
              memberCounts.set(atag, (memberCounts.get(atag) || 0) + 1);
            });
        });

        const sevenDaysAgo = Math.floor(Date.now() / 1000) - 7 * 24 * 60 * 60;
        const communityActivity = new Map<string, { posts: number; authors: Set<string> }>();

        Array.from(recentPosts).forEach((event) => {
          const createdAt = event.created_at || 0;
          if (createdAt < sevenDaysAgo) return;

          const communityTag = event.tags.find((tag) => tag[0] === "a" && tag[1]?.startsWith("34550:"))?.[1];
          if (!communityTag) return;

          const existing = communityActivity.get(communityTag) || { posts: 0, authors: new Set<string>() };
          existing.posts += 1;
          existing.authors.add(event.pubkey);
          communityActivity.set(communityTag, existing);
        });

        const withStats = communityList
          .map((community) => {
            const atag = `34550:${community.pubkey}:${community.id}`;
            const members = memberCounts.get(atag) || 0;
            const activity = communityActivity.get(atag);
            const weeklyPosts = activity?.posts || 0;
            const activeAuthors = activity?.authors.size || 0;
            const score = weeklyPosts * 2 + activeAuthors + Math.min(members, 100) * 0.1;

            return {
              ...community,
              memberCount: members,
              weeklyPosts,
              activeAuthors,
              score,
            };
          })
          .sort((a, b) => {
            if (b.score !== a.score) return b.score - a.score;
            if (b.weeklyPosts !== a.weeklyPosts) return b.weeklyPosts - a.weeklyPosts;
            return b.createdAt - a.createdAt;
          });

        const fallbackList = [...withStats]
          .sort((a, b) => b.createdAt - a.createdAt)
          .slice(0, 5);

        const trendingList = withStats.filter((community) => community.score > 0).slice(0, 5);
        if (isActive) {
          setCommunities(trendingList.length > 0 ? trendingList : fallbackList);
        }
      } catch (error) {
        logger.error("Failed to load trending communities", error);
        if (isActive) {
          setCommunities([]);
        }
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    void loadTrendingCommunities();

    return () => {
      isActive = false;
    };
  }, [ndk]);

  const handleJoinToggle = async (event: React.MouseEvent<HTMLButtonElement>, community: TrendingCommunity) => {
    event.stopPropagation();

    if (!user) {
      navigate("/communities");
      return;
    }

    const key = `${community.pubkey}:${community.id}`;
    const alreadyMember = isMember(community.pubkey, community.id);

    setJoiningId(key);
    try {
      const ok = alreadyMember
        ? await leaveCommunity(community.pubkey, community.id)
        : await joinCommunity(community.pubkey, community.id);

      if (ok) {
        setCommunities((prev) =>
          prev.map((item) => {
            if (item.pubkey !== community.pubkey || item.id !== community.id) return item;
            const nextCount = alreadyMember
              ? Math.max(0, item.memberCount - 1)
              : item.memberCount + 1;
            return { ...item, memberCount: nextCount };
          })
        );
      }
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
      <div className="h-12 bg-[var(--primary)] flex items-center px-4">
        <h3 className="font-black text-white text-xs uppercase tracking-widest leading-none">Trending Communities</h3>
      </div>
      <div className="p-4 space-y-4">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Loading communities...</div>
        ) : communities.length === 0 ? (
          <div className="text-xs text-muted-foreground">No community activity yet.</div>
        ) : (
          communities.map((community, index) => {
            const key = `${community.pubkey}:${community.id}`;
            const joined = isMember(community.pubkey, community.id);
            const isJoining = joiningId === key;
            const statsLabel = community.weeklyPosts > 0
              ? `${community.weeklyPosts} posts / 7d`
              : `${community.memberCount} members`;

            return (
              <div
                key={key}
                onClick={() => navigate(`/community/${community.pubkey}/${community.id}`)}
                className="flex items-center justify-between group cursor-pointer"
              >
                <div className="flex items-center space-x-3 min-w-0">
                  <div className="w-9 h-9 bg-accent rounded-full border flex items-center justify-center font-bold text-xs shrink-0">
                    {index + 1}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <span className="text-sm font-bold group-hover:text-[var(--primary)] transition-colors truncate">
                      r/{community.name}
                    </span>
                    <span className="text-[11px] text-muted-foreground truncate">
                      {statsLabel}
                    </span>
                  </div>
                </div>
                <button
                  onClick={(event) => void handleJoinToggle(event, community)}
                  disabled={isJoining}
                  className={`px-4 py-1.5 rounded-full text-[11px] font-bold transition-all shrink-0 ${
                    joined
                      ? "bg-accent text-foreground hover:bg-accent/80"
                      : "bg-foreground text-background hover:opacity-90"
                  } ${isJoining ? "opacity-60 cursor-not-allowed" : "active:scale-95"}`}
                >
                  {isJoining ? "..." : joined ? "Joined" : "Join"}
                </button>
              </div>
            );
          })
        )}
        <button
          onClick={() => navigate("/communities")}
          className="w-full mt-2 py-2 text-xs font-bold bg-accent hover:bg-accent/80 rounded-lg transition-colors"
        >
          View All
        </button>
      </div>
    </div>
  );
};

const NostrGuide: React.FC = () => (
  <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
    <h3 className="font-bold text-sm">NostrReddit Guide</h3>
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Welcome to the decentralized frontier. Here, your voice is yours, powered by Nostr.
      </p>
      <ul className="space-y-2">
        <li className="flex items-start space-x-2 text-[11px] text-muted-foreground">
          <div className="w-1 h-1 bg-[var(--primary)] rounded-full mt-1.5 shrink-0" />
          <span>Posts are Kind 1 notes</span>
        </li>
        <li className="flex items-start space-x-2 text-[11px] text-muted-foreground">
          <div className="w-1 h-1 bg-[var(--primary)] rounded-full mt-1.5 shrink-0" />
          <span>Communities use NIP-72</span>
        </li>
      </ul>
    </div>
    <div className="pt-4 border-t flex flex-wrap gap-x-4 gap-y-2 text-[11px] text-muted-foreground font-medium">
      <a href="#" className="hover:text-foreground transition-colors">Policy</a>
      <a href="#" className="hover:text-foreground transition-colors">Help</a>
      <a href="#" className="hover:text-foreground transition-colors">Contact</a>
    </div>
  </div>
);
