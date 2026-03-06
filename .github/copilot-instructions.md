# GitHub Copilot Instructions for Nostr Forum

You are assisting on a decentralized Reddit-like client built on Nostr.
Prioritize protocol correctness, safety, and production-grade TypeScript.

## 1. Current Stack (Source of Truth)
- Language: TypeScript (strict)
- Frontend: React 19 + React DOM 19
- Build: Vite 7
- Routing: react-router-dom 7
- Forms: react-hook-form + zod
- Nostr SDK: `@nostr-dev-kit/ndk`
- UI: Tailwind CSS + custom components + Lucide icons
- Testing: Vitest + Testing Library + Playwright

Do not introduce alternate frameworks/state stacks unless explicitly requested.

## 2. Nostr Protocol Mapping (Must Follow)
Map features to these NIPs/kinds:

| Product Capability | NIP / Kind | Required Behavior |
| --- | --- | --- |
| Login (extension) | NIP-07 | Use extension signer when available |
| Login (remote signer) | NIP-46 | Support bunker/connect signer sessions |
| Local key login | nsec + encrypted storage | Never store plaintext nsec; only encrypted with PIN |
| Relay metadata | NIP-65 / kind `10002` | Track read/write relay preferences |
| Community | NIP-72 / kind `34550` | Use `d` tag + community metadata tags |
| Post | kind `1` | Include `a` tag to community when posting in community |
| Comment threading | NIP-10 / kind `1` | Use `e` tags with `root` and `reply` markers correctly |
| Reactions (vote) | NIP-25 / kind `7` | `+` for upvote, `-` for downvote |
| Global mute list | NIP-51 / kind `10000` | Use tags `p`, `t`, `e` for user/tag/event mute |
| Interest lists | NIP-51 / kind `30001` | Keep list semantics and `d` tags stable |
| Search | NIP-50 | Use relay-side `search` when available, fallback locally |
| HTTP auth upload | NIP-98 / kind `27235` | Sign HTTP upload auth event and send `Authorization: Nostr ...` |
| File metadata | NIP-94 / kind `1063` | Include file info tags for media uploads |
| Delete | kind `5` | Use proper `e` references to deleted event |

Project-specific kinds in use:
- `4550`: community approval/moderation state
- `34551`: community-level block event

## 3. Security Rules (Non-Negotiable)
- Never expose or persist plaintext private keys.
- Never ask user to paste plaintext keys unless explicitly in secure key-login flow.
- Sanitize user-generated markdown/HTML rendering.
- Treat relay data as untrusted: validate tags and guard parsing.
- Prefer signing via active NDK signer; do not implement custom cryptography when NDK already handles it.

## 4. Relay and Publish Behavior
- Assume relays can fail or flap.
- Prefer resilient publish flows (`publishWithRelayFailover`) where available.
- Avoid code that assumes exactly one relay is always online.
- Keep reconnect behavior backoff-based and non-blocking for UI.

## 5. UI/Domain Rules
- Closed communities: only moderators can publish posts.
- Mute state must be enforced consistently in feed, search, post detail, explore, and profile views.
- Keep Reddit-like dense feed UX; avoid redesign unless requested.
- Support light/dark theming already present in app.

## 6. Code Style Expectations
- Avoid `any`; define explicit types/interfaces.
- Prefer function components (`export function X() {}`) and hooks for side-effect/subscription logic.
- Keep Nostr event/tag logic in hooks/libs when possible, not duplicated across pages.
- Use existing helpers before adding new abstractions.
- Keep changes small and cohesive; avoid broad unrelated refactors.

## 7. Validation Before Completion
For non-trivial changes, run:
1. `npm run build`
2. `npm test -- --run`
3. `npm run lint`

If any step fails, fix or clearly report what remains.

**For NIP-related features**: Use `.specify/templates/nip-compliance-checklist.md` to validate protocol correctness before implementation.

## 8. Repository Notes
- Main app code lives in `src/`
- Nostr provider/session logic: `src/providers/NostrProvider.tsx`
- Relay config/utilities: `src/lib/ndk.ts`
- Resilient publishing helper: `src/lib/publish.ts`
- Feed/state hooks: `src/hooks/`
- Copilot prompt/agent files for Spec Kit: `.github/prompts/` and `.github/agents/`
