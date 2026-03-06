# About This App

## 1. What this app is
This application is a decentralized Reddit-style forum built on the Nostr protocol.
There is no central backend database for forum content; data is published to and read from Nostr relays.

Tech stack at a glance:
- React + TypeScript + Vite
- NDK (`@nostr-dev-kit/ndk`) for Nostr event operations
- Tailwind CSS for UI
- Hook-based client data flow without a traditional backend API layer

## 2. Application architecture

### 2.1 Routing and shell
Main routes:
- `/` feed
- `/explore`
- `/search`
- `/communities`
- `/community/:pubkey/:communityId`
- `/post/:postId`
- `/profile/:pubkey`
- `/relays`
- `/about`

`AppShell` handles layout, top bar, sidebar, mobile bottom navigation, login modal, theme modal, pin unlock modal, and sidebar widgets (for example trending communities).

### 2.2 NostrProvider (core runtime layer)
`NostrProvider` manages:
- the shared `ndk` instance
- authenticated `user` session
- login/logout flows
- relay connection status
- session restore on refresh

It continuously monitors relay connection state (`connecting/connected/disconnected/error`) and exposes this state to UI components (`ConnectionStatus`).

## 3. Authentication and session security
The app supports 3 auth methods:
- NIP-07 extension login
- `nsec` login with PIN protection
- NIP-46 (Nostr Connect / bunker token)

### 3.1 nsec + PIN
If a user logs in with a private key:
- `nsec` is encrypted locally (PBKDF2 + AES-GCM)
- only encrypted key material and metadata are stored
- future login can use PIN unlock

This means the plaintext private key is not persistently stored in localStorage.

### 3.2 Session restore
On reload, the app restores session in this priority order:
- NIP-46 payload session
- extension session
- encrypted nsec unlock flow

## 4. Relay layer
Relays are managed through `RelayManagementPage` and `lib/ndk.ts`.

Capabilities:
- users can add/remove relay URLs
- relay list is persisted in localStorage (`nostr_relays`)
- app can reconnect using a new relay set
- basic relay health checks are done via WebSocket open attempts

## 5. Communities (NIP-72)
Communities are represented by `kind: 34550` events.

### 5.1 Community metadata
A community event includes tags such as:
- `d` (community unique identifier)
- `name`
- `description`
- `image`
- `rules`
- `p` with `moderator` role
- `flair`
- `closed` or `open`

`src/lib/community.ts` centralizes community tag logic via helpers like `buildCommunityTags`, `getCommunityModerators`, `getCommunityFlairs`, and `isCommunityClosed`.

### 5.2 Membership
Membership is implemented via `kind: 30001` with `d=communities`:
- each joined community is referenced by an `a` tag `34550:<pubkey>:<d>`
- join/leave publishes an updated latest list event for that user

### 5.3 Moderators
Moderator management republishes the community `kind:34550` event (same `d`, updated tags).
The owner is always kept as a moderator.

### 5.4 Community block list
Community-local user blocking uses `kind:34551`:
- `a` = community identity
- `p` = blocked user
- `e` = `block` or `unblock`

On read, the latest action per user is applied, and only events authored by authorized moderators are accepted.

## 6. Posting and moderation inside communities

### 6.1 Post event model
Posts are `kind:1` events.
A community post must include an `a` tag pointing to a community (`34550:...`).

### 6.2 Closed communities
The current default for newly created communities is `closed` mode.
In UI terms:
- non-moderators cannot publish posts into closed communities
- community selection reflects this (disabled options)

### 6.3 Approval event model
Community post moderation status is represented via `kind:4550` events:
- `status=approved` or `status=rejected`
- target post linked via `e` tag
- target community linked via `a` tag

For closed communities, a non-moderator post defaults to `pending` until an approval event exists.

## 7. Feed system
`useFeed` is the main homepage orchestration hook:
- fetches `kind:1` in batches
- keeps only “reddit-like” posts (must include a community `a` tag)
- filters globally blocked pubkeys
- deduplicates events
- fetches comment counts and author profiles incrementally

Sorting:
- `new`: by `created_at`
- `top`: by reaction score
- `hot`: score / log(age)

Feed features:
- infinite loading
- pull-to-refresh on touch devices
- `all` vs `following` filter mode

## 8. Comments and threads (NIP-10 style)
Comments are also `kind:1`, but with thread markers:
- `e` root
- `e` reply
- `p` author references

`PostDetailPage` builds a comment tree from reply relationships.
Nested replies, edit/delete, voting, and image/markdown composing are supported.

## 9. Voting (NIP-25 style)
`useVoting` uses reaction events:
- `kind:7`, content `+` or `-`
- unvote is handled by publishing `kind:5` deletion for the previous reaction event

Implementation details:
- optimistic UI updates
- per-target vote lock while publishing
- rate limiting
- reaction map model: `targetId -> pubkey -> latest reaction`
- incoming reaction/deletion processing for live consistency

## 10. Profile features
`ProfilePage` includes:
- profile metadata read (`kind:0`)
- profile editing (publishes new `kind:0`)
- tabs: posts/comments/saved/blocked/upvoted/downvoted
- follow/unfollow controls
- NIP-05 verification display

### 10.1 Follows
Follow graph is based on `kind:3` Contacts events:
- followed accounts are listed in `p` tags
- follow/unfollow republishes a new contacts event

### 10.2 NIP-05
NIP-05 verification flow:
- request `https://<domain>/.well-known/nostr.json?name=<name>`
- validate that the returned mapping matches expected pubkey

## 11. Search and Explore

### 11.1 Search
`SearchPage` supports scopes:
- posts
- users
- hashtags

Technical behavior:
- fetch relevant event sets (`kind:1` or `kind:0`)
- build a lightweight client-side token index
- apply scoring and filters (community, author, date range)

### 11.2 Explore
`ExplorePage` computes trending sections from relay data:
- hashtags from post `t` tags
- community cards from `kind:34550`

Note: explore community member counts are currently placeholders (randomized), not fully derived from Nostr membership state.

## 12. Saved posts
Saved posts are hybrid:
- localStorage for instant UX
- optional relay sync via `kind:30001`, `d=saved_posts`

Saved list payload is currently stored as JSON in event `content`.

## 13. Global blocking
Global mute list uses `kind:10000`:
- `p` tags represent blocked pubkeys
- feeds/details filter out content from blocked authors

## 14. Zaps (Lightning)
`useZaps` provides a basic zap flow:
- zap request `kind:9734`
- zap receipts `kind:9735`
- reads `lud16/lud06` from profile metadata

Current implementation is intentionally basic (LNURL/lightning URI open), not a complete payment orchestration stack.

## 15. Community Wiki
Community wiki uses `kind:30818`:
- `d=wiki:<communityId>`
- markdown content body
- editable by owner/moderator

## 16. UI/UX technical features
- Theme system: mode (`light/dark/system`), accent color, surface theme
- Theme persistence in localStorage + cross-tab synchronization
- Fullscreen markdown editors for posts/comments
- Toast system for user feedback
- Global error boundary

## 17. PWA support
`PwaBanner` handles:
- install prompt (`beforeinstallprompt`)
- iOS/Android fallback installation hints
- service worker registration in production
- update flow via waiting SW + `SKIP_WAITING`

## 18. Rate limiting
Client-side anti-spam guard (`useRateLimit`) for:
- posting
- commenting
- voting

Mechanics:
- sliding window attempt tracking
- cooldown after threshold
- user-facing toast errors

## 19. Key event kind mapping used in the app

| Feature | Kind | Notes |
|---|---:|---|
| Profile metadata | 0 | name, bio, avatar, nip05, lud16 |
| Post / comment | 1 | both are text notes, distinguished by tags |
| Contacts (follows) | 3 | followed users in `p` tags |
| Deletion | 5 | delete post/comment/reaction |
| Reactions (up/down) | 7 | `+` / `-` |
| Global mute list | 10000 | globally blocked users |
| Community membership list | 30001 | `d=communities`, `a` refs |
| Saved posts list | 30001 | `d=saved_posts`, JSON content |
| Community | 34550 | NIP-72 metadata |
| Community block | 34551 | block/unblock users in a community |
| Community moderation status | 4550 | approved/rejected/pending model |
| Wiki article | 30818 | community wiki |
| Zap request | 9734 | LN zap request |
| Zap receipt | 9735 | zap payment receipt |

## 20. Important limits in a decentralized model
- The client can enforce rules strongly inside this app.
- Absolute enforcement (for example “non-mod can never post in closed community”) requires relay-side policy.
- Other clients may ignore custom rules if relays do not reject conflicting events.
- For robust moderation you should combine:
  - portable metadata/tag standards
  - explicit moderation/approval events
  - relay policy for hard enforcement

## 21. Recommended code reading order
To understand the system quickly, start with:
- `src/providers/NostrProvider.tsx` (auth, session, connection)
- `src/hooks/useFeed.ts` (main feed orchestration)
- `src/pages/CommunityDetailPage.tsx` (community moderation logic)
- `src/components/CreatePost.tsx` (post publishing flow)
- `src/lib/community.ts` (community tag helpers)
- `src/hooks/useVoting.ts` (reaction/vote model)
- `src/pages/PostDetailPage.tsx` (threading and comment behavior)
