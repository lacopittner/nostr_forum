# Contributing to NostrReddit

Thank you for your interest in contributing! This document provides guidelines to ensure code quality, consistency, and optimal integration with the Nostr protocol.

**Note for AI Assistants (Copilot):** Please prioritize the coding standards defined in the "Code Style & Standards" section below.

---

## 🛠 Code Style & Standards

We enforce strict TypeScript and React best practices.

### 1. TypeScript Rules
- **Strict Typing:** NEVER use `any`. Always define interfaces or types in `src/types/`.
- **Nostr Types:** Use types from `@nostr-dev-kit/ndk` where possible (e.g., `NDKEvent`, `NDKUser`) instead of generic objects.
- **Interfaces over Types:** Use `interface` for object definitions and `type` for unions/intersections.

### 2. React & Component Architecture
- **Functional Components:** Use standard function declarations: `export function MyComponent() {}` (avoid arrow functions for top-level components).
- **Hooks Pattern:**
  - Logic involving NDK/Nostr subscriptions should be extracted into custom hooks (e.g., `useSubredditEvents`).
  - Components should remain presentational (UI) as much as possible.
- **Imports:** Group imports:
  1. React / External Libraries
  2. NDK / Nostr Tools
  3. Internal Components & Utilities
  4. Types / Assets

### 3. Asynchronous Code
- **Async/Await:** Prefer `async/await` syntax over `.then()` chains.
- **Error Handling:** All Nostr network calls (publishing, fetching) must be wrapped in `try/catch` blocks.
- **Loading States:** Always handle loading (`isLoading`) and error (`isError`) states in UI components.

---

## ⚡ Nostr Specific Guidelines

### Event Handling
- **Immutability:** Treat Nostr events as immutable facts. Do not modify an event object once fetched.
- **Validation:** When creating a new event (e.g., a post or comment), strictly validate tags according to the NIPs defined in `README.md` before signing.
- **Relay Efficiency:**
  - Avoid `EOSE` waiting if not strictly necessary for UI blocking.
  - Use `closeOnEose: false` for live feeds.

### Security
- **Private Keys:** NEVER handle `nsec` strings in the application state. Always offload signing to the NIP-07 extension (window.nostr).
- **Content Sanitization:** All user-generated content (Kind 1) must be sanitized before rendering to prevent XSS.

---

## 🧪 Testing

- **Unit Tests:** Write tests for all utility functions in `src/lib/`.
- **Mocking:** Do not hit real relays in tests. Mock `NDK` methods to return dummy events.

---

## 📝 Commit Convention

We follow the **Conventional Commits** specification. Copilot, please generate commit messages in this format:

- `feat: add upvote functionality using NIP-25`
- `fix: resolve threading issue in comment parsing`
- `chore: update ndk dependency`
- `refactor: move hook to separate file`
- `docs: update NIP mapping table`

---

## 🔄 Pull Request Process

1.  Ensure all types pass (`tsc --noEmit`).
2.  Ensure the code follows the formatting rules (Prettier).
3.  Describe the changes and link the NIPs implemented in the PR description.