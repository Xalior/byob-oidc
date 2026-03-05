# WIP: External Plugin Loading

**Branch:** `feature/external-plugin-loading`
**Started:** 2026-03-05
**Status:** In Progress

## Plan

Enable users to create, build, and load their own plugins from an external `/data/plugins` directory, completely independent of the core source tree. Plugins are prebuilt ESM JavaScript bundles with their own package.json and build tooling.

### Tasks

- [ ] Core: Add `PLUGIN_DIR` env var to config.ts
- [ ] Core: Add `PluginServices` type to types.ts (getSession, transporter injection)
- [ ] Core: Update registry.ts — `loadPlugin()` resolves external dir first (.js then .ts)
- [ ] Core: Update registry.ts — `discoverAvailable()` scans both built-in and external dirs
- [ ] Core: Wire services into PluginConfig in server.ts
- [ ] Types package: Create `packages/plugin-types/` with all plugin interfaces
- [ ] Example: `example-csv-provider` — CSV + bcrypt auth, full standalone build
- [ ] Example: `example-captcha-mfa` — random question captcha, full standalone build
- [ ] Docker: Update Dockerfile for `/data/plugins` directory structure
- [ ] Docker: Update docker.md documentation
- [ ] Docs: Update external plugin development guide
- [ ] Test: Build example plugins and validate loading

## Progress Log

### 2026-03-05T00:00
- Started work. Branch created from `dev` at `950f084`.
- Stashed partial changes from earlier exploration.

## Decisions & Notes

- External plugins are prebuilt ESM (`.js`), not TypeScript source
- External dir scanned in addition to built-in `plugins-available/`; external takes precedence for same-name plugins
- Services (getSession, transporter) injected via `PluginConfig.services` rather than requiring imports from core paths
- Each example plugin is a fully independent project with own package.json, tsconfig, esbuild
- `PLUGIN_DIR` defaults to `/data/plugins` (Docker convention)

## Blockers

None currently.

## Commits

