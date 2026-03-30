# WIP: FlashBack Retro-Auth Extension Plugin

**Branch:** `feat/retroweb-plugin`
**Started:** 2026-03-30
**Status:** In Progress

## Plan

Implement the FlashBack extension plugin as described in [flashback-extension.md](./flashback-extension.md).

FlashBack is an ExtensionPlugin that adds passwordless login routes under `/flashback/*` for HTTP-only clients that cannot do HTTPS. An HTTP client triggers a login challenge, which gets approved by the user on a desktop browser over HTTPS.

### Tasks

- [ ] Commit plan file (flashback-extension.md) and WIP tracker
- [ ] Add `findByEmail` and `createAccount` optional methods to ProviderPlugin interface
- [ ] Implement `findByEmail` and `createAccount` in simple-sql provider
- [ ] Add body parsing and CSRF exemption for FlashBack routes in server.ts
- [ ] Create FlashBack extension plugin (`src/plugins-available/extensions/flashback/index.ts`)
- [ ] Create FlashBack README.md
- [ ] Verify TypeScript compiles (`pnpm lint`)
- [ ] Final review and cleanup

## Progress Log

### 2026-03-30T00:00 — Setup
- Branch `feat/retroweb-plugin` already exists. Working from here.
- Explored codebase: extension plugin interface, registry, provider, session, server.ts.
- Identified necessary minimal core changes: ProviderPlugin interface (add optional findByEmail/createAccount), server.ts (body parsing + CSRF exemption for /flashback routes).

## Decisions & Notes

- **Provider interface extension:** Plan says "no core modifications" but ProviderPlugin interface needs optional `findByEmail(email)` and `createAccount(data)` methods for the extension to look up and create users through the plugin abstraction. This is non-breaking (optional methods). Alternative was importing simple-sql internals directly, but that breaks the plugin model.
- **CSRF exemption:** `/flashback/init` is a server-to-server API call authenticated via client credentials. It must be exempt from CSRF. This requires a minimal change to server.ts.
- **Body parsing:** Extension routes need body parsing registered before CSRF middleware. Added `/flashback` to server.ts body parsing paths.
- **Templates:** Extension renders HTML via `res.send()` with inline templates to stay self-contained, no dependency on Mustache template engine.
- **Import pattern:** Import `getProvider` and `getSession` directly from `src/plugins/registry.ts` (same pattern as OTP MFA plugin).

## Blockers

None currently.

## Commits

(will be filled as commits are made)
