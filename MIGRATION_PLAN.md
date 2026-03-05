# BYOB-OIDC Plugin Architecture Migration Plan

## Overview

Transform the current fixed-shape OIDC server into a generic, plugin-based system with five plugin types: **Theme**, **Provider**, **Session**, **MFA**, and **Extension**.

**Plugin loading model:**

- **Provider** — single active. Selects where users come from. `PROVIDER=simple-sql`
- **Session** — single active. Selects how runtime persistence works. `SESSION=redis`
- **Theme** — multiple loaded. Config sets default (`THEME=nbn24`). We ship several; user-contributed themes can be loaded too (must comply with spec, not our problem to test). A future extension could let logged-in users override the default with their own preference.
- **MFA** — multiple enabled simultaneously (`MFA=otp,none`). Users choose which one to use.
- **Extension** — multiple active simultaneously (`EXTENSIONS=discord,patreon`). Add optional features: account linking, custom routes/UI, gamification, etc.

User-contributed plugins (any type) are a future goal — the architecture should not prevent this.

The plugin architecture is built from scratch -- the current themes are just loose files with no contracts, lifecycle, or registration; they are not a plugin system.

---

## Current Architecture (What We Have)

```
server.ts (monolith)
  |-- config.ts (env-driven, loads theme via bare dynamic import)
  |-- database_adapter.ts (Redis-only, hardcoded ioredis)
  |-- models/account.ts (SQL via Drizzle+MySQL, hardcoded bcrypt auth)
  |-- models/clients.ts (SQL via Drizzle+MySQL)
  |-- provider/express.ts (OIDC interaction routes, hardcoded MFA flow)
  |-- controller/*.ts (user-facing routes: register, confirm, profile, etc.)
  |-- themes/{name}/theme.ts (bare dynamic import, no interface, no lifecycle)
  |-- db/schema.ts (Drizzle MySQL schema: users, confirmation_codes, clients)
```

**No existing plugin system.** The themes are plain objects loaded via dynamic import with no interface contracts, no validation, no lifecycle hooks, and no registration. The plugin architecture must be built from the ground up.

**Key coupling points:**
- `Account.findByLogin()` directly queries MySQL `users` table with bcrypt
- `Account.findAccount()` directly queries MySQL `users` table
- `Account.claims()` directly queries MySQL `users` table
- `database_adapter.ts` creates Redis connection at module level, all OIDC models stored in Redis
- `provider/express.ts` uses `DatabaseAdapter("MFACode")` directly for MFA cache
- `controller/*.ts` routes directly import `db` and `users` schema for registration, confirmation, password reset
- `config.ts` loads theme via bare `import()`, provider/session are hardcoded throughout
- `server.ts` uses `express-session` with no configurable store (defaults to MemoryStore)

**Files not shown above but present:**
- `src/lib/log.ts` -- rotating file stream for Morgan (uses `rotating-file-stream`, writes to `log/`)
- `src/lib/plugin.ts` -- dead code from a Discord bot, references Discord client/messages/users. Not used by OIDC server. Should be deleted.
- `src/db/migrate.ts` -- standalone migration runner (`drizzle-orm/mysql2/migrator`), reads from `./drizzle` folder
- `src/types/dr.pogodin__csurf.d.ts` -- type shim for CSRF library
- `src/views/` -- 14 default Mustache templates (fallback when theme has no `layouts/` dir): `_layout`, `confirm`, `docs/about`, `error`, `home`, `interaction`, `login`, `lost_password`, `mfa`, `profile`, `reconfirm`, `register`, `repost`, `reset_password`

**Env vars NOT in Zod config (read directly from `process.env` in `server.ts`):**
- `SESSION_SECRET` (line 68, default: `'session-secret'`)
- `CLIENT_ID` (line 185, default: `"SELF"`)
- `CLIENT_SECRET` (line 186, default: `"SELF_SECRET"`)
- `PORT` (line 283, default: `5000`)

These should be moved into the Zod config as part of this migration.

---

## Target Architecture

```
src/
  plugins/
    registry.ts          # Plugin loader, validator, and registry
    types.ts             # Shared plugin interfaces
    theme/
      interface.ts       # ThemePlugin interface
    provider/
      interface.ts       # ProviderPlugin interface
    session/
      interface.ts       # SessionPlugin interface
    mfa/
      interface.ts       # MFAPlugin interface
    extension/
      interface.ts       # ExtensionPlugin interface
  plugins-available/
    themes/
      nbn24/             # (move from src/themes/nbn24)
      robotic/           # (move from src/themes/robotic)
      xalior/            # (move from src/themes/xalior)
    providers/
      simple-sql/        # (extract from current models/account + db + controllers)
    sessions/
      redis/             # (extract from current database_adapter.ts)
      lru/               # (new, in-memory adapter for dev/test)
    mfa/
      otp/               # (extract from current MFA flow: email one-time password)
      none/              # (pass-through, always succeeds)
    extensions/
      # (future: discord/, patreon/, etc.)
```

---

## Phase 1: Build Plugin Infrastructure From Scratch

### 1.1 Base Plugin Interface

Every plugin type shares a common base: identity, lifecycle, and config access.

```typescript
// src/plugins/types.ts
export type PluginType = 'theme' | 'provider' | 'session' | 'mfa' | 'extension';

export interface PluginMeta {
  name: string;
  version: string;
  type: PluginType;
  description?: string;
}

export interface Plugin {
  meta: PluginMeta;

  // Called once at boot with the core app config + plugin-specific env vars
  initialize(config: AppConfig): Promise<void>;

  // Called on graceful shutdown (close DB connections, flush caches, etc.)
  shutdown?(): Promise<void>;
}
```

### 1.2 Plugin Registry

The registry is the core of the system. It does not exist today and must be built.

```typescript
// src/plugins/registry.ts
```

Responsibilities:
- **Discovery**: scan `src/plugins-available/{type}s/{name}/` for plugin directories
- **Loading**: dynamic `import()` of each plugin's `index.ts` default export
- **Validation**: assert the loaded module satisfies the required interface for its type (check required methods/properties exist, throw clear errors on mismatch)
- **Storage**: single active for provider/session; array of loaded instances for theme/mfa/extension
- **Accessors**: `getTheme(name?): ThemePlugin` (default or by name), `getProvider(): ProviderPlugin`, `getSession(): SessionPlugin`, `getMFA(name?): MFAPlugin` (specific or list), `getMFAs(): MFAPlugin[]`, `getThemes(): ThemePlugin[]`, `getExtensions(): ExtensionPlugin[]`
- **Lifecycle**: call `initialize()` on load, `shutdown()` on process exit
- **Error reporting**: clear messages when a plugin is missing, fails validation, or throws during init

Selection via env vars:
- `PROVIDER=simple-sql` (single)
- `SESSION=redis` (single)
- `THEME=nbn24` (default theme; all available themes are loaded)
- `MFA=otp,none` (comma-separated list of enabled MFA plugins)
- `EXTENSIONS=` (comma-separated list of enabled extensions, empty by default)

### 1.3 Theme Plugin Interface

Current themes are plain objects `{ name, page, logout, loggedout, error }` with a `site_name` getter/setter. They have no lifecycle, no validation, no asset path contract. The new interface adds all of that.

```typescript
// src/plugins/theme/interface.ts
export interface ThemePlugin extends Plugin {
  meta: PluginMeta & { type: 'theme' };
  site_name: string;
  page(html: string): string;
  logout(form: string, hostname: string): string;
  loggedout(display: string): string;
  error(html: string): string;
  // Theme provides its own Mustache layouts directory (or null for default views)
  layoutsDir(): string | null;
  // Theme provides its own static assets directory
  assetsDir(): string;
}
```

Each existing theme file (`theme.ts`) needs to be wrapped in a proper plugin entry (`index.ts`) that implements this interface, with `initialize()` setting `site_name`, `layoutsDir()` and `assetsDir()` returning real paths.

### 1.4 Provider Plugin Interface (new)

The provider plugin encapsulates **how the app gets its users**. At its core, a provider
answers two questions: "does this user exist?" and "are these credentials valid?"

**Design philosophy:** Providers are **headless by default**. A provider could be a SQL
database, a Unix password file, a CSV, an LDAP directory — anything that can look up users
and verify credentials. The core OIDC server owns the login UI, MFA flow, and interaction
routing. The provider just supplies user data.

Providers are responsible for exposing their own features — registration, profile management,
password reset, email confirmation — if applicable. A CSV provider exposes none of these.
Simple SQL exposes all of them. Core does not assume or orchestrate any of it. The provider
registers its own routes for whatever user lifecycle it supports.

Future providers *may* bring their own UI (e.g. a WorkOS plugin that redirects to an
enterprise SSO and back), but that is an optional extension, not the baseline contract.

```typescript
// src/plugins/provider/interface.ts
export interface ProviderPlugin extends Plugin {
  meta: PluginMeta & { type: 'provider' };

  // -- Required: the minimum every provider must implement --

  // Verify credentials from login form (req.body.login, req.body.password).
  // Returns account on success, null on failure.
  // Provider sets flash messages on req for error feedback.
  authenticate(req: Request): Promise<OIDCAccount | null>;

  // Look up an account by its unique account_id.
  // Called by oidc-provider during token issuance and userinfo.
  findAccount(ctx: any, id: string, token?: any): Promise<OIDCAccount | null>;

  // Return OIDC claims for a given account.
  getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>>;

  // -- Optional: provider registers its own Express routes --
  // Registration, profile, password reset, email confirmation, etc. are all
  // provider concerns. If applicable, the provider returns its routes and
  // core mounts them. A headless provider (CSV, passwd) returns nothing.
  getRoutes?(app: Application): void;

  // Does this provider handle its own login UI externally?
  // If true, authenticate() is NOT called by core interaction routes.
  // Instead, core calls getExternalLoginUrl() and the provider handles
  // the full auth flow, redirecting back when done.
  // (e.g., WorkOS, Auth0, enterprise SAML -- future use)
  externalAuth?: boolean;
  getExternalLoginUrl?(returnTo: string): Promise<string>;
  handleExternalCallback?(req: Request): Promise<OIDCAccount | null>;
}

export interface OIDCAccount {
  accountId: string;
  claims(use: string, scope: string): Promise<Record<string, any>>;
}
```

**Examples of how different providers would implement this:**

| Provider | authenticate | getRoutes | externalAuth |
|---|---|---|---|
| Simple SQL (current) | bcrypt against MySQL | /register, /confirm, /reconfirm, /profile, /lost_password, /reset_password | no |
| Unix passwd | check /etc/shadow | none | no |
| CSV file | lookup + compare | none | no |
| WorkOS (future) | N/A | /callback | yes |
| LDAP (future) | LDAP bind | possibly /profile | no |

### 1.5 Session Plugin Interface (new)

The session plugin encapsulates **how runtime persistence happens** -- the OIDC adapter (tokens, grants, sessions, interactions) and the express-session store.

```typescript
// src/plugins/session/interface.ts
export interface SessionPlugin extends Plugin {
  meta: PluginMeta & { type: 'session' };

  // Return an oidc-provider adapter constructor
  // (matches oidc-provider's adapter interface: constructor(name) => { upsert, find, ... })
  getAdapterConstructor(): AdapterConstructor;

  // Return an express-session store (optional; if not provided, default MemoryStore is used)
  getSessionStore?(session: typeof import('express-session')): import('express-session').Store;

  // Direct cache operations for app-level use (MFA codes, confirmation codes, etc.)
  set(key: string, value: any, ttlSeconds?: number): Promise<void>;
  get(key: string): Promise<any | undefined>;
  del(key: string): Promise<void>;

  // Connection lifecycle
  isConnected(): boolean;
}

// Matches oidc-provider's expected adapter factory
type AdapterConstructor = new (name: string) => {
  upsert(id: string, payload: any, expiresIn?: number): Promise<void>;
  find(id: string): Promise<any | undefined>;
  findByUserCode?(userCode: string): Promise<any | undefined>;
  findByUid?(uid: string): Promise<any | undefined>;
  consume(id: string): Promise<void>;
  destroy(id: string): Promise<void>;
  revokeByGrantId(grantId: string): Promise<void>;
};
```

### 1.6 MFA Plugin Interface (new)

The MFA plugin sits between authentication and session creation. After the provider
successfully authenticates a user, core asks the MFA plugin to challenge them.
MFA is **not** a provider concern — it's an independent verification layer. A CSV
provider doesn't know about MFA, but you might still want it.

Two initial plugins:
- **otp** (OneTimePassword) — extracted from current code: generates 6-digit pin,
  emails it via core email service, verifies it. Uses session plugin cache for storage.
- **none** — pass-through, always succeeds. Use when MFA isn't required, or when
  the provider already handled strong auth (e.g. WorkOS/enterprise SSO).

```typescript
// src/plugins/mfa/interface.ts
export interface MFAPlugin extends Plugin {
  meta: PluginMeta & { type: 'mfa' };

  // Called after provider.authenticate() succeeds.
  // Returns true if this plugin requires a challenge step.
  // The "none" plugin always returns false.
  requiresChallenge(account: OIDCAccount): Promise<boolean>;

  // Generate and deliver a challenge (e.g. email a pin code).
  // Returns an opaque challenge ID that core stores in the interaction.
  // The OTP plugin generates a pin, stores it via session cache, and emails it.
  issueChallenge(account: OIDCAccount, req: Request): Promise<string>;

  // Verify the user's response to the challenge.
  // req.body contains the user's input (e.g. { mfa: "123456" }).
  // Returns true if verified, false if not (plugin sets flash errors on req).
  verifyChallenge(challengeId: string, req: Request): Promise<boolean>;
}
```

### 1.7 Extension Plugin Interface (new)

Extensions add optional features to the OIDC server. Unlike the other four types (where
one or a few are active), extensions are purely additive — any number can be active
simultaneously. They can register routes, add middleware, link external accounts, or
provide entirely new functionality.

**Examples:**
- Discord account linking (link a Discord account to your OIDC identity)
- Patreon rewards (check Patreon membership, expose claims/scopes)
- Custom games/apps (login to play today's game)
- User theme picker (let logged-in users override the default theme)

```typescript
// src/plugins/extension/interface.ts
export interface ExtensionPlugin extends Plugin {
  meta: PluginMeta & { type: 'extension' };

  // Register routes on the Express app (required — if an extension has no routes, it's middleware)
  getRoutes?(app: Application): void;

  // Optional: add Express middleware (runs before routes)
  getMiddleware?(app: Application): void;

  // Optional: expose additional OIDC claims/scopes this extension provides
  // e.g. a Patreon plugin might add a "patreon:tier" claim
  getClaims?(accountId: string): Promise<Record<string, any>>;

  // Optional: expose additional OIDC scopes this extension makes available
  getScopes?(): string[];
}
```

**Core interaction flow with MFA:**
1. User submits login form
2. Core calls `provider.authenticate(req)` → account or null
3. If account, core calls `mfa.requiresChallenge(account)`
4. If challenge required: core calls `mfa.issueChallenge(account, req)`, renders MFA form
5. User submits MFA form → core calls `mfa.verifyChallenge(challengeId, req)`
6. If verified: finish OIDC interaction
7. If not: re-render MFA form with error

---

## Phase 2: Config Changes & Plugin Wiring

### 2.1 Config Changes

Add to env/config:
- `PROVIDER` (string, default: `simple-sql`) -- which provider plugin to load
- `SESSION` (string, default: `redis`) -- which session plugin to load
- `MFA` (string, default: `otp`) -- which MFA plugin to load
- Remove provider-specific env vars from core config (move to provider plugin config)
- Remove cache-specific env vars from core config (move to session plugin config)

Provider plugins read their own env vars. For `simple-sql`:
- `DATABASE_URL` -- MySQL connection
- `PASSWORD_SALT` -- bcrypt rounds

Session plugins read their own env vars. For `redis`:
- `CACHE_URL` -- Redis connection

MFA plugins read their own env vars. For `otp`:
- (none needed — uses core email service and session plugin cache)

---

## Phase 3: Extract "Simple SQL" Provider Plugin

This is the bulk of the migration -- extracting the current hardcoded auth logic into a plugin.

### 3.1 Files to move/refactor

| Current Location | New Location | Notes |
|---|---|---|
| `src/models/account.ts` | `src/plugins-available/providers/simple-sql/account.ts` | Core of the provider |
| `src/db/schema.ts` (users, confirmation_codes) | `src/plugins-available/providers/simple-sql/schema.ts` | Provider-owned schema |
| `src/db/index.ts` | `src/plugins-available/providers/simple-sql/db.ts` | Provider-owned DB connection |
| `src/controller/register.ts` | `src/plugins-available/providers/simple-sql/routes/register.ts` | Provider route |
| `src/controller/confirm.ts` | `src/plugins-available/providers/simple-sql/routes/confirm.ts` | Provider route |
| `src/controller/reconfirm.ts` | `src/plugins-available/providers/simple-sql/routes/reconfirm.ts` | Provider route |
| `src/controller/profile.ts` | `src/plugins-available/providers/simple-sql/routes/profile.ts` | Provider route |
| `src/controller/lost_password.ts` | `src/plugins-available/providers/simple-sql/routes/lost_password.ts` | Provider route |
| `src/controller/reset_password.ts` | `src/plugins-available/providers/simple-sql/routes/reset_password.ts` | Provider route |
| `src/lib/email.ts` (sendConfirmationEmail, sendPasswordResetEmail) | `src/plugins-available/providers/simple-sql/email.ts` | Provider-specific email templates (imports core transporter) |
| `drizzle/` migrations (users, confirmation_codes) | `src/plugins-available/providers/simple-sql/migrations/` | Provider-owned migrations |

### 3.2 What stays in core

| File | Reason |
|---|---|
| `src/controller/home.ts` | App-level route (landing page) |
| `src/controller/docs.ts` | App-level route (documentation) |
| `src/controller/routes.ts` | Refactored: loads core routes (home, docs) then calls `provider.getRoutes(app)` to let the provider register its own |
| `src/provider/express.ts` | Refactored: OIDC interaction routing stays in core, delegates `authenticate()` to provider plugin and challenge flow to MFA plugin |
| `src/models/clients.ts` | Clients are OIDC-level, not provider-specific |
| `src/db/schema.ts` (clients table only) | Clients table stays in core |
| `src/lib/config.ts` | Core config, minus provider/session-specific vars |
| `src/lib/email.ts` (transporter only) | SMTP transporter is a core shared service. `sendLoginPinEmail` moves to OTP MFA plugin. `sendConfirmationEmail`/`sendPasswordResetEmail` move to Simple SQL provider. Both import the core transporter. |
| `src/lib/log.ts` | Logging infrastructure (rotating-file-stream for Morgan) |
| `src/server.ts` | Boot sequence, uses registry to load plugins |
| `src/views/` | Core-owned Mustache templates. Provider-specific views (register, confirm, profile, etc.) move out with the provider. Core keeps: `_layout`, `error`, `home`, `login`, `mfa`, `docs/about`, `interaction`, `repost` |
| `src/types/` | TypeScript shims |
| `content/` | Shared Mustache partials |

### 3.3 Files to delete

| File | Reason |
|---|---|
| `src/lib/plugin.ts` | Dead code from a Discord bot. References `Client`, `DiscordMessage`, `DiscordUser`, `DiscordAccounts`, `PersistanceAdapter`. Not imported anywhere in the OIDC codebase. |

### 3.4 Interaction Route Refactoring

`src/provider/express.ts` currently hardcodes the login+MFA flow. Refactor to:

1. `GET /interaction/:uid` -- core handles prompt switching, renders login form
2. `POST /interaction/:uid/login` -- core calls `provider.authenticate(req)`
   - If auth fails: redirect back to login (provider has set flash errors on req)
   - If auth succeeds: core calls `mfa.requiresChallenge(account)`
     - If MFA required: `mfa.issueChallenge(account, req)`, render MFA form
     - If no MFA: finish interaction immediately
3. `POST /interaction/:uid/mfa` -- core calls `mfa.verifyChallenge(challengeId, req)`, finishes interaction on success
4. `GET /interaction/:uid/abort` -- stays as-is (generic)

For external auth providers (`externalAuth: true`), core skips both the login form
and MFA — the external system is responsible for its own auth strength.

---

## Phase 4: Extract Redis Session Plugin

### 4.1 Files to move/refactor

| Current Location | New Location | Notes |
|---|---|---|
| `src/database_adapter.ts` | `src/plugins-available/sessions/redis/adapter.ts` | The OIDC adapter |
| Redis connection (`new Redis(config.cache_url)`) | `src/plugins-available/sessions/redis/connection.ts` | Plugin-owned connection |

### 4.2 Redis Plugin Structure

```
src/plugins-available/sessions/redis/
  index.ts              # Default export: SessionPlugin implementation
  adapter.ts            # DatabaseAdapter class (from current database_adapter.ts)
  connection.ts         # Redis connection management
  store.ts              # express-session Redis store (connect-redis)
```

The Redis plugin:
- Reads `CACHE_URL` from env
- Creates ioredis connection
- Implements `getAdapterConstructor()` returning the current `DatabaseAdapter` class
- Implements `getSessionStore()` returning a `connect-redis` store instance
- Implements `set/get/del` for app-level cache (MFA codes, etc.)

### 4.3 LRU Session Plugin (new)

```
src/plugins-available/sessions/lru/
  index.ts              # Default export: SessionPlugin implementation
  adapter.ts            # In-memory adapter using Map + TTL expiry
```

The LRU plugin:
- No external dependencies
- Uses `Map` with TTL-based eviction (or a small LRU lib)
- Useful for development/testing without Redis
- `getSessionStore()` returns undefined (use default MemoryStore)
- Implements `set/get/del` using the same Map

---

## Phase 5: Wrap Existing Themes as Proper Plugins

The existing themes (`nbn24`, `robotic`, `xalior`) are plain objects with no plugin infrastructure. They need to be wrapped to implement `ThemePlugin`.

### 5.1 Move and wrap existing themes

Each theme directory moves from `src/themes/{name}/` to `src/plugins-available/themes/{name}/`. The existing `theme.ts` file stays as-is (the rendering logic). A new `index.ts` wraps it:

```typescript
// src/plugins-available/themes/nbn24/index.ts
import { ThemePlugin } from '../../../plugins/theme/interface.ts';
import theme from './theme.ts';

const plugin: ThemePlugin = {
  meta: { name: 'nbn24', version: '1.0.0', type: 'theme' },

  site_name: '',

  async initialize(config) {
    this.site_name = config.site_name;
    theme.site_name = config.site_name;
  },

  page: (html) => theme.page(html),
  logout: (form, hostname) => theme.logout(form, hostname),
  loggedout: (display) => theme.loggedout(display),
  error: (html) => theme.error(html),

  layoutsDir() {
    return new URL('./layouts', import.meta.url).pathname;
  },
  assetsDir() {
    return new URL('../../../../public/themes/nbn24', import.meta.url).pathname;
  },
};

export default plugin;
```

### 5.2 Theme asset serving

Change `server.ts` from:
```typescript
app.use('/theme', express.static(path.join(__dirname, '../public/themes/'+config.theme)));
```
To:
```typescript
const theme = registry.getTheme();
app.use('/theme', express.static(theme.assetsDir()));
```

---

## Phase 6: Refactor server.ts Boot Sequence

### New boot order:

```
1.  Load app config (config.ts — Zod env validation, plugin selectors, SMTP, debug)
2.  Initialize plugin registry
3.  Load session plugin (SESSION env var — single active)
4.  Load provider plugin (PROVIDER env var — single active)
5.  Load MFA plugins (MFA env var — comma-separated, multiple active)
6.  Load theme plugins (all available themes; THEME env var sets default)
7.  Load extension plugins (EXTENSIONS env var — comma-separated, multiple active)
8.  Build OIDC config (oidc-config.ts — takes app config, returns oidc-provider config)
9.  Create Express app
10. Configure core middleware (morgan, helmet, cors, csrf, flash, passport)
11. Configure express-session with session plugin's store
12. Configure template engine with default theme's layouts
13. Serve default theme static assets
14. Register core routes (home, docs)
15. Register provider routes (provider.getRoutes())
16. Register extension routes (each extension.getRoutes())
17. Set findAccount on OIDC config from provider plugin
18. Create oidc-provider with session plugin's adapter + OIDC config
19. Register interaction routes (delegates auth to provider, challenge to MFA)
20. Mount oidc-provider callback
21. Start server
22. Self-discovery loop
23. Passport strategy setup
```

---

## Phase 7: Config Cleanup & Split

### Split config.ts into app config vs OIDC config

Currently `src/lib/config.ts` is a single 300-line file that mixes environment variable
validation with oidc-provider-specific configuration (TTLs, claims, features, jwks,
cookies, interaction URLs, renderError, loadExistingGrant, issueRefreshToken). This
makes it extremely brittle — tightly coupled to oidc-provider's API surface, hard to
read, and fragile if oidc-provider ever changes its config shape.

**Split into:**

- **`src/lib/config.ts`** — App config only. Zod env validation, plugin selectors,
  SMTP, debug flags. Exports a clean `AppConfig` object with no oidc-provider types.
  This is what gets passed to plugins as `PluginConfig`.

- **`src/lib/oidc-config.ts`** — OIDC provider configuration. A function
  `buildOIDCConfig(appConfig)` that returns the oidc-provider-specific config object
  (TTLs, claims, features, jwks, cookies, etc.). Only imported by `server.ts` at boot
  time. This isolates the oidc-provider dependency to one file.

This means plugins never see oidc-provider types. If oidc-provider changes its config
shape, only `oidc-config.ts` needs updating.

### Migrate loose `process.env` reads into Zod config:
Currently `SESSION_SECRET`, `CLIENT_ID`, `CLIENT_SECRET`, and `PORT` are read directly from `process.env` in `server.ts` with inline defaults. Move these into the Zod schema in `config.ts` for validation and single source of truth.

### Core config keeps (in Zod schema):
- `HOSTNAME`, `SITE_NAME`, `MODE` (already in Zod)
- `PORT`, `SESSION_SECRET`, `CLIENT_ID`, `CLIENT_SECRET` (move from loose `process.env` into Zod)
- `THEME`, `PROVIDER`, `SESSION`, `MFA` (new plugin selectors)
- `DEBUG_ADAPTER`, `DEBUG_ACCOUNT` (already in Zod)
- `CLIENT_FEATURES_REGISTRATION` (already in Zod)
- `SMTP_*` (already in Zod -- email is a core service, used by OTP MFA plugin and potentially others)
- OIDC-specific derived config: `ttl`, `claims`, `features`, `jwks`, `cookies`, `interactions`

### Moves to provider plugin config:
- `DATABASE_URL`, `PASSWORD_SALT` (currently in Zod, provider reads its own env)
- `PATREON_*` (currently in Zod, optional)

### Moves to session plugin config:
- `CACHE_URL` (currently in Zod, session plugin reads its own env)

### New dependency needed:
- `connect-redis` -- not currently in `package.json`, needed for Redis session store plugin

---

## Execution Order (Implementation Steps)

1. **Build plugin infrastructure from scratch** -- `src/plugins/types.ts`, interface files for all five types (theme, provider, session, mfa, extension), `src/plugins/registry.ts` with discovery/loading/validation/lifecycle. Registry supports single-active (provider, session) and multi-active (theme, mfa, extension) plugin types.
2. **Create `src/plugins-available/` directory structure**
3. **Wrap existing themes as proper plugins** -- move `src/themes/*` to `src/plugins-available/themes/*`, add `index.ts` wrappers implementing `ThemePlugin`, update config/server to load via registry
4. **Extract Redis session plugin** -- move `database_adapter.ts` into `src/plugins-available/sessions/redis/`, add express-session store, update server boot
5. **Create LRU session plugin** -- in-memory alternative for dev/test
6. **Extract OTP MFA plugin** -- extract MFA logic from `provider/express.ts` into `src/plugins-available/mfa/otp/`, uses core email + session cache
7. **Create "none" MFA plugin** -- pass-through, `requiresChallenge()` always returns false
8. **Extract Simple SQL provider plugin** -- move account model, controllers, schema, provider-specific email into `src/plugins-available/providers/simple-sql/`
9. **Refactor interaction routes** -- `src/provider/express.ts` delegates auth to provider plugin, challenge to MFA plugin
10. **Split config.ts** -- separate app config (`config.ts`) from OIDC-provider config (`oidc-config.ts`). App config has Zod env validation and plugin selectors. OIDC config is a builder function called only by server.ts.
11. **Refactor server.ts** -- new boot sequence: registry loads all five plugin types, wires them into Express + oidc-provider using the split config
12. **Add extension plugin infrastructure** -- interface, registry support, `EXTENSIONS` env var. No concrete extensions yet (future: discord, patreon, etc.) but the plumbing is in place.
13. **Update tests** -- adapt to new plugin structure
14. **Update webpack config** -- new theme asset paths under `plugins-available/themes/`
15. **Update Docker/deployment** -- new env vars, migration paths

---

## Risk Considerations

- **Clients table**: stays in core (OIDC-level concern), but provider plugins that use SQL may want to share the DB connection. Consider a `getDatabaseConnection()` on the provider plugin that core can optionally use for clients.
- **Email is core**: `src/lib/email.ts` currently exports `transporter`, `sendConfirmationEmail`, `sendLoginPinEmail`, `sendPasswordResetEmail`. The SMTP transporter stays in core as a shared service. `sendLoginPinEmail` moves to the OTP MFA plugin. `sendConfirmationEmail` and `sendPasswordResetEmail` move to the Simple SQL provider plugin. Both plugins import the core transporter.
- **SMTP config stays in core**: `SMTP_*` env vars remain in the core Zod schema since email is a shared core service.
- **Migration runner**: `src/db/migrate.ts` currently runs Drizzle migrations from `./drizzle` folder. For the Simple SQL provider, its migrations should live with the plugin. Core keeps a `clients` migration only. The migration runner needs to be updated to find plugin migration folders.
- **Default views**: `src/views/` contains 14 Mustache templates that are the fallback when a theme has no `layouts/` directory. These are core-owned and must remain. Provider-specific views (register, confirm, profile, login, mfa, etc.) need thought: do they stay in core `src/views/` as defaults, or does the provider plugin supply its own views?
- **Dead code**: `src/lib/plugin.ts` is Discord bot infrastructure (references `Client`, `DiscordMessage`, `PersistanceAdapter`). Not used anywhere. Delete before starting migration to avoid confusion with the new plugin system.
- **Backwards compatibility**: Existing `.env` files should continue to work. Default `PROVIDER=simple-sql` and `SESSION=redis` means zero-config migration for existing deployments.
- **Log infrastructure**: `src/lib/log.ts` hardcodes log filename prefix as `nbn-oidc-provider`. Should be made configurable or renamed to something generic.
