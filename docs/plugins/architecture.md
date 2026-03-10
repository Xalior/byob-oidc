# Plugin Architecture

## Overview

The plugin system is built around a central **registry** (`src/plugins/registry.ts`) that handles plugin discovery, loading, validation, initialization, and shutdown. Plugins are organized by type, each with a defined interface contract.

```
src/
  plugins/                        # Plugin infrastructure (interfaces, registry)
    types.ts                      # Base Plugin interface, PluginConfig, PluginType
    registry.ts                   # Discovery, loading, validation, lifecycle
    schema-push.ts                # Drizzle schema push helper for plugins
    theme/interface.ts            # ThemePlugin interface
    provider/interface.ts         # ProviderPlugin + OIDCAccount interfaces
    session/interface.ts          # SessionPlugin + OIDCAdapter interfaces
    mfa/interface.ts              # MFAPlugin interface
    extension/interface.ts        # ExtensionPlugin interface

  plugins-available/              # Plugin implementations live here
    themes/
      nbn24/index.ts
      robotic/index.ts
      xalior/index.ts
    providers/
      simple-sql/index.ts
    sessions/
      redis/index.ts
      lru/index.ts
    mfa/
      otp/index.ts
      none/index.ts
    extensions/
      (none yet)
```

## Plugin Lifecycle

### 1. Boot Sequence

When the server starts (`src/server.ts`), plugins are loaded in a specific order because some depend on others:

```
1. Load app config (env vars, Zod validation)
2. initializePlugins(selections, config)
   a. Session plugin loads first (other plugins use its cache)
   b. Provider plugin loads
   c. MFA plugins load (comma-separated list)
   d. All available themes are discovered and loaded
   e. Extension plugins load (comma-separated list)
3. Wire client finder into session adapter
4. Build OIDC config
5. Create Express app, mount routes
6. Start listening
```

### 2. Plugin Loading

For each plugin, the registry:

1. **Resolves the path**: `src/plugins-available/{typeDir}/{name}/index.ts`
2. **Dynamic imports** the module
3. **Checks for a default export** (the plugin object)
4. **Validates** the plugin against its type's requirements
5. **Calls `initialize(config)`** with the core `PluginConfig`
6. **Stores** the plugin in the registry

Type directory mapping:

| Plugin Type | Directory |
|---|---|
| theme | `plugins-available/themes/` |
| provider | `plugins-available/providers/` |
| session | `plugins-available/sessions/` |
| mfa | `plugins-available/mfa/` |
| extension | `plugins-available/extensions/` |

### 3. Validation

Every plugin is validated before initialization:

- `meta` object must exist with `name`, `version`, and correct `type`
- `initialize()` method must be a function
- Type-specific required methods must exist:

| Type | Required Methods |
|---|---|
| Theme | `page`, `logout`, `loggedout`, `error`, `layoutsDir`, `assetsDir` |
| Provider | `authenticate`, `findAccount`, `getClaims` |
| Session | `getAdapterConstructor`, `set`, `get`, `del`, `isConnected`, `setClientFinder` |
| MFA | `requiresChallenge`, `issueChallenge`, `verifyChallenge` |
| Extension | _(none -- all methods are optional)_ |

If validation fails, the registry throws a descriptive error and the server does not start.

### 4. Theme Discovery

Unlike other plugin types which are selected explicitly by env var, **all themes** in `plugins-available/themes/` are automatically discovered and loaded. The `THEME` env var only sets which one is the default. If a non-default theme fails to load, it logs a warning but doesn't stop the server. If the default theme fails, it's fatal.

### 5. Shutdown

On `SIGTERM`, the server calls `shutdownPlugins()` which iterates all loaded plugins and calls their optional `shutdown()` method. This allows plugins to close database connections, flush caches, clear intervals, etc. Shutdown errors are logged but don't prevent other plugins from shutting down.

## Single-Active vs Multi-Active

| Behavior | Plugin Types | Selection |
|---|---|---|
| **Single active** | Provider, Session | One name in env var |
| **Multi active** | MFA, Extension | Comma-separated names in env var |
| **All loaded** | Theme | All discovered, default set by env var |

## How the Core Uses Plugins

### Registry Accessors

Code throughout the application accesses plugins through registry functions:

```typescript
import { getProvider, getSession, getTheme, getMFA, getExtensions } from './plugins/registry.ts';

const provider = getProvider();       // throws if not loaded
const session = getSession();         // throws if not loaded
const theme = getTheme();             // returns default theme
const theme2 = getTheme('robotic');   // returns specific theme
const mfa = getMFA();                 // returns first active MFA
const mfa2 = getMFA('otp');           // returns specific MFA
const exts = getExtensions();         // returns array (possibly empty)
```

### Authentication Flow

```
User submits login form
       |
       v
core calls provider.authenticate(req)
       |
   success?---no---> redirect to login with flash error
       |
      yes
       |
       v
core calls mfa.requiresChallenge(account)
       |
   required?---no---> finish OIDC interaction
       |
      yes
       |
       v
core calls mfa.issueChallenge(account, req)
       |
       v
render MFA form (themed by theme.page())
       |
       v
User submits MFA code
       |
       v
core calls mfa.verifyChallenge(challengeId, req)
       |
   valid?---no---> re-render MFA form with error
       |
      yes
       |
       v
finish OIDC interaction
```

### Session as Shared Cache

The session plugin doubles as a key-value cache for other plugins:

```typescript
const session = getSession();
await session.set('mfa:code:abc123', { pin: '456789' }, 900);  // 15 min TTL
const data = await session.get('mfa:code:abc123');
await session.del('mfa:code:abc123');
```

The OTP MFA plugin uses this to store one-time codes. Any plugin can use it for temporary data.

### Client Finder Injection

The session adapter needs to look up OIDC clients, but clients live in the core database. This is wired at boot via dependency injection:

```typescript
sessionPlugin.setClientFinder(async (clientId: string) => {
    return Client.findByClientId(clientId);
});
```

## PluginConfig

Every plugin receives this config object during `initialize()`:

```typescript
interface PluginConfig {
    hostname: string;          // Server hostname (e.g., "id.example.com")
    site_name: string;         // Display name (e.g., "My Identity Server")
    mode: string;              // "dev" or "prod"
    provider_url: string;      // Full OIDC provider URL
    smtp: {
        host: string;
        port: number;
        secure: boolean;
        auth: { user: string | undefined; pass: string | undefined };
    };
    debug: {
        adapter: boolean;
        account: boolean;
    };
}
```

Plugins that need additional configuration (database URLs, API keys, etc.) read their own env vars directly from `process.env` during `initialize()`.

## Plugin Schema Management

Plugins that need database tables manage their own schema using the `pushPluginSchema()` helper (`src/plugins/schema-push.ts`). This is the recommended approach — it gives plugins full Drizzle schema management (create, diff, alter) while keeping them isolated from core and each other.

### How It Works

1. The core `drizzle.config.js` only manages core tables (e.g., `clients`) via `tablesFilter`
2. Each plugin that needs tables calls `pushPluginSchema()` during `initialize()`
3. The helper writes a temporary drizzle config scoped to the plugin's declared tables
4. `drizzle-kit push --force` runs against that config
5. The `tablesFilter` ensures the push can only see and modify the plugin's own tables

This means:
- Plugins can **create**, **alter**, and **evolve** their tables using standard Drizzle schema definitions
- `--force` is safe because the filter prevents any cross-plugin or cross-core interference
- New plugins automatically get their tables created on first boot
- Schema changes in plugin updates are applied automatically

### Usage

```typescript
// In your plugin's db.ts or initialize():
import { pushPluginSchema } from '../../../plugins/schema-push.ts';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

await pushPluginSchema({
    schemaPath: join(__dirname, 'schema.ts'),
    tables: ['my_table', 'my_other_table'],
    databaseUrl: process.env.DATABASE_URL!,
});
```

### Options

| Parameter | Type | Description |
|-----------|------|-------------|
| `schemaPath` | `string \| string[]` | Absolute path(s) to the plugin's Drizzle schema file(s) |
| `tables` | `string[]` | Table names this plugin owns (used as `tablesFilter`) |
| `databaseUrl` | `string` | MySQL connection URL |

### Example: simple-sql Provider

The built-in `simple-sql` provider manages its `users` and `confirmation_codes` tables this way:

```typescript
// simple-sql/db.ts
await pushPluginSchema({
    schemaPath: join(__dirname, 'schema.ts'),
    tables: ['users', 'confirmation_codes'],
    databaseUrl,
});
```

The schema is defined in standard Drizzle format (`schema.ts`), and any changes to the schema will be applied automatically on the next server start.
