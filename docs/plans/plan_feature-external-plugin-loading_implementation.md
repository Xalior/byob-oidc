# WIP: External Plugin Loading

**Branch:** `feature/external-plugin-loading`
**Started:** 2026-03-05
**Status:** Complete

## Plan

Enable users to create, build, and load their own plugins from an external `/data/plugins` directory, completely independent of the core source tree. Plugins are prebuilt ESM JavaScript bundles with their own package.json and build tooling.

### Tasks

- [x] Core: Add `PLUGIN_DIR` env var to config.ts
- [x] Core: Add `PluginServices` type to types.ts (getSession, transporter injection)
- [x] Core: Update registry.ts — `loadPlugin()` resolves external dir first (.js then .ts)
- [x] Core: Update registry.ts — `discoverAvailable()` scans both built-in and external dirs
- [x] Core: Wire services into PluginConfig in server.ts
- [x] Types package: Create `packages/plugin-types/` with all plugin interfaces
- [x] Example: `example-csv-provider` — CSV + bcrypt auth, full standalone build
- [x] Example: `example-captcha-mfa` — random question captcha, full standalone build
- [x] Docker: Update Dockerfile for `/data/plugins` directory structure
- [x] Docker: Update docker.md documentation
- [x] Docs: Update external plugin development guide
- [x] Test: Build example plugins and validate loading

## Progress Log

### 2026-03-05T00:00
- Started work. Branch created from `dev` at `950f084`.
- Stashed partial changes from earlier exploration.

### 2026-03-05T00:01
- Core changes committed: PLUGIN_DIR env var, PluginServices, registry external loading.

### 2026-03-05T00:02
- @byob-oidc/plugin-types package created and built.

### 2026-03-05T00:03
- Both example plugins created, built, and tested:
  - example-csv-provider: CSV + bcrypt, file watching, email/profile scopes
  - example-captcha-mfa: 15 built-in questions, custom JSON file support, session cache

### 2026-03-05T00:04
- Docker and docs updated. All plugin docs expanded for external workflow.
- Tests passing: all 3 test cases (URL import, CSV provider, captcha MFA).

## Decisions & Notes

- External plugins are prebuilt ESM (`.js`), not TypeScript source
- External dir scanned in addition to built-in `plugins-available/`; external takes precedence for same-name plugins
- Services (getSession, transporter) injected via `PluginConfig.services` rather than requiring imports from core paths
- Each example plugin is a fully independent project with own package.json, tsconfig, esbuild
- `PLUGIN_DIR` defaults to `/data/plugins` (Docker convention)
- Pre-existing TS errors in redis adapter and oidc-provider types — not introduced by this branch

## Blockers

None.

## Commits

4a48fd0 - wip: start feature/external-plugin-loading — init progress tracker
03a94b3 - feat: add external plugin loading support in registry
99814ee - feat: add @byob-oidc/plugin-types package for external plugin authors
66b05fd - feat: add example external plugins — CSV provider and captcha MFA
d683d6c - docs: update Dockerfile and docker.md for external plugin directory
5166f66 - docs: update plugin docs for external plugin loading
fca318e - test: add external plugin loading validation tests
