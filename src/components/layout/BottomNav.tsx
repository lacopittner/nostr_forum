import React, { useState, useEffect } from "react";
import { Home, Search, Users, User, Plus } from "lucide-react";
import { useNostr } from "../../providers/NostrProvider";
import { useNavigate, useLocation } from "react-router-dom";

export const BottomNav: React.FC = () => {
  const { user } = useNostr();
  const navigate = useNavigate();
  const location = useLocation();
  const [showCreateMenu, setShowCreateMenu] = useState(false);

  const isActive = (path: string) => {
    if (path === "/" && location.pathname === "/") return true;
    if (path !== "/" && location.pathname.startsWith(path)) return true;
    return false;
  };

  const navItems = [
    { icon: Home, label: "Home", path: "/" },
    { icon: Search, label: "Search", path: "/search" },
    { icon: null, label: "Create", path: null, isAction: true },
    { icon: Users, label: "Communities", path: "/communities" },
    { icon: User, label: "Profile", path: user ? `/profile/${user.pubkey}` : "/" },
  ];

  const handleNav = (path: string | null, isAction?: boolean) => {
    if (isAction) {
      setShowCreateMenu(!showCreateMenu);
      return;
    }
    if (path) navigate(path);
  };

  // Close menu on route change
  useEffect(() => {
    setShowCreateMenu(false);
  }, [location.pathname]);

  return (
    <>
      {/* Create Menu Overlay */}
      {showCreateMenu && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 md:hidden"
          onClick={() => setShowCreateMenu(false)}
        >
          <div 
            className="absolute bottom-20 left-4 right-4 bg-card border rounded-2xl p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-muted-foreground mb-3 px-2">Create</h3>
            <button
              onClick={() => {
                navigate("/communities");
                setShowCreateMenu(false);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left"
            >
              <div className="w-10 h-10 bg-[var(--primary)] rounded-full flex items-center justify-center">
                <Users size={20} className="text-white" />
              </div>
              <div>
                <p className="font-bold">New Community</p>
                <p className="text-xs text-muted-foreground">Create a subreddit-like community</p>
              </div>
            </button>
            <button
              onClick={() => {
                navigate("/");
                setShowCreateMenu(false);
                // Focus the create post textarea after navigation
                setTimeout(() => {
                  const textarea = document.querySelector('textarea[placeholder*="mind"]') as HTMLTextAreaElement;
                  textarea?.focus();
                }, 100);
              }}
              className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-accent transition-colors text-left mt-2"
            >
              <div className="w-10 h-10 bg-blue-600 rounded-full flex items-center justify-center">
                <Plus size={20} className="text-white" />
              </div>
              <div>
                <p className="font-bold">New Post</p>
                <p className="text-xs text-muted-foreground">Share something with the world</p>
              </div>
            </button>
          </div>
        </div>
      )}

      {/* Bottom Navigation Bar */}
      <nav className="fixed bottom-0 left-0 right-0 bg-background border-t z-50 md:hidden safe-area-pb">
        <div className="flex items-center justify-around h-16">
          {navItems.map((item, index) => {
            const Icon = item.icon;
            const active = item.path ? isActive(item.path) : false;

            if (item.isAction) {
              return (
                <button
                  key={index}
                  onClick={() => handleNav(null, true)}
                  className={`flex items-center justify-center w-12 h-12 rounded-full transition-all ${
                    showCreateMenu 
                      ? "bg-[var(--primary)] text-white rotate-45" 
                      : "bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
                  }`}
                >
                  <Plus size={24} />
                </button>
              );
            }

            return (
              <button
                key={index}
                onClick={() => handleNav(item.path)}
                className={`flex flex-col items-center justify-center flex-1 h-full transition-colors ${
                  active 
                    ? "text-[var(--primary)]" 
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {Icon && <Icon size={22} strokeWidth={active ? 2.5 : 2} />}
                <span className="text-[10px] mt-0.5 font-medium">{item.label}</span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
