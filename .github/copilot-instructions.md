# GitHub Copilot Instructions for Nostr-Reddit-Clone

You are an expert Senior Nostr Protocol Developer and TypeScript Architect. You are assisting in building a decentralized alternative to Reddit using the Nostr protocol.

## 1. Project Context & Architecture
- **Goal:** Build a threaded discussion platform (Reddit-like) where "Subreddits" are Nostr communities and "Upvotes" are reaction events.
- **Tech Stack:**
  - Language: TypeScript (Strict mode)
  - Framework: React (with Vite)
  - State Management: Zustand (global) + TanStack Query (async)
  - Nostr Library: **NDK (@nostr-dev-kit/ndk)** (Preferred over raw nostr-tools for state/caching)
  - UI Library: TailwindCSS + custom components (Reddit-like dense UI)
  - Icons: Lucide React

## 2. Nostr Implementation Standards (NIPs)
You must strictly map Reddit features to these specific Nostr Implementation Possibilities (NIPs):

| Reddit Feature | Nostr Spec | Implementation Detail |
| :--- | :--- | :--- |
| **Login** | **NIP-07** | Use `window.nostr` extension (Alby/nos2x). NEVER ask for private keys (nsec) directly in the UI. |
| **Subreddit** | **NIP-72** | "Moderated Communities" (Event Kind `34550`). Use `d` tag for community identifier. |
| **Post** | **Kind 1** | Standard Text Note. Must be tagged with `a` tag pointing to the NIP-72 Community event. |
| **Comment** | **Kind 1** | Reply to a post. STRICTLY follow **NIP-10** for threading (use `root` and `reply` markers in `e` tags). |
| **Upvote** | **NIP-25** | Reaction Event (Kind `7`). Content must be `+`. |
| **Downvote** | **NIP-25** | Reaction Event (Kind `7`). Content must be `-`. |
| **Flair/Tags** | **NIP-12** | Use `t` tags (hashtags) for topic categorization within the community. |
| **User ID** | **NIP-19** | Always display users as `npub...` in UI, but use Hex internally. |
| **Moderators** | **NIP-72** | Stored as `p` tags with role `"moderator"`: `["p", "<pubkey>", "", "moderator"]` |
| **User Blocks** | **Custom** | Kind `34551` events with `a` tag referencing community. Prevents posting in community. |

## 3. Implemented Features

### Core Features ✅
- [x] User authentication via NIP-07 extension
- [x] Global feed with posts (Kind 1)
- [x] Upvote/downvote system (NIP-25)
- [x] Basic comment replies (NIP-10)
- [x] Community listing page
- [x] Community detail page with posts

### Moderation Features ✅
- [x] Community creation with moderators (NIP-72)
- [x] Edit community (owner only)
- [x] Manage moderators (add/remove) - owner only
- [x] Block users from community - moderators
- [x] Block check before posting
- [x] Voting on community posts

### Pending Features 📝
- [ ] Threaded comment display (hierarchical)
- [ ] User profiles with post history
- [ ] Advanced search
- [ ] Relay management UI
- [ ] Image/media uploads (NIP-94)
- [ ] Cross-posting between communities
- [ ] Community discovery/directory

## 4. Project Structure

```
src/
├── components/
│   ├── CreateCommunityModal.tsx    # Create new community
│   ├── EditCommunityModal.tsx      # Edit community (owner)
│   ├── ManageModeratorsModal.tsx   # Add/remove moderators
│   ├── ManageBlockedUsersModal.tsx # Block/unblock users
│   └── layout/
│       └── AppShell.tsx            # Main layout with nav
├── hooks/
│   └── useCommunityBlocks.ts       # Track blocked users per community
├── lib/
│   └── ndk.ts                      # NDK singleton instance
├── pages/
│   ├── CommunitiesPage.tsx         # List all communities
│   ├── CommunityDetailPage.tsx     # View community + posts + voting
│   ├── ProfilePage.tsx             # User profile
│   ├── RelayManagementPage.tsx     # Relay settings
│   └── SearchPage.tsx              # Search functionality
├── providers/
│   └── NostrProvider.tsx           # NDK context + auth
```

## 5. Coding Guidelines

### TypeScript Rules
- **Strict Typing:** NEVER use `any`. Always define interfaces or types.
- **Nostr Types:** Use types from `@nostr-dev-kit/ndk` where possible (e.g., `NDKEvent`, `NDKUser`).
- **Event Kind Constants:** Use `as any` for custom event kinds not in NDK enum.

### React & Component Architecture
- **Functional Components:** Use standard function declarations: `export function MyComponent() {}`
- **Hooks Pattern:**
  - Logic involving NDK/Nostr subscriptions should be extracted into custom hooks
  - Components should remain presentational (UI) as much as possible

### Nostr Event Patterns

**Creating a Community (Kind 34550):**
```typescript
const event = new NDKEvent(ndk);
event.kind = 34550;
event.tags = [
  ["d", communityId],           // Unique identifier
  ["name", name],               // Display name
  ["description", description], // Description
  ["image", imageUrl],          // Cover image
  ["rules", rules],             // Community rules
  ["p", ownerPubkey, "", "moderator"], // Owner as moderator
  ["p", modPubkey, "", "moderator"]    // Additional moderator
];
await event.publish();
```

**Posting to Community (Kind 1):**
```typescript
const event = new NDKEvent(ndk);
event.kind = 1;
event.content = "Post content";
event.tags = [
  ["a", `34550:${communityPubkey}:${communityId}`, communityPubkey, "root"],
  ["t", "community"]
];
await event.publish();
```

**Voting (Kind 7 - NIP-25):**
```typescript
const reaction = new NDKEvent(ndk);
reaction.kind = 7;
reaction.content = "+"; // or "-" for downvote
reaction.tags = [
  ["e", postId],
  ["p", postAuthorPubkey]
];
await reaction.publish();
```

**User Block (Kind 34551):**
```typescript
const blockEvent = new NDKEvent(ndk);
blockEvent.kind = 34551 as any; // Custom kind
blockEvent.content = reason || "Blocked by moderator";
blockEvent.tags = [
  ["a", communityId],      // Reference to community
  ["p", blockedUserPubkey],
  ["e", "block"]           // or "unblock"
];
await blockEvent.publish();
```

## 6. Security
- **NEVER** store the user's private key in `localStorage` or state.
- Always offload signing to the NIP-07 extension (`window.nostr`).
- Validate events before rendering (malicious relays can send bad data).
- Sanitize all HTML content from Kind 1 events to prevent XSS.

## 7. UI/UX Philosophy
- Interface should feel familiar to Reddit users (dense lists, voting arrows).
- Hide cryptographic complexity unless user enters "Advanced Settings".
- Orange (`orange-600`) is the primary brand color.
- Dark/light mode support via Tailwind `dark:` classes.

## 8. Common Patterns

### Check if User is Moderator
```typescript
const isModerator = user && (
  community.pubkey === user.pubkey ||
  community.tags.some(t => t[0] === "p" && t[1] === user.pubkey && t[3] === "moderator")
);
```

### Check if User is Blocked
```typescript
const { isCurrentUserBlocked } = useCommunityBlocks(community);
if (isCurrentUserBlocked()) {
  // Prevent posting
}
```

### Fetch Community Posts
```typescript
const communityATag = `34550:${pubkey}:${communityId}`;
const sub = ndk.subscribe({
  kinds: [1],
  "#a": [communityATag]
}, { closeOnEose: false });
```
