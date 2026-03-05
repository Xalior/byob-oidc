# WIP: Plugin Architecture Migration

**Branch:** `feature/plugin-architecture`
**Started:** 2026-03-05
**Status:** In Progress

## Plan

Full migration plan in [MIGRATION_PLAN.md](/MIGRATION_PLAN.md). Five plugin types: theme, provider, session, mfa, extension.

### Tasks

- [x] Step 1: Build plugin infrastructure (types.ts, interfaces, registry.ts)
- [x] Step 2: Create plugins-available directory structure
- [x] Step 3: Wrap existing themes as proper plugins
- [x] Step 4: Extract Redis session plugin
- [x] Step 5: Create LRU session plugin
- [x] Step 6: Extract OTP MFA plugin
- [x] Step 7: Create "none" MFA plugin
- [x] Step 8: Extract Simple SQL provider plugin
- [x] Step 9: Refactor interaction routes (delegate to provider + MFA plugins)
- [x] Step 10: Split config.ts into app config + oidc-config.ts
- [x] Step 11: Refactor server.ts (new boot sequence via registry)
- [x] Step 12: Add extension plugin type + multi-active registry
- [x] Cleanup: Delete dead Discord plugin code (src/lib/plugin.ts)
- [x] Cleanup: Delete old database_adapter.ts
- [x] Cleanup: Strip email.ts to transporter-only
- [x] Cleanup: Remove users/confirmation_codes from core schema
- [x] Cleanup: Remove dead imports from docs.ts
- [ ] Update tests for new plugin structure
- [ ] Update webpack config for new theme paths
- [ ] Update Docker/deployment for new env vars

## Progress Log

### 2026-03-05T00:00
- Branch created from `dev` at `6d78c7c`.

### 2026-03-05 (session 1)
- Steps 1-8 completed: plugin infrastructure, all plugins extracted and wrapped.

### 2026-03-05 (session 2 — post context compression)
- Plan updated: added extension plugin type, multi-active registry, config split.
- Steps 9-12 completed: interaction routes refactored, config split, server.ts rewritten, extensions added.
- Major cleanup: dead files deleted, email stripped, core schema trimmed.

## Decisions & Notes

- Providers are headless by default (CSV, passwd, LDAP). Registration/profile/etc are provider-specific routes.
- MFA is independent of provider — its own plugin type (otp, none). Multiple MFA plugins can be active simultaneously.
- Email transporter stays in core. sendLoginPinEmail moved to OTP MFA plugin. sendConfirmation/sendPasswordReset moved to Simple SQL provider.
- SMTP config stays in core Zod schema.
- Themes have no useful plugin tech — architecture built from scratch. All available themes loaded at boot, config sets default.
- Plugin loading model: single-active (provider, session) vs multi-active (theme, mfa, extension).
- Config split: config.ts (app config, no oidc-provider types) + oidc-config.ts (buildOIDCConfig function).
- Extension plugins: multiple active simultaneously, add routes/middleware/claims/scopes.
- accountId passed through express session during MFA handoff (stored in __mfa_accountId).
- setClientFinder() injection pattern for session adapters to look up OIDC clients.
- User-contributed plugins (any type) are a future goal — architecture should not prevent this.

## Blockers

None currently.

## Commits
6d78c7c - docs: add plugin architecture migration plan
ec15631 - wip: start feature/plugin-architecture — init progress tracker
514ed16 - feat: add plugin infrastructure — types, interfaces, and registry
4054708 - feat: move themes to plugins-available with plugin wrappers
00bf9ec - feat: extract Redis session plugin from database_adapter.ts
0873e3b - feat: add LRU in-memory session plugin for dev/test
82ee8fd - feat: add OTP and none MFA plugins
8c63a36 - feat: extract Simple SQL provider plugin
81aa64d - docs: update migration plan — extension type, config split, multi-active
39df640 - feat: add extension plugin type, update registry for multi-active plugins
ffd70a5 - refactor: split config.ts into app config + oidc-config.ts
2693946 - refactor: interaction routes delegate to provider + MFA plugins
a5eeae1 - refactor: complete server.ts boot sequence with plugin registry
