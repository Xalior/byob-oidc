# WIP: FlashBack Retro-Auth Extension Plugin

**Branch:** `feat/retroweb-plugin`
**Started:** 2026-03-30
**Status:** Complete

## Plan

Implement the FlashBack extension plugin as described in [flashback-extension.md](./flashback-extension.md).

FlashBack is an ExtensionPlugin that adds passwordless login routes under `/flashback/*` for HTTP-only clients that cannot do HTTPS. An HTTP client triggers a login challenge, which gets approved by the user on a desktop browser over HTTPS.

### Tasks

- [x] Commit plan file (flashback-extension.md) and WIP tracker
- [x] Add `findByEmail` and `createAccount` optional methods to ProviderPlugin interface
- [x] Implement `findByEmail` and `createAccount` in simple-sql provider
- [x] Add body parsing and CSRF exemption for FlashBack routes in server.ts
- [x] Create FlashBack extension plugin (`src/plugins-available/extensions/flashback/index.ts`)
- [x] Create FlashBack README.md
- [x] Verify TypeScript compiles (`pnpm lint`)
- [x] Final review and cleanup

## Progress Log

### 2026-03-30T00:00 — Setup
- Branch `feat/retroweb-plugin` already exists. Working from here.
- Explored codebase: extension plugin interface, registry, provider, session, server.ts.
- Identified necessary minimal core changes: ProviderPlugin interface (add optional findByEmail/createAccount), server.ts (body parsing + CSRF exemption for /flashback routes).

### 2026-03-30T00:01 — Implementation
- Added `findByEmail` and `createAccount` as optional methods to ProviderPlugin interface
- Implemented both methods in simple-sql provider (findByEmail queries verified+unsuspended users, createAccount creates auto-verified user)
- Added body parsing for `/flashback/approve`, `/flashback/register` (urlencoded) and `/flashback/init` (JSON) in server.ts
- Added CSRF exemption for `/flashback/init` (server-to-server API call)
- Created FlashBack extension plugin with all 5 routes:
  - POST /flashback/init (challenge creation, client credentials auth, rate limiting)
  - GET/POST /flashback/approve/:challengeId (existing user approval/denial)
  - GET/POST /flashback/register/:challengeId (new user registration + auto-approve)
- HMAC-SHA256 signed callbacks to FlashBack server on approval/denial
- Created comprehensive README.md with flow diagrams, API docs, callback format, HMAC verification example

### 2026-03-30T00:02 — Verification
- `pnpm lint` (tsc --noEmit) passes clean — no TypeScript errors

## Decisions & Notes

- **Provider interface extension:** Plan says "no core modifications" but ProviderPlugin interface needs optional `findByEmail(email)` and `createAccount(data)` methods for the extension to look up and create users through the plugin abstraction. This is non-breaking (optional methods). Alternative was importing simple-sql internals directly, but that breaks the plugin model.
- **CSRF exemption:** `/flashback/init` is a server-to-server API call authenticated via client credentials. It must be exempt from CSRF. This requires a minimal change to server.ts.
- **Body parsing:** Extension routes need body parsing registered before CSRF middleware. Added `/flashback` to server.ts body parsing paths.
- **Templates:** Extension renders HTML via `res.send()` with inline templates to stay self-contained, no dependency on Mustache template engine.
- **Import pattern:** Import `getProvider` and `getSession` directly from `src/plugins/registry.ts` (same pattern as OTP MFA plugin).
- **Auto-verification:** Accounts created via FlashBack registration are auto-verified (verified=1) because the user already proved email ownership by clicking the challenge link.
- **Rate limiting:** In-memory via session cache, sliding window of 5 requests per 60 seconds per email. Survives server restarts via Redis.
- **Client credentials:** HTTP Basic Auth verified against OIDC clients table via `Client.findByClientId()`.

## Blockers

None.

## Commits

- `fe8878f` - wip: start flashback extension — init progress tracker and plan
- `75cc46b` - feat: add findByEmail and createAccount to ProviderPlugin interface
- `adfe9e4` - feat: add body parsing and CSRF exemption for FlashBack routes
- `0e7975c` - feat: implement FlashBack retro-auth extension plugin
- `4d624fd` - docs: add FlashBack extension README with full API documentation
