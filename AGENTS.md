# CLAUDE.md — BYOB-OIDC

## Project Overview

Self-hosted OIDC identity provider built on a plugin architecture. Users authenticate via configurable provider, session, MFA, and theme plugins.

**Stack:** Express 4 + TypeScript + oidc-provider + Drizzle ORM + Redis (ioredis) + Mustache + Bootstrap 5

**Runtime:** Node 22.14, pnpm 10, tsx (no build step for core — TypeScript executed directly)

## Key Commands

```bash
pnpm dev              # Start dev server (tsx watch)
pnpm start            # Start production server
pnpm lint             # TypeScript type check (tsc --noEmit)
pnpm test             # WebDriverIO e2e tests (requires running server + Safari)
pnpm build:assets     # Webpack: compile SCSS/Bootstrap assets
pnpm generate-jwks    # Generate JWKS key pair for OIDC signing
pnpm db:generate      # Drizzle-kit: generate migrations
pnpm db:push          # Drizzle-kit: push schema to database
pnpm db:run-migrations # Run custom migration scripts
```

## Architecture

### Plugin System

Five plugin types, loaded by the registry (`src/plugins/registry.ts`):

| Type | Cardinality | Env Var | Default | Interface |
|------|------------|---------|---------|-----------|
| **Provider** | Single active | `PROVIDER` | `simple-sql` | `src/plugins/provider/interface.ts` |
| **Session** | Single active | `SESSION` | `redis` | `src/plugins/session/interface.ts` |
| **MFA** | Multiple active | `MFA` | `otp` | `src/plugins/mfa/interface.ts` |
| **Theme** | All loaded, one default | `THEME` | `nbn24` | `src/plugins/theme/interface.ts` |
| **Extension** | Multiple active | `EXTENSIONS` | _(none)_ | `src/plugins/extension/interface.ts` |

**Loading order:** Session → Provider → MFA → Themes (all discovered) → Extensions

**Plugin sources:**
- Built-in: `src/plugins-available/{type}/{name}/index.ts` (TypeScript, loaded by tsx)
- External: `$PLUGIN_DIR/{type}/{name}/index.js` (prebuilt ESM, default `/data/plugins`)
- External takes precedence over built-in for same-name plugins

### Boot Sequence (`src/server.ts`)

1. Load plugins via registry
2. Wire client finder into session adapter
3. Build OIDC config from app config
4. Create Express app (session, CSRF, flash, cors, helmet, passport)
5. Mount theme assets at `/theme`
6. Set up Mustache template engine with theme layouts
7. Register routes (provider routes, passport SSO, controller routes)
8. Create oidc-provider instance with session adapter
9. Start HTTP server
10. Self-discovery loop (retries up to 30 times to discover own OIDC issuer)
11. Register Passport OIDC strategy

### Key Directories

```
src/
  server.ts                    # Entry point
  lib/config.ts                # Zod-validated env config (@t3-oss/env-core)
  lib/oidc-config.ts           # oidc-provider configuration builder
  lib/email.ts                 # Nodemailer transporter (core service)
  plugins/                     # Plugin interfaces + registry
    registry.ts                # Discovery, loading, validation, accessors
    types.ts                   # Base types: Plugin, PluginConfig, PluginServices
    {provider,session,mfa,theme,extension}/interface.ts
  plugins-available/           # Built-in plugin implementations
    providers/simple-sql/      # MySQL + bcrypt + user management routes
    sessions/redis/            # Redis JSON adapter + ioredis
    sessions/lru/              # In-memory LRU (dev/testing)
    mfa/otp/                   # Email PIN (6-digit, 15min TTL)
    mfa/none/                  # Pass-through (no challenge)
    themes/{nbn24,robotic,xalior}/
  provider/express.ts          # OIDC interaction routes (login, consent, MFA)
  controller/                  # User-facing routes (registration, profile, etc.)
  models/clients.ts            # OIDC client model (stays in core, not a plugin)
  db/schema.ts                 # Drizzle schema (users, confirmation_codes, clients)
packages/
  plugin-types/                # @byob-oidc/plugin-types — standalone type package
examples/
  plugins/                     # Example external plugins (own build tooling)
    example-csv-provider/      # CSV + bcrypt auth
    example-captcha-mfa/       # Random question captcha
```

## Testing

### E2E Tests (WebDriverIO)

Tests run against a live server using Safari. The test suite:
- Connects directly to the MySQL database to set up test data
- Connects directly to Redis to read MFA codes for automated login
- Uses page objects in `test/pageobjects/`
- Config: `wdio.conf.ts`, base URL: `https://dev.id.nextbestnetwork.com`

**To run:** Start the dev server first, then `pnpm test`

Test suites: `auth` (login, logout, failures, lost_password, lockout), `registration` (failures)

### Unit/Integration Tests

```bash
npx tsx tests/test-external-plugins.ts    # External plugin loading validation
```

Requires building example plugins first:
```bash
cd examples/plugins/example-csv-provider && npm install && npm run build
cd examples/plugins/example-captcha-mfa && npm install && npm run build
```

## Configuration

All config via environment variables, validated by Zod in `src/lib/config.ts`. See `_env_sample` for the full list.

**Required:** `HOSTNAME`, `SMTP_HOST`, `DATABASE_URL`, `CACHE_URL`, `CLIENT_FEATURES_REGISTRATION`

**Plugin-specific env vars** are read directly from `process.env` by plugins (not validated centrally). External plugins receive core services via `config.services` (getSession, transporter).

## Docker

- Dockerfile: Node 22 Alpine, pnpm, volume at `/data`
- Entrypoint (`docker-entrypoint.sh`): generates migrations → pushes schema → runs migrations → starts app
- External plugins go in `/data/plugins/{providers,sessions,themes,mfa,extensions}/`
- `PLUGIN_DIR` env var controls external plugin root (default: `/data/plugins`)

## Conventions

- ESM throughout (`"type": "module"` in package.json)
- TypeScript with `.ts` extensions in imports (tsx handles at runtime, `rewriteRelativeImportExtensions` for tsc)
- Plugin objects are plain objects with `meta` + methods (not classes)
- Plugins use `default export`
- Flash messages for user-facing errors (`req.flash('error', ...)`)
- Plugin-specific config via `process.env`, not centralized validation
- External plugins bundle with esbuild, output ESM `index.js`
