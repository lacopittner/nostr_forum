import React, { useEffect, useState } from "react";
import {
  BellIcon,
  Cross2Icon,
  EnterIcon,
  ExitIcon,
  GearIcon,
  GlobeIcon,
  GroupIcon,
  HamburgerMenuIcon,
  HomeIcon,
  InfoCircledIcon,
  MagnifyingGlassIcon,
  MixerHorizontalIcon,
  PersonIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { useNostr } from "../../providers/NostrProvider";
import { useLocation, useNavigate } from "react-router-dom";
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

type IconType = React.ElementType<{ className?: string }>;

export const AppShell: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, ndk, logout, unlockWithPin, requiresPinUnlock, pinUnlockError, dismissPinUnlock } = useNostr();
  const navigate = useNavigate();
  const location = useLocation();
  useTheme();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [myCommunities, setMyCommunities] = useState<Community[]>([]);
  const [scrolled, setScrolled] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [showThemeModal, setShowThemeModal] = useState(false);
  const [isUnlockingPin, setIsUnlockingPin] = useState(false);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener("scroll", handleScroll);
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!user || !ndk) {
      setMyCommunities([]);
      return;
    }

    let isActive = true;

    const sub = ndk.subscribe(
      {
        kinds: [30001],
        authors: [user.pubkey],
        "#d": ["communities"],
      },
      { closeOnEose: true }
    );

    sub.on("event", (event: NDKEvent) => {
      const communityRefs = event.tags
        .filter((t) => t[0] === "a")
        .map((t) => t[1])
        .filter((atag) => atag.startsWith("34550:"));

      communityRefs.forEach(async (atag) => {
        const [, pubkey, id] = atag.split(":");
        const community = await ndk.fetchEvent({
          kinds: [34550 as any],
          authors: [pubkey],
          "#d": [id],
        });

        if (!community || !isActive) return;

        const name = community.tags.find((t) => t[0] === "name")?.[1] || "Unnamed";
        setMyCommunities((prev) => {
          const exists = prev.some((c) => c.id === id && c.pubkey === pubkey);
          if (exists) return prev;
          return [...prev, { id, pubkey, name }];
        });
      });
    });

    return () => {
      isActive = false;
      sub.stop();
    };
  }, [ndk, user]);

  const isActiveRoute = (path: string) => {
    if (path === "/") return location.pathname === "/";
    return location.pathname.startsWith(path);
  };

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

  const currentUserName = user?.profile?.name || "Anonymous";
  const currentUserInitial = currentUserName[0]?.toUpperCase() || "U";

  return (
    <div className="relative flex min-h-screen flex-col bg-background text-foreground">
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -left-32 -top-40 h-[30rem] w-[30rem] rounded-full bg-[var(--primary)]/20 blur-3xl" />
        <div className="absolute -right-20 top-24 h-[26rem] w-[26rem] rounded-full bg-cyan-500/20 blur-3xl" />
      </div>

      <header
        className={`sticky top-0 z-50 border-b border-border/70 transition-all duration-300 ${
          scrolled
            ? "bg-background/90 shadow-[0_14px_36px_-26px_rgba(0,0,0,0.8)] backdrop-blur-2xl"
            : "bg-background/75 backdrop-blur-xl"
        }`}
      >
        <div className="flex h-[4.25rem] w-full items-center gap-2 px-3 sm:gap-3 sm:px-5">
          <button
            type="button"
            className="grid h-10 w-10 place-content-center rounded-xl border border-border/60 bg-card/70 text-muted-foreground transition hover:border-[var(--primary)]/45 hover:text-[var(--primary)] lg:hidden"
            onClick={() => setSidebarOpen((prev) => !prev)}
            aria-label="Toggle sidebar"
          >
            {sidebarOpen ? <Cross2Icon className="h-5 w-5" /> : <HamburgerMenuIcon className="h-5 w-5" />}
          </button>

          <button
            type="button"
            className="group flex items-center gap-2 rounded-2xl px-1 py-1 transition hover:bg-card/60"
            onClick={() => navigate("/")}
          >
            <span className="relative grid h-10 w-10 place-content-center overflow-hidden rounded-xl border border-[var(--primary)]/30 bg-[linear-gradient(135deg,var(--primary)_0%,hsl(var(--primary-hue)_100%_36%)_100%)] text-white shadow-[0_14px_34px_-20px_var(--primary)]">
              <RocketIcon className="h-5 w-5" />
            </span>
            <span className="hidden flex-col leading-none sm:flex">
              <span className="text-[0.95rem] font-extrabold uppercase tracking-[0.08em]">Nostr Frontier</span>
              <span className="text-[0.62rem] font-semibold uppercase tracking-[0.2em] text-muted-foreground/90">
                Relay-native forum
              </span>
            </span>
          </button>

          <div className="relative hidden max-w-2xl flex-1 md:block">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search communities, npubs, posts"
              onFocus={() => navigate("/search")}
              className="search-input h-11 w-full rounded-2xl border border-border/70 pl-10 pr-4"
            />
          </div>

          <div className="ml-auto flex items-center gap-1">
            <button
              type="button"
              onClick={() => navigate("/search")}
              className="grid h-10 w-10 place-content-center rounded-xl border border-border/60 bg-card/70 text-muted-foreground transition hover:border-[var(--primary)]/45 hover:text-[var(--primary)] md:hidden"
              aria-label="Search"
            >
              <MagnifyingGlassIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => setShowThemeModal(true)}
              className="grid h-10 w-10 place-content-center rounded-xl border border-border/60 bg-card/70 text-muted-foreground transition hover:border-[var(--primary)]/45 hover:text-[var(--primary)]"
              title="Appearance"
            >
              <MixerHorizontalIcon className="h-5 w-5" />
            </button>

            <button
              type="button"
              onClick={() => navigate("/relays")}
              className="hidden h-10 items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-[var(--primary)]/45 hover:text-foreground sm:flex"
            >
              <GearIcon className="h-4 w-4" />
              Relays
            </button>

            {user ? (
              <div className="ml-1 flex items-center gap-1.5 sm:ml-2">
                <button
                  type="button"
                  className="relative grid h-10 w-10 place-content-center rounded-xl border border-border/60 bg-card/70 text-muted-foreground transition hover:border-[var(--primary)]/45 hover:text-[var(--primary)]"
                  aria-label="Notifications"
                >
                  <BellIcon className="h-5 w-5" />
                  <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-[var(--primary)]" />
                </button>

                <button
                  type="button"
                  onClick={() => navigate(`/profile/${user.pubkey}`)}
                  className="flex items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-2 py-1.5 transition hover:border-[var(--primary)]/45"
                >
                  <span className="grid h-7 w-7 place-content-center rounded-lg bg-[linear-gradient(140deg,var(--primary)_0%,hsl(var(--primary-hue)_100%_36%)_100%)] text-xs font-bold text-white">
                    {currentUserInitial}
                  </span>
                  <span className="hidden max-w-[8.5rem] truncate text-sm font-semibold lg:block">
                    {currentUserName}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={handleLogout}
                  className="hidden h-10 items-center gap-2 rounded-xl border border-border/60 bg-card/70 px-3 text-sm font-semibold text-muted-foreground transition hover:border-red-400/45 hover:text-red-400 md:flex"
                >
                  <ExitIcon className="h-4 w-4" />
                  Log out
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setShowLoginModal(true)} className="ml-2 btn-primary h-10 px-4 text-sm">
                <EnterIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Log in</span>
              </button>
            )}
          </div>
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

      <div className="flex w-full flex-1 gap-4 px-3 pb-[calc(env(safe-area-inset-bottom)+5.5rem)] pt-4 sm:px-5 lg:pb-6">
        {sidebarOpen && (
          <div
            className="fixed inset-0 top-[4.25rem] z-40 bg-black/45 backdrop-blur-sm lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <aside
          className={`fixed inset-y-0 left-0 z-50 w-[288px] -translate-x-full transform transition duration-300 lg:sticky lg:top-[5rem] lg:z-20 lg:h-[calc(100vh-6rem)] lg:w-[280px] lg:translate-x-0 ${
            sidebarOpen ? "translate-x-0" : ""
          }`}
        >
          <div className="mt-[4.25rem] h-[calc(100vh-4.25rem)] border-r border-border/60 bg-background/90 px-3 pb-4 pt-3 backdrop-blur-2xl lg:mt-0 lg:h-full lg:rounded-3xl lg:border lg:bg-card/85 lg:p-4">
            <div className="flex h-full flex-col">
              <div className="mb-4 rounded-2xl border border-border/70 bg-muted/40 p-3">
                <p className="text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Signal Status</p>
                <p className="mt-2 text-sm font-semibold">Connected to decentralized relays</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Explore uncensored discussions and community-owned threads.
                </p>
              </div>

              <div className="space-y-1">
                <p className="px-2 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">Navigation</p>

                <SidebarItem icon={HomeIcon} label="Home" active={isActiveRoute("/")} onClick={() => navigate("/")} />
                <SidebarItem
                  icon={GlobeIcon}
                  label="Explore"
                  active={isActiveRoute("/explore")}
                  onClick={() => navigate("/explore")}
                />
                <SidebarItem
                  icon={MagnifyingGlassIcon}
                  label="Search"
                  active={isActiveRoute("/search")}
                  onClick={() => navigate("/search")}
                />
                <SidebarItem
                  icon={GroupIcon}
                  label="Communities"
                  active={isActiveRoute("/communities")}
                  onClick={() => navigate("/communities")}
                />
                <SidebarItem
                  icon={GearIcon}
                  label="Relays"
                  active={isActiveRoute("/relays")}
                  onClick={() => navigate("/relays")}
                />
                <SidebarItem
                  icon={InfoCircledIcon}
                  label="About"
                  active={isActiveRoute("/about")}
                  onClick={() => navigate("/about")}
                />

                {user && (
                  <>
                    <SidebarItem
                      icon={PersonIcon}
                      label="Profile"
                      active={isActiveRoute("/profile")}
                      onClick={() => navigate(`/profile/${user.pubkey}`)}
                    />
                    <SidebarItem icon={ExitIcon} label="Log out" onClick={handleLogout} />
                  </>
                )}
              </div>

              <div className="mt-5 flex-1 overflow-hidden rounded-2xl border border-border/70 bg-muted/35 p-3">
                <p className="mb-2 px-1 text-[10px] font-black uppercase tracking-[0.22em] text-muted-foreground">My Communities</p>

                {!user ? (
                  <div className="rounded-xl border border-dashed border-border/80 bg-card/70 p-3 text-xs text-muted-foreground">
                    Sign in to sync your communities.
                  </div>
                ) : myCommunities.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-border/80 bg-card/70 p-3 text-xs text-muted-foreground">
                    No memberships yet. Join communities to pin them here.
                  </div>
                ) : (
                  <div className="no-scrollbar max-h-[15.5rem] space-y-1 overflow-y-auto pr-1">
                    {myCommunities.map((community) => (
                      <button
                        key={`${community.pubkey}:${community.id}`}
                        type="button"
                        onClick={() => navigate(`/community/${community.pubkey}/${community.id}`)}
                        className="group flex w-full items-center gap-2 rounded-xl border border-transparent bg-card/70 px-2 py-2 text-left transition hover:border-[var(--primary)]/35 hover:bg-card"
                      >
                        <span className="grid h-7 w-7 shrink-0 place-content-center rounded-lg bg-[var(--primary)]/20 text-xs font-black text-[var(--primary)]">
                          {community.name[0]?.toUpperCase() || "#"}
                        </span>
                        <span className="truncate text-sm font-semibold text-foreground/85 group-hover:text-foreground">
                          r/{community.name}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </aside>

        <main className="min-w-0 flex-1">
          <div className="mx-auto w-full max-w-[980px] space-y-4">
            <div className="hidden items-center gap-3 rounded-2xl border border-border/70 bg-card/70 p-3 shadow-[0_20px_40px_-32px_rgba(0,0,0,0.8)] sm:flex">
              <span className="inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-muted-foreground">Live Relay Stream</p>
              <p className="ml-auto text-xs font-medium text-foreground/75">Decentralized, persistent, permissionless</p>
            </div>
            {children}
          </div>
        </main>

        <aside className="sticky top-[5rem] hidden h-[calc(100vh-6rem)] w-[324px] shrink-0 space-y-4 overflow-y-auto pr-1 xl:block">
          <TrendingCommunities />
          <NostrGuide />
        </aside>
      </div>

      <BottomNav />
    </div>
  );
};

const SidebarItem: React.FC<{
  icon: IconType;
  label: string;
  onClick: () => void;
  active?: boolean;
}> = ({ icon: Icon, label, onClick, active = false }) => (
  <button
    type="button"
    onClick={onClick}
    className={`group flex w-full items-center gap-2 rounded-xl border px-2 py-2 text-left transition ${
      active
        ? "border-[var(--primary)]/40 bg-[var(--primary)]/15 text-foreground"
        : "border-transparent bg-transparent text-muted-foreground hover:border-border/70 hover:bg-card/70 hover:text-foreground"
    }`}
  >
    <span
      className={`grid h-8 w-8 place-content-center rounded-lg border ${
        active
          ? "border-[var(--primary)]/40 bg-[var(--primary)]/20 text-[var(--primary)]"
          : "border-border/70 bg-card/70 text-muted-foreground"
      }`}
    >
      <Icon className="h-[18px] w-[18px]" />
    </span>
    <span className="text-sm font-semibold">{label}</span>
  </button>
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
            const nextCount = alreadyMember ? Math.max(0, item.memberCount - 1) : item.memberCount + 1;
            return { ...item, memberCount: nextCount };
          })
        );
      }
    } finally {
      setJoiningId(null);
    }
  };

  return (
    <div className="overflow-hidden rounded-3xl border border-border/80 bg-card/90 shadow-[0_30px_70px_-50px_rgba(0,0,0,0.75)]">
      <div className="border-b border-border/70 bg-[linear-gradient(120deg,var(--primary)_0%,hsl(var(--primary-hue)_100%_38%)_90%)] px-4 py-3 text-[var(--primary-foreground)]">
        <h3 className="text-[11px] font-black uppercase tracking-[0.22em]">Trending Communities</h3>
      </div>
      <div className="space-y-3 p-4">
        {isLoading ? (
          <div className="text-xs text-muted-foreground">Scanning relay activity...</div>
        ) : communities.length === 0 ? (
          <div className="text-xs text-muted-foreground">No activity yet. You can lead the first wave.</div>
        ) : (
          communities.map((community, index) => {
            const key = `${community.pubkey}:${community.id}`;
            const joined = isMember(community.pubkey, community.id);
            const isJoining = joiningId === key;
            const statsLabel =
              community.weeklyPosts > 0 ? `${community.weeklyPosts} posts in 7d` : `${community.memberCount} members`;

            return (
              <div
                key={key}
                role="button"
                tabIndex={0}
                onClick={() => navigate(`/community/${community.pubkey}/${community.id}`)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    navigate(`/community/${community.pubkey}/${community.id}`);
                  }
                }}
                className="group flex w-full cursor-pointer items-center justify-between gap-2 rounded-2xl border border-border/70 bg-muted/35 p-3 text-left transition hover:border-[var(--primary)]/35 hover:bg-card"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="grid h-6 w-6 shrink-0 place-content-center rounded-md bg-[var(--primary)]/20 text-[10px] font-black text-[var(--primary)]">
                      {index + 1}
                    </span>
                    <span className="truncate text-sm font-bold group-hover:text-[var(--primary)]">r/{community.name}</span>
                  </div>
                  <p className="mt-1 truncate pl-8 text-[11px] text-muted-foreground">{statsLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={(clickEvent) => void handleJoinToggle(clickEvent, community)}
                  disabled={isJoining}
                  className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition ${
                    joined
                      ? "border border-border/80 bg-card text-foreground hover:bg-muted"
                      : "bg-[var(--primary)] text-[var(--primary-foreground)] hover:brightness-110"
                  } ${isJoining ? "opacity-60" : ""}`}
                >
                  {isJoining ? "..." : joined ? "Joined" : "Join"}
                </button>
              </div>
            );
          })
        )}

        <button
          type="button"
          onClick={() => navigate("/communities")}
          className="mt-2 w-full rounded-xl border border-border/80 bg-muted/35 py-2 text-xs font-bold uppercase tracking-[0.14em] text-foreground transition hover:border-[var(--primary)]/40 hover:bg-card"
        >
          View all communities
        </button>
      </div>
    </div>
  );
};

const NostrGuide: React.FC = () => (
  <div className="rounded-3xl border border-border/80 bg-card/90 p-5 shadow-[0_30px_70px_-50px_rgba(0,0,0,0.75)]">
    <p className="text-[11px] font-black uppercase tracking-[0.22em] text-muted-foreground">Nostr Guide</p>
    <h3 className="mt-2 text-lg font-extrabold">Own your timeline</h3>

    <div className="mt-3 space-y-2 text-xs text-muted-foreground">
      <p>Posts are published as kind `1` events and sync across any relay that stores them.</p>
      <p>Communities are NIP-72 groups, so membership and moderation remain portable.</p>
    </div>

    <div className="mt-4 space-y-2 rounded-2xl border border-border/80 bg-muted/35 p-3 text-[11px]">
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        <span>No central server lock-in</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-cyan-400" />
        <span>Identity stays with your keypair</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-[var(--primary)]" />
        <span>Cross-client compatible content</span>
      </div>
    </div>

    <div className="mt-4 flex flex-wrap gap-x-4 gap-y-2 text-[11px] font-semibold text-muted-foreground">
      <a href="#" className="transition hover:text-foreground">
        Policy
      </a>
      <a href="#" className="transition hover:text-foreground">
        Help
      </a>
      <a href="#" className="transition hover:text-foreground">
        Contact
      </a>
    </div>
  </div>
);
