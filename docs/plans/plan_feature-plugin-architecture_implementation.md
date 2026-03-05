# WIP: Plugin Architecture Migration

**Branch:** `feature/plugin-architecture`
**Started:** 2026-03-05
**Status:** In Progress

## Plan

Full migration plan in [MIGRATION_PLAN.md](/MIGRATION_PLAN.md). Four plugin types: theme, provider, session, mfa.

### Tasks

- [ ] Step 1: Build plugin infrastructure (types.ts, interfaces, registry.ts)
- [ ] Step 2: Create plugins-available directory structure
- [ ] Step 3: Wrap existing themes as proper plugins
- [ ] Step 4: Extract Redis session plugin
- [ ] Step 5: Create LRU session plugin
- [ ] Step 6: Extract OTP MFA plugin
- [ ] Step 7: Create "none" MFA plugin
- [ ] Step 8: Extract Simple SQL provider plugin
- [ ] Step 9: Refactor interaction routes (delegate to provider + MFA plugins)
- [ ] Step 10: Refactor server.ts (new boot sequence via registry)
- [ ] Step 11: Refactor config.ts (plugin selectors, move plugin-specific env vars)
- [ ] Cleanup: Delete dead Discord plugin code (src/lib/plugin.ts)

## Progress Log

### 2026-03-05T00:00
- Branch created from `dev` at `6d78c7c`.

## Decisions & Notes

- Providers are headless by default (CSV, passwd, LDAP). Registration/profile/etc are provider-specific routes.
- MFA is independent of provider — its own plugin type (otp, none).
- Email transporter stays in core. sendLoginPinEmail moves to OTP MFA plugin. sendConfirmation/sendPasswordReset move to Simple SQL provider.
- SMTP config stays in core Zod schema.
- Themes have no useful plugin tech — architecture built from scratch.

## Blockers

None currently.

## Commits
6d78c7c - docs: add plugin architecture migration plan
