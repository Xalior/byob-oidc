# Plugin Interface Reference

Complete API reference for all plugin types. Source files are in `src/plugins/`.

## Base Interface (all plugins)

**Source:** `src/plugins/types.ts`

```typescript
type PluginType = 'theme' | 'provider' | 'session' | 'mfa' | 'extension';

interface PluginMeta {
    name: string;           // Unique identifier (e.g., "simple-sql")
    version: string;        // Semver version (e.g., "1.0.0")
    type: PluginType;       // Must match the type being loaded
    description?: string;   // Human-readable description
}

interface Plugin {
    meta: PluginMeta;
    initialize(config: PluginConfig): Promise<void>;
    shutdown?(): Promise<void>;
}
```

### `meta`
Identity and type declaration. The `type` field **must** match the plugin type directory. If you put a plugin in `plugins-available/providers/` but its `meta.type` is `'session'`, the registry will reject it.

### `initialize(config: PluginConfig): Promise<void>`
Called once at boot. Use this to:
- Establish database or cache connections
- Read plugin-specific env vars from `process.env`
- Set up internal state

The `config` parameter contains core server configuration (hostname, SMTP, debug flags, etc.) -- see [Architecture](./architecture.md#pluginconfig) for the full shape.

### `shutdown?(): Promise<void>` (optional)
Called on graceful server shutdown. Use this to close connections, flush caches, clear intervals. Errors are logged but don't block other plugins from shutting down.

---

## ThemePlugin

**Source:** `src/plugins/theme/interface.ts`

```typescript
interface ThemePlugin extends Plugin {
    meta: PluginMeta & { type: 'theme' };
    site_name: string;

    page(html: string): string;
    logout(form: string, hostname: string): string;
    loggedout(display: string): string;
    error(html: string): string;
    layoutsDir(): string | null;
    assetsDir(): string;
}
```

### Properties

| Property | Description |
|---|---|
| `site_name` | Set during `initialize()` from `config.site_name`. Used by rendering methods. |

### Methods

#### `page(html: string): string`
Wraps the main page content in the theme's HTML shell (header, navigation, footer, stylesheets). The `html` parameter is the rendered Mustache template content. Returns complete HTML.

#### `logout(form: string, hostname: string): string`
Renders the logout confirmation page. `form` is the CSRF-protected logout form HTML. `hostname` is the server hostname for display.

#### `loggedout(display: string): string`
Renders the "you have been logged out" page. `display` is a message or redirect info.

#### `error(html: string): string`
Renders an error page. `html` is the error message content.

#### `layoutsDir(): string | null`
Returns the absolute path to a directory of Mustache template overrides, or `null` to use the core default templates in `src/views/`. If a path is returned, the template engine checks there first and falls back to `src/views/` for any missing templates.

#### `assetsDir(): string`
Returns the absolute path to the theme's static assets directory (CSS, images, fonts, JS). The core mounts this at `/theme` in Express:

```typescript
app.use('/theme', express.static(theme.assetsDir()));
```

---

## ProviderPlugin

**Source:** `src/plugins/provider/interface.ts`

```typescript
interface OIDCAccount {
    accountId: string;
    claims(use: string, scope: string): Promise<Record<string, any>>;
}

interface ProviderPlugin extends Plugin {
    meta: PluginMeta & { type: 'provider' };

    // Required
    authenticate(req: Request): Promise<OIDCAccount | null>;
    findAccount(ctx: any, id: string, token?: any): Promise<OIDCAccount | null>;
    getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>>;

    // Optional
    getRoutes?(app: Application): void;
    externalAuth?: boolean;
    getExternalLoginUrl?(returnTo: string): Promise<string>;
    handleExternalCallback?(req: Request): Promise<OIDCAccount | null>;
}
```

### OIDCAccount

The shared account interface that flows through the system. Every provider must return objects matching this shape.

| Field | Description |
|---|---|
| `accountId` | Unique, stable identifier for the user |
| `claims(use, scope)` | Returns OIDC claims. `use` is `"id_token"` or `"userinfo"`. `scope` is the requested OIDC scope string. |

### Required Methods

#### `authenticate(req: Request): Promise<OIDCAccount | null>`
Verify credentials from the login form. `req.body.login` and `req.body.password` contain the user's input. Returns the account on success, `null` on failure. Set flash messages on `req` for error feedback:

```typescript
req.flash('error', 'Invalid email or password');
return null;
```

#### `findAccount(ctx: any, id: string, token?: any): Promise<OIDCAccount | null>`
Look up an account by its unique ID. Called by the oidc-provider library during token issuance and userinfo requests. The `ctx` is the oidc-provider's Koa context; `token` is the relevant token object (if available).

#### `getClaims(accountId: string, use: string, scope: string): Promise<Record<string, any>>`
Return OIDC claims for a given account. Standard claims include:

```typescript
{
    sub: accountId,
    email: "user@example.com",
    email_verified: true,
    name: "Jane Doe",
    // ... any other OIDC standard or custom claims
}
```

### Optional Methods

#### `getRoutes?(app: Application): void`
Register provider-specific Express routes. The `simple-sql` provider registers: `/register`, `/confirm`, `/reconfirm`, `/profile`, `/lost_password`, `/reset_password`. A read-only provider (CSV, LDAP) might register nothing.

#### `externalAuth?: boolean`
Set to `true` if this provider handles authentication externally (e.g., SSO redirect). When true, the core login form is bypassed entirely.

#### `getExternalLoginUrl?(returnTo: string): Promise<string>`
Returns the URL to redirect the user to for external authentication. Only called when `externalAuth` is `true`.

#### `handleExternalCallback?(req: Request): Promise<OIDCAccount | null>`
Handles the callback from external authentication. Returns the authenticated account.

---

## SessionPlugin

**Source:** `src/plugins/session/interface.ts`

```typescript
type AdapterConstructor = new (name: string) => OIDCAdapter;

interface OIDCAdapter {
    upsert(id: string, payload: any, expiresIn?: number): Promise<void>;
    find(id: string): Promise<any | undefined>;
    findByUserCode?(userCode: string): Promise<any | undefined>;
    findByUid?(uid: string): Promise<any | undefined>;
    consume(id: string): Promise<void>;
    destroy(id: string): Promise<void>;
    revokeByGrantId(grantId: string): Promise<void>;
}

interface SessionPlugin extends Plugin {
    meta: PluginMeta & { type: 'session' };

    getAdapterConstructor(): AdapterConstructor;
    getSessionStore?(): session.Store;
    set(key: string, value: any, ttlSeconds?: number): Promise<void>;
    get(key: string): Promise<any | undefined>;
    del(key: string): Promise<void>;
    isConnected(): boolean;
    setClientFinder(finder: (id: string) => Promise<any>): void;
}
```

### OIDC Adapter

The adapter is the bridge between the `oidc-provider` library and your storage backend. The library stores tokens, grants, sessions, interactions, and other OIDC artifacts through this interface.

#### `getAdapterConstructor(): AdapterConstructor`
Returns a constructor function. The oidc-provider library calls `new Adapter(modelName)` where `modelName` is one of: `"Session"`, `"AccessToken"`, `"AuthorizationCode"`, `"RefreshToken"`, `"DeviceCode"`, `"ClientCredentials"`, `"Client"`, `"InitialAccessToken"`, `"RegistrationAccessToken"`, `"Interaction"`, `"ReplayDetection"`, `"PushedAuthorizationRequest"`, `"Grant"`, `"BackchannelAuthenticationRequest"`.

Each instance manages a namespace of that model type. See the [oidc-provider adapter documentation](https://github.com/panva/node-oidc-provider/tree/main/docs#adapter) for details.

### Key-Value Cache

These methods provide a simple cache that other plugins use for temporary data (MFA codes, confirmation tokens, etc.):

| Method | Description |
|---|---|
| `set(key, value, ttlSeconds?)` | Store a value. Optional TTL in seconds; no TTL means no expiry. |
| `get(key)` | Retrieve a value. Returns `undefined` if not found or expired. |
| `del(key)` | Delete a value. |

### Other Methods

#### `getSessionStore?(): session.Store`
Returns an `express-session` compatible store. If not implemented, Express uses the default `MemoryStore` (not suitable for production).

#### `isConnected(): boolean`
Returns whether the backing store is connected and healthy.

#### `setClientFinder(finder: (id: string) => Promise<any>): void`
Receives a callback for looking up OIDC clients by `client_id`. Called once at boot by `server.ts`. The adapter uses this when the oidc-provider requests a `Client` model lookup.

---

## MFAPlugin

**Source:** `src/plugins/mfa/interface.ts`

```typescript
interface MFAPlugin extends Plugin {
    meta: PluginMeta & { type: 'mfa' };

    requiresChallenge(account: OIDCAccount): Promise<boolean>;
    issueChallenge(account: OIDCAccount, req: Request): Promise<string>;
    verifyChallenge(challengeId: string, req: Request): Promise<boolean>;
}
```

### Methods

#### `requiresChallenge(account: OIDCAccount): Promise<boolean>`
Called after successful authentication. Return `true` if this plugin needs to challenge the user, `false` to skip. The `none` plugin always returns `false`. A TOTP plugin might check if the user has enrolled.

#### `issueChallenge(account: OIDCAccount, req: Request): Promise<string>`
Generate and deliver the challenge. Returns an opaque **challenge ID** that the core stores in the session. The ID is passed back to `verifyChallenge()` when the user responds.

Example: The OTP plugin generates a 6-digit PIN, stores it in the session cache with a 15-minute TTL, and emails it to the user.

#### `verifyChallenge(challengeId: string, req: Request): Promise<boolean>`
Verify the user's response. `req.body` contains the form submission (e.g., `{ mfa: "123456" }`). Return `true` if verified. Set flash messages on `req` for error feedback:

```typescript
req.flash('error', 'Invalid Passcode!');
return false;
```

---

## ExtensionPlugin

**Source:** `src/plugins/extension/interface.ts`

```typescript
interface ExtensionPlugin extends Plugin {
    meta: PluginMeta & { type: 'extension' };

    getRoutes?(app: Application): void;
    getMiddleware?(app: Application): void;
    getClaims?(accountId: string): Promise<Record<string, any>>;
    getScopes?(): string[];
}
```

All methods are optional. An extension with no methods does nothing (but still loads and runs its `initialize()`/`shutdown()` lifecycle).

### Methods

#### `getRoutes?(app: Application): void`
Register Express routes. These are mounted alongside core and provider routes.

#### `getMiddleware?(app: Application): void`
Register Express middleware that runs before routes. Use for request decoration, header injection, logging, etc.

#### `getClaims?(accountId: string): Promise<Record<string, any>>`
Return additional OIDC claims for a user. These are merged with the provider's claims during token issuance.

#### `getScopes?(): string[]`
Return additional OIDC scopes this extension provides. These are added to the server's supported scopes list.
