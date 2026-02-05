import React, { useState, useEffect } from "react";
import { Home, LogIn, Menu, X, Sun, Moon, Search, User, Settings, Bell } from "lucide-react";
import { useNostr } from "../../providers/NostrProvider";
import { useNavigate } from "react-router-dom";
import { NDKEvent } from "@nostr-dev-kit/ndk";
import { BottomNav } from "./BottomNav";
import { LoginModal } from "../LoginModal";

interface Community {
  id: string;
  pubkey: string;
  name: string;
}

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, theme, toggleTheme, ndk } = useNostr();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);

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

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Top Navbar - Improved mobile design */}
      <header className={`sticky top-0 z-50 flex items-center justify-between px-3 sm:px-4 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 transition-shadow ${scrolled ? "shadow-sm" : ""}`}>
        <div className="flex items-center space-x-2 sm:space-x-4">
          {/* Hamburger menu - hidden on large screens */}
          <button 
            className="lg:hidden p-2 -ml-2 hover:bg-accent rounded-md transition-colors"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Toggle menu"
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          {/* Logo */}
          <div 
            className="flex items-center space-x-2 cursor-pointer group"
            onClick={() => navigate("/")}
          >
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-black group-hover:bg-orange-500 transition-colors shrink-0">N</div>
            <span className="font-bold text-lg tracking-tighter hidden sm:inline">nostr-reddit</span>
            <span className="font-bold text-lg tracking-tighter sm:hidden">n/r</span>
          </div>
        </div>
        
        {/* Search - Desktop */}
        <div className="flex-1 max-w-2xl mx-2 sm:mx-4 hidden md:block">
          <div className="relative group">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground group-focus-within:text-orange-500 transition-colors" size={16} />
            <input 
              type="text" 
              placeholder="Search..." 
              onFocus={() => navigate("/search")}
              className="w-full bg-accent text-accent-foreground border-none rounded-full pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-orange-500 outline-none transition-all placeholder:text-muted-foreground/60 cursor-pointer"
            />
          </div>
        </div>

        {/* Right side actions */}
        <div className="flex items-center space-x-1 sm:space-x-2">
          {/* Theme toggle */}
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Toggle theme"
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {/* Settings/Relays - Always visible */}
          <button 
            onClick={() => navigate("/relays")}
            className="hidden sm:flex p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Relays"
          >
            <Settings size={20} />
          </button>

          {user ? (
            <div className="flex items-center space-x-1 sm:space-x-3">
              {/* Search - Mobile icon only */}
              <button 
                onClick={() => navigate("/search")}
                className="md:hidden p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
                aria-label="Search"
              >
                <Search size={20} />
              </button>

              {/* Notifications */}
              <button 
                className="hidden sm:flex p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors relative"
                aria-label="Notifications"
              >
                <Bell size={20} />
                {/* Notification badge - placeholder */}
                <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-orange-600 rounded-full"></span>
              </button>
              
              {/* User profile */}
              <button 
                onClick={() => navigate(`/profile/${user.pubkey}`)}
                className="flex items-center space-x-2 pl-1 sm:pl-2 border-l hover:bg-accent/50 rounded-lg transition-colors"
              >
                <div className="w-8 h-8 bg-orange-600/10 border border-orange-600/20 rounded-full overflow-hidden flex items-center justify-center shrink-0">
                  {user.profile?.image ? (
                    <img src={user.profile.image} alt="profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-orange-600">{user.profile?.name?.[0].toUpperCase() || "U"}</span>
                  )}
                </div>
                <div className="hidden lg:flex flex-col items-start leading-none">
                  <span className="text-xs font-bold truncate max-w-[80px]">{user.profile?.name || "Anonymous"}</span>
                  <span className="text-[10px] text-muted-foreground font-mono">{user.npub.slice(0, 6)}...</span>
                </div>
              </button>
            </div>
          ) : (
            <button 
              onClick={() => setShowLoginModal(true)}
              className="flex items-center space-x-1 sm:space-x-2 px-3 sm:px-6 py-2 bg-orange-600 text-white rounded-full text-xs sm:text-sm font-bold hover:bg-orange-700 active:scale-95 transition-all shadow-md shadow-orange-600/20"
            >
              <LogIn size={16} />
              <span className="hidden sm:inline">Log In</span>
              <span className="sm:hidden">Login</span>
            </button>
          )}
        </div>
      </header>

      <LoginModal isOpen={showLoginModal} onClose={() => setShowLoginModal(false)} />

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
          fixed lg:static inset-y-0 left-0 w-64 bg-background z-50 transform lg:translate-x-0 transition-transform duration-300 ease-in-out border-r
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
                icon={<Search size={20} />} 
                label="Search" 
                onClick={() => { navigate("/search"); setSidebarOpen(false); }} 
              />
              <SidebarItem 
                icon={<span className="text-lg">👥</span>} 
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
                      <div className="w-6 h-6 bg-orange-600/20 rounded-full flex items-center justify-center shrink-0">
                        <span className="text-xs font-bold text-orange-600">{community.name[0].toUpperCase()}</span>
                      </div>
                      <span className="text-sm font-medium truncate group-hover:text-orange-500 transition-colors">
                        r/{community.name}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main Content - Full width on desktop, wider posts */}
        <main className="flex-1 min-w-0 p-3 sm:p-4 lg:p-6 pb-20 lg:pb-6">
          <div className="max-w-none lg:max-w-6xl mx-auto">
            {children}
          </div>
        </main>

        {/* Right Sidebar - Desktop only, wider */}
        <aside className="w-80 hidden xl:block p-6 space-y-6 flex-shrink-0">
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

const TrendingCommunities: React.FC = () => (
  <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
    <div className="h-12 bg-orange-600 flex items-center px-4">
      <h3 className="font-black text-white text-xs uppercase tracking-widest leading-none">Trending Communities</h3>
    </div>
    <div className="p-4 space-y-4">
      {[1, 2, 3, 4, 5].map((i) => (
        <div key={i} className="flex items-center justify-between group cursor-pointer">
          <div className="flex items-center space-x-3">
            <div className="w-9 h-9 bg-accent rounded-full border flex items-center justify-center font-bold text-xs shrink-0">
              {i}
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-sm font-bold group-hover:text-orange-500 transition-colors truncate">r/community_{i}</span>
              <span className="text-[11px] text-muted-foreground">12.{i}k members</span>
            </div>
          </div>
          <button className="px-4 py-1.5 bg-foreground text-background rounded-full text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all shrink-0">Join</button>
        </div>
      ))}
      <button className="w-full mt-2 py-2 text-xs font-bold bg-accent hover:bg-accent/80 rounded-lg transition-colors">View All</button>
    </div>
  </div>
);

const NostrGuide: React.FC = () => (
  <div className="bg-card border rounded-xl p-5 shadow-sm space-y-4">
    <h3 className="font-bold text-sm">NostrReddit Guide</h3>
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground leading-relaxed">
        Welcome to the decentralized frontier. Here, your voice is yours, powered by Nostr.
      </p>
      <ul className="space-y-2">
        <li className="flex items-start space-x-2 text-[11px] text-muted-foreground">
          <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5 shrink-0" />
          <span>Posts are Kind 1 notes</span>
        </li>
        <li className="flex items-start space-x-2 text-[11px] text-muted-foreground">
          <div className="w-1 h-1 bg-orange-500 rounded-full mt-1.5 shrink-0" />
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
