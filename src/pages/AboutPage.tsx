import { GlobeIcon, InfoCircledIcon, LockClosedIcon, RocketIcon } from "@radix-ui/react-icons";

export function AboutPage() {
  return (
    <div className="space-y-5">
      <section className="relative overflow-hidden rounded-3xl border border-border/80 bg-card/90 p-6 shadow-[0_30px_70px_-50px_rgba(0,0,0,0.75)] sm:p-8">
        <div className="pointer-events-none absolute -right-16 -top-12 h-52 w-52 rounded-full bg-[var(--primary)]/12 blur-3xl" />
        <div className="relative z-10">
          <p className="text-[11px] font-black uppercase tracking-[0.2em] text-muted-foreground">About App</p>
          <h1 className="mt-2 text-3xl font-black tracking-tight sm:text-4xl">About Nostr Frontier</h1>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Nostr Frontier is a community-first forum client built on top of Nostr relays. It brings Reddit-like
            discussion flows to a decentralized network where no single server owns your content.
          </p>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-3">
        <article className="rounded-2xl border border-border/80 bg-card/85 p-5 shadow-[0_24px_55px_-45px_rgba(0,0,0,0.8)]">
          <span className="grid h-9 w-9 place-content-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
            <GlobeIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">Decentralized by default</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Posts, comments, and communities are synced through relays. You can connect to multiple relays and keep
            reading even if one goes down.
          </p>
        </article>

        <article className="rounded-2xl border border-border/80 bg-card/85 p-5 shadow-[0_24px_55px_-45px_rgba(0,0,0,0.8)]">
          <span className="grid h-9 w-9 place-content-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
            <LockClosedIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">Your key, your identity</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            Authentication uses your Nostr keypair. Your profile and social graph are portable across compatible
            clients, so your account is not locked to one app.
          </p>
        </article>

        <article className="rounded-2xl border border-border/80 bg-card/85 p-5 shadow-[0_24px_55px_-45px_rgba(0,0,0,0.8)]">
          <span className="grid h-9 w-9 place-content-center rounded-lg bg-[var(--primary)]/15 text-[var(--primary)]">
            <RocketIcon className="h-5 w-5" />
          </span>
          <h2 className="mt-3 text-lg font-extrabold">Made for discussions</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            The interface focuses on fast community browsing, structured threads, and relay management so you can spend
            more time reading and less time configuring.
          </p>
        </article>
      </section>

      <section className="rounded-2xl border border-border/80 bg-card/85 p-5 sm:p-6">
        <div className="flex items-center gap-2">
          <span className="grid h-8 w-8 place-content-center rounded-lg border border-border/80 bg-muted/35 text-[var(--primary)]">
            <InfoCircledIcon className="h-4 w-4" />
          </span>
          <h3 className="text-sm font-black uppercase tracking-[0.16em] text-muted-foreground">In short</h3>
        </div>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          This app is an open discussion layer over Nostr: decentralized transport, portable identity, and a forum UI
          that feels familiar while remaining sovereign.
        </p>
      </section>
    </div>
  );
}
