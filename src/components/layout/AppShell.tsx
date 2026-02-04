import React, { useState } from "react";
import { Home, LogIn, Menu, X, Sun, Moon, Search, User, Settings } from "lucide-react";
import { useNostr } from "../../providers/NostrProvider";
import { useNavigate } from "react-router-dom";


export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, login, theme, toggleTheme } = useNostr();
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground">
      {/* Top Navbar */}
      <header className="sticky top-0 z-50 flex items-center justify-between px-4 h-14 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="flex items-center space-x-4">
          <button 
            className="lg:hidden p-2 hover:bg-accent rounded-md"
            onClick={() => setSidebarOpen(!sidebarOpen)}
          >
            {sidebarOpen ? <X size={20} /> : <Menu size={20} />}
          </button>
          
          <div className="flex items-center space-x-2 cursor-pointer group">
            <div className="w-8 h-8 bg-orange-600 rounded-full flex items-center justify-center text-white font-black group-hover:bg-orange-500 transition-colors">N</div>
            <span className="font-bold text-lg tracking-tighter hidden sm:inline">nostr-reddit</span>
          </div>
        </div>
        
        <div className="flex-1 max-w-2xl mx-4 hidden md:block">
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

        <div className="flex items-center space-x-2">
          <button 
            onClick={toggleTheme}
            className="p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
          >
            {theme === "light" ? <Moon size={20} /> : <Sun size={20} />}
          </button>

          {user ? (
            <div className="flex items-center space-x-3">
              <button 
                onClick={() => navigate("/search")}
                className="md:hidden p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                <Search size={20} />
              </button>
              <button 
                onClick={() => navigate(`/profile/${user.pubkey}`)}
                className="p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                <User size={20} />
              </button>
              <button 
                onClick={() => navigate("/relays")}
                className="p-2 hover:bg-accent rounded-full text-muted-foreground hover:text-foreground transition-colors"
              >
                <Settings size={20} />
              </button>
              <div className="flex items-center space-x-2 pl-2 border-l h-8">
                <div className="w-8 h-8 bg-orange-600/10 border border-orange-600/20 rounded-full overflow-hidden flex items-center justify-center">
                  {user.profile?.image ? (
                    <img src={user.profile.image} alt="profile" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-xs font-bold text-orange-600">{user.profile?.name?.[0].toUpperCase() || "U"}</span>
                  )}
                </div>
                <div className="hidden lg:flex flex-col items-start leading-none">
                  <span className="text-xs font-bold">{user.profile?.name || "Anonymous"}</span>
                  <span className="text-[10px] text-muted-foreground line-clamp-1 max-w-[80px]">{user.npub.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
          ) : (
            <button 
              onClick={login}
              className="flex items-center space-x-2 px-6 py-2 bg-orange-600 text-white rounded-full text-sm font-bold hover:bg-orange-700 active:scale-95 transition-all shadow-md shadow-orange-600/20"
            >
              <LogIn size={16} />
              <span>Log In</span>
            </button>
          )}
        </div>
      </header>

      <div className="flex flex-1 max-w-7xl mx-auto w-full relative">
        {/* Sidebar backdrop for mobile */}
        {sidebarOpen && (
          <div 
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        {/* Left Sidebar */}
        <aside className={`
          fixed lg:static inset-y-0 left-0 w-64 bg-background z-50 transform lg:translate-x-0 transition-transform duration-300 ease-in-out border-r
          ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}
        `}>
          <div className="flex flex-col h-full p-4 space-y-6">
          <div className="space-y-1">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-2 mb-3">Navigation</p>
              <div 
                onClick={() => {
                  navigate("/");
                  setSidebarOpen(false);
                }}
                className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all"
              >
                <Home size={20} />
                <span className="text-sm font-medium">Home</span>
              </div>
              <div 
                onClick={() => {
                  navigate("/search");
                  setSidebarOpen(false);
                }}
                className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all"
              >
                <Search size={20} />
                <span className="text-sm font-medium">Search</span>
              </div>
              <div 
                onClick={() => {
                  navigate("/communities");
                  setSidebarOpen(false);
                }}
                className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all"
              >
                <span className="text-sm">👥</span>
                <span className="text-sm font-medium">Communities</span>
              </div>
              {user && (
                <>
                  <div 
                    onClick={() => {
                      navigate(`/profile/${user.pubkey}`);
                      setSidebarOpen(false);
                    }}
                    className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all"
                  >
                    <User size={20} />
                    <span className="text-sm font-medium">Profile</span>
                  </div>
                  <div 
                    onClick={() => {
                      navigate("/relays");
                      setSidebarOpen(false);
                    }}
                    className="flex items-center space-x-3 p-2 rounded-lg cursor-pointer hover:bg-accent transition-all"
                  >
                    <Settings size={20} />
                    <span className="text-sm font-medium">Relays</span>
                  </div>
                </>
              )}
            </div>

            <div className="space-y-1 pt-6 border-t">
              <p className="text-[10px] font-black text-muted-foreground uppercase tracking-widest px-2 mb-3">Communities</p>
              <div className="px-2 space-y-2">
                <div className="text-xs text-muted-foreground italic bg-accent/30 p-4 rounded-lg border border-dashed text-center">
                  Sign in to see your communities
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 min-w-0 md:p-6 p-3">
          <div className="max-w-4xl mx-auto">
            {children}
          </div>
        </main>

        {/* Right Sidebar */}
        <aside className="w-80 hidden xl:block p-6 space-y-6">
          <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
            <div className="h-12 bg-orange-600 flex items-center px-4">
              <h3 className="font-black text-white text-xs uppercase tracking-widest leading-none">Trending Communities</h3>
            </div>
            <div className="p-4 space-y-4">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="flex items-center justify-between group cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <div className="w-9 h-9 bg-accent rounded-full border flex items-center justify-center font-bold text-xs">
                      {i}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-bold group-hover:text-orange-500 transition-colors">r/community_{i}</span>
                      <span className="text-[11px] text-muted-foreground">12.{i}k members</span>
                    </div>
                  </div>
                  <button className="px-4 py-1.5 bg-foreground text-background rounded-full text-[11px] font-bold hover:opacity-90 active:scale-95 transition-all">Join</button>
                </div>
              ))}
              <button className="w-full mt-2 py-2 text-xs font-bold bg-accent hover:bg-accent/80 rounded-lg transition-colors">View All</button>
            </div>
          </div>

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
              <a href="#" className="hover:text-foreground">Policy</a>
              <a href="#" className="hover:text-foreground">Help</a>
              <a href="#" className="hover:text-foreground">Contact</a>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
};
