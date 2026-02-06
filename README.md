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

## 📝 TODO / Known Issues

### Image Upload & Hosting
**Status:** Partially implemented with workarounds

**Problem:**
- Direct file upload to image hosting services (nostr.build, imgur, etc.) fails due to CORS policy restrictions when running on localhost
- Imgur blocks hotlinking (returns 403 Forbidden) for many images
- Other hosting services have inconsistent CORS support

**Current Workaround:**
- Users must paste direct image URLs instead of uploading files
- The app validates URLs and attempts to convert gallery links (e.g., `imgur.com/xxx` → `i.imgur.com/xxx.jpg`)
- Fallback chain attempts `.jpg` → `.png` → no extension for Imgur links
- Even if preview fails, users can still add the image URL

**Future Solutions:**
- [ ] Implement NIP-96 compliant upload with signed requests
- [ ] Add base64 image embedding for small images (< 50KB)
- [ ] Integrate with Nostr-native image hosts that support CORS
- [ ] Add server-side proxy for image uploads (requires backend)

**Recommended Image Hosts:**
- `nostr.build` - Nostr-native (CORS issues on localhost, works in production)
- `i.imgur.com` - Direct links only (gallery links auto-converted)
- `catbox.moe` - Good CORS support
- `void.cat` - Simple, no account needed
- GitHub - Upload to repo, use raw links

---

## 📂 Project Structure

Maintain this structure to keep the codebase clean: