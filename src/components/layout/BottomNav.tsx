import React, { useEffect, useState } from "react";
import {
  GroupIcon,
  HomeIcon,
  InfoCircledIcon,
  MagnifyingGlassIcon,
  PersonIcon,
  PlusIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { useNostr } from "../../providers/NostrProvider";
import { useLocation, useNavigate } from "react-router-dom";

type IconType = React.ElementType<{ className?: string }>;

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

  const navItems: Array<{ icon: IconType | null; label: string; path: string | null; isAction?: boolean }> = [
    { icon: HomeIcon, label: "Home", path: "/" },
    { icon: MagnifyingGlassIcon, label: "Search", path: "/search" },
    { icon: null, label: "Create", path: null, isAction: true },
    { icon: GroupIcon, label: "Groups", path: "/communities" },
    { icon: InfoCircledIcon, label: "About", path: "/about" },
    { icon: PersonIcon, label: "Profile", path: user ? `/profile/${user.pubkey}` : "/" },
  ];

  const handleNav = (path: string | null, isAction?: boolean) => {
    if (isAction) {
      setShowCreateMenu((prev) => !prev);
      return;
    }
    if (path) navigate(path);
  };

  useEffect(() => {
    setShowCreateMenu(false);
  }, [location.pathname]);

  return (
    <>
      {showCreateMenu && (
        <div className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm md:hidden" onClick={() => setShowCreateMenu(false)}>
          <div
            className="absolute left-3 right-3 rounded-3xl border border-border/70 bg-card/95 p-4 shadow-[0_32px_60px_-30px_rgba(0,0,0,0.9)]"
            style={{ bottom: "calc(env(safe-area-inset-bottom) + 5.5rem)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <p className="px-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Create</p>

            <button
              type="button"
              onClick={() => {
                navigate("/communities");
                setShowCreateMenu(false);
              }}
              className="mt-3 flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 p-3 text-left transition hover:border-[var(--primary)]/35 hover:bg-card"
            >
              <span className="grid h-11 w-11 place-content-center rounded-xl bg-[var(--primary)] text-[var(--primary-foreground)]">
                <GroupIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">New Community</span>
                <span className="block text-xs text-muted-foreground">Start a relay-native hub for your topic.</span>
              </span>
            </button>

            <button
              type="button"
              onClick={() => {
                navigate("/");
                setShowCreateMenu(false);
                setTimeout(() => {
                  const textarea = document.querySelector('textarea[placeholder*="mind"]') as HTMLTextAreaElement;
                  textarea?.focus();
                }, 120);
              }}
              className="mt-2 flex w-full items-center gap-3 rounded-2xl border border-border/70 bg-muted/35 p-3 text-left transition hover:border-cyan-400/35 hover:bg-card"
            >
              <span className="grid h-11 w-11 place-content-center rounded-xl bg-cyan-500 text-white">
                <RocketIcon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-sm font-bold">New Post</span>
                <span className="block text-xs text-muted-foreground">Broadcast your next idea to the network.</span>
              </span>
            </button>
          </div>
        </div>
      )}

      <nav className="fixed inset-x-0 z-50 px-3 md:hidden" style={{ bottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto flex h-16 w-full max-w-md items-center rounded-3xl border border-border/70 bg-card/95 px-1.5 shadow-[0_30px_55px_-32px_rgba(0,0,0,0.95)] backdrop-blur-xl">
          {navItems.map((item, index) => {
            const active = item.path ? isActive(item.path) : false;
            const Icon = item.icon;

            if (item.isAction) {
              return (
                <button
                  key={index}
                  type="button"
                  onClick={() => handleNav(null, true)}
                  className={`mx-1 grid h-12 w-12 place-content-center rounded-2xl text-white transition ${
                    showCreateMenu
                      ? "rotate-45 bg-[var(--primary)] shadow-[0_16px_26px_-18px_var(--primary)]"
                      : "bg-[linear-gradient(135deg,var(--primary)_0%,hsl(var(--primary-hue)_100%_38%)_100%)] shadow-[0_16px_26px_-18px_var(--primary)]"
                  }`}
                  aria-label="Create"
                >
                  <PlusIcon className="h-6 w-6" />
                </button>
              );
            }

            return (
              <button
                key={index}
                type="button"
                onClick={() => handleNav(item.path)}
                className={`flex h-full flex-1 flex-col items-center justify-center rounded-2xl transition ${
                  active ? "text-[var(--primary)]" : "text-muted-foreground"
                }`}
              >
                {Icon && <Icon className={`h-5 w-5 ${active ? "scale-110" : ""}`} />}
                <span className={`mt-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] ${active ? "text-foreground" : ""}`}>
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </>
  );
};
