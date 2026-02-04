# NostrReddit (Working Title)

A decentralized, censorship-resistant Reddit alternative built on the **Nostr** protocol.
This project aims to replicate the UX of Reddit (communities, threaded conversations, voting) using Nostr's event-based architecture without a central backend.

---

## 🛠 Tech Stack

The project is built with a modern React ecosystem. **Copilot, please strictly adhere to these libraries:**

- **Core:** [React](https://react.dev/) + [Vite](https://vitejs.dev/) + [TypeScript](https://www.typescriptlang.org/)
- **Nostr Logic:** [`@nostr-dev-kit/ndk`](https://github.com/nostr-dev-kit/ndk) (Nostr Dev Kit for caching and subscription management)
- **State Management:** [Zustand](https://github.com/pmndrs/zustand) (Global state) + [TanStack Query](https://tanstack.com/query/latest) (Async state)
- **Styling:** [Tailwind CSS](https://tailwindcss.com/)
- **UI Components:** [shadcn/ui](https://ui.shadcn.com/) (Radix UI based)
- **Icons:** [Lucide React](https://lucide.dev/)

---

## 📡 Protocol Specifications (NIPs)

We map Reddit features to specific Nostr Implementation Possibilities (NIPs).
**This mapping is the source of truth for the application logic.**

| Feature | Reddit Term | Nostr Implementation | Notes |
| :--- | :--- | :--- | :--- |
| **Identity** | User / Account | **NIP-01** (Pubkey) | Display as `npub` (NIP-19). |
| **Auth** | Login | **NIP-07** | Browser extension login (e.g., Alby). **No private keys stored in-app.** |
| **Communities** | Subreddit | **NIP-72** | `kind: 34550` (Moderated Communities). |
| **Topics** | Flair / Tags | **NIP-12** | `#t` tags within the event. |
| **Content** | Post | **Kind 1** | Must include `a` tag pointing to the NIP-72 community. |
| **Discussion** | Comment Thread | **NIP-10** | `kind: 1` with strictly formatted `e` (root/reply) tags. |
| **Voting** | Upvote/Downvote | **NIP-25** | `kind: 7`. Content `+` (up) or `-` (down). |
| **Media** | Images/Video | **NIP-94** | File header metadata (optional) or simple URL embedding. |

---

## 📂 Project Structure

Maintain this structure to keep the codebase clean: