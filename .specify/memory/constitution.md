# Nostr Forum Constitution

## Core Principles

### I. Protocol Fidelity First
Every product behavior must map to explicit Nostr semantics.
- Use correct event kinds and tag formats (NIP-01, NIP-07, NIP-10, NIP-25, NIP-50, NIP-51, NIP-65, NIP-72, NIP-98).
- Do not ship behavior that violates canonical tag usage just to satisfy UI convenience.
- If a feature needs a custom kind, it must be documented in code and in project docs.

### II. Security and Key Safety
User key material is treated as high-risk data.
- Never store plaintext `nsec` in localStorage/sessionStorage.
- Prefer extension signer (NIP-07) and remote signer (NIP-46).
- Any local key persistence must be encrypted and PIN-protected.
- Relay content is untrusted and must be validated/sanitized before rendering.
- **NIP-98 HTTP Auth**: All file uploads must include signed authorization header. Never upload without proper NIP-98 signature.

### III. Relay Resilience by Default
The app must remain usable under relay instability.
- Do not assume single-relay availability.
- Publishing and subscriptions should tolerate reconnects/failures.
- Prefer retry/backoff/failover patterns for critical publish flows.

### IV. Type-Safe React Architecture
Maintain predictable, testable frontend architecture.
- TypeScript strict mode with explicit typing; avoid `any`.
- Keep Nostr subscription and event logic in hooks/lib utilities.
- Components should stay focused on UI/state composition.
- Reuse existing abstractions before introducing new frameworks or patterns.

### V. Consistent Moderation and Mute Enforcement
Policy-sensitive behavior must be enforced uniformly.
- Closed-community posting restrictions apply in all posting surfaces.
- Mute lists (users/tags/events) must filter content consistently across feed, search, profile, and detail views.
- UI state must reflect moderation/mute outcomes immediately after successful publish.

## Technical Constraints
- Runtime stack: React 19, Vite 7, TypeScript 5.x, NDK.
- Styling: Tailwind + existing design tokens and component patterns.
- Testing stack: Vitest + Testing Library; Playwright for e2e.
- Do not add server dependencies for core client behavior unless explicitly requested.

## Development Workflow
- Use Conventional Commits.
- Keep changes scoped by feature concern.
- For non-trivial changes, verify with:
  - `npm run build`
  - `npm test -- --run`
  - `npm run lint`
- If validation fails, fix before completion or clearly report remaining gaps.

## Governance
This constitution governs Spec Kit planning and implementation outputs in this repository.
- If a spec/plan/task conflicts with this constitution, update the artifact (not the principle) unless a deliberate constitution amendment is approved.
- Amendments must include: rationale, impact, and migration notes for current workflows.

**Version**: 1.0.0 | **Ratified**: 2026-03-06 | **Last Amended**: 2026-03-06
