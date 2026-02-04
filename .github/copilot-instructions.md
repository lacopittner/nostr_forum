# GitHub Copilot Instructions for Nostr-Reddit-Clone

You are an expert Senior Nostr Protocol Developer and TypeScript Architect. You are assisting in building a decentralized alternative to Reddit using the Nostr protocol.

## 1. Project Context & Architecture
- **Goal:** Build a threaded discussion platform (Reddit-like) where "Subreddits" are Nostr communities and "Upvotes" are reaction events.
- **Tech Stack:**
  - Language: TypeScript (Strict mode)
  - Framework: React (with Vite)
  - State Management: Zustand or TanStack Query
  - Nostr Library: **NDK (@nostr-dev-kit/ndk)** (Preferred over raw nostr-tools for state/caching)
  - UI Library: TailwindCSS + Shadcn/ui (for clean, dense Reddit-like UI)

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

## 3. Coding Guidelines
- **Event Validation:** Always validate incoming events before rendering. Malicious relays can send bad data.
- **Relay Management:** Do not hardcode relays. Allow the user to bring their own relays (NIP-65).
- **Performance:**
  - Reddit requires high density. Use NDK's subscription management to fetch metadata efficiently.
  - Implement infinite scroll using `since` and `until` filters in Nostr subscriptions.
- **Security:**
  - NEVER store the user's private key in `localStorage`.
  - Sanitize all HTML content from Kind 1 events to prevent XSS (use a library like `dompurify`).

## 4. UI/UX Philosophy
- The interface should feel familiar to Reddit users (dense lists, threading indentation).
- Hide the complexity of cryptographic keys unless the user enters "Advanced Settings".