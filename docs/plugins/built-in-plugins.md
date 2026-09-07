# Built-in Plugins

BYOB-OIDC ships with working plugins for all required types. These serve as both production defaults and reference implementations.

## Providers

### simple-sql

**Location:** `src/plugins-available/providers/simple-sql/`
**Env var:** `PROVIDER=simple-sql` (default)

MySQL-backed user authentication with bcrypt password hashing.

**Files:**
```
simple-sql/
  index.ts           # Plugin entry point
  account.ts         # Account class, password verification, user lookup
  db.ts              # Drizzle ORM + MySQL connection + schema bootstrap
  schema.ts          # Database schema (users, confirmation_codes tables)
  email.ts           # Email templates (confirmation, password reset)
  routes/
    register.ts      # POST /register -- user registration
    confirm.ts       # GET /confirm -- email confirmation
    reconfirm.ts     # POST /reconfirm -- resend confirmation email
    profile.ts       # GET/POST /profile -- user profile management
    lost_password.ts # GET/POST /lost_password -- request password reset
    reset_password.ts # GET/POST /reset_password -- complete password reset
```

**Required env vars:**
| Variable | Description | Default |
|---|---|---|
| `DATABASE_URL` | MySQL connection string (e.g., `mysql://user:pass@host:3306/db`) | _(required)_ |
| `PASSWORD_SALT` | bcrypt salt rounds | `11` |

**Features:**
- User registration with email confirmation
- bcrypt password hashing
- Password reset via email
- User profile management
- Self-managing database schema via `pushPluginSchema()` (tables are created/updated on boot)
- OIDC claims: `sub`, `email`, `email_verified`, `name`, `nickname`, `preferred_username`, `updated_at`

**Database tables owned:**
- `users` -- user accounts
- `confirmation_codes` -- email confirmation and password reset tokens

Tables are managed by the plugin itself during initialization using `pushPluginSchema()`. The Drizzle schema in `schema.ts` is the source of truth — changes to it are applied automatically on the next server start. See [Plugin Schema Management](./architecture.md#plugin-schema-management).

---

### stdio-auth

**Location:** `src/plugins-available/providers/stdio-auth/`
**Env var:** `PROVIDER=stdio-auth`

Authenticates against a command you supply. The plugin writes a JSON request to the command's stdin and reads a JSON reply from its stdout, so the accounts can live anywhere: a file, a directory server, or the host operating system via PAM.

**Files:**
```
stdio-auth/
  index.ts           # Plugin entry point, lookup cache
  backend.ts         # Spawns the command, enforces the JSON contract
```

**Required env vars:**
| Variable | Description | Default |
|---|---|---|
| `STDIO_AUTH_AUTHENTICATE_COMMAND` | Executable run to check a username and password | _(required)_ |
| `STDIO_AUTH_LOOKUP_COMMAND` | Executable run to fetch an account's claims without a password | _(required)_ |
| `STDIO_AUTH_TIMEOUT_MS` | How long a command may run before it is killed | `5000` |
| `STDIO_AUTH_MAX_OUTPUT_BYTES` | How much stdout the plugin will read | `65536` |
| `STDIO_AUTH_CACHE_MAX` | Lookup results held in memory | `1000` |
| `STDIO_AUTH_CACHE_TTL_MS` | How long each is held; `0` switches the cache off | `30000` |
| `STDIO_AUTH_LOGIN_LABEL` | What the login form calls the identifier field | `Username` |

Each command setting is a path to an executable and nothing else. Arguments are not accepted and no shell is involved, so a backend needing flags ships a wrapper script.

**Features:**
- Backend written in any language, in or out of this repository
- Passwords travel on stdin only, never argv or the environment
- Exit code carries the verdict: `0` success, `1` rejected, anything else a backend failure
- Claims pass through exactly as the backend wrote them, except `sub`, which always restates the account id
- Successful lookups cached in memory; misses are never cached, so a new account appears at once
- Backend stderr is captured to the server log
- The login form asks for a username in a plain text field, not an email address

**Not provided:** registration, password reset, profile pages, lockout counters. Accounts, their passwords and their removal belong to whatever sits behind the command.

The full contract is in [The stdio-auth provider](./stdio-auth.md). Working backends are in `examples/backends/`.

---

## Sessions

### redis

**Location:** `src/plugins-available/sessions/redis/`
**Env var:** `SESSION=redis` (default)

Production session storage using Redis with the JSON module.

**Files:**
```
redis/
  index.ts           # Plugin entry point
  adapter.ts         # OIDC adapter using Redis JSON commands
  connection.ts      # ioredis connection management
```

**Required env vars:**
| Variable | Description | Default |
|---|---|---|
| `CACHE_URL` | Redis connection string (e.g., `redis://host:6379/`) | _(required)_ |

**Requirements:**
- Redis server with the [RedisJSON module](https://redis.io/docs/stack/json/) enabled
- Uses `JSON.SET` and `JSON.GET` commands for structured data storage

**Key features:**
- OIDC adapter: stores tokens, grants, sessions, interactions
- Grant tracking and revocation by grant ID
- Lookup by `uid` and `userCode`
- Key-value cache with TTL for app-level data (MFA codes, etc.)
- Graceful shutdown (closes Redis connection)

### lru

**Location:** `src/plugins-available/sessions/lru/`
**Env var:** `SESSION=lru`

Bounded in-memory session storage for development and testing. **Not suitable for production** -- all data is lost on restart.

**Files:**
```
lru/
  index.ts           # Plugin entry point
  adapter.ts         # lru-cache backed OIDC adapter
```

**Required env vars:**
| Variable | Description | Default |
|---|---|---|
| `SESSION_LRU_MAX` | Entries held before the least recently used one is evicted | `10000` |

**Key features:**
- In-memory, backed by `lru-cache`
- Per-entry TTL, matching the expiry oidc-provider sets for each artifact
- Expired entries are dropped when next touched, with no sweep timer
- No express-session store (uses default MemoryStore)
- Identical interface to Redis plugin

Eviction can discard a session that has not expired, which logs that user out. Keep `SESSION_LRU_MAX` comfortably above the number of live sessions.

---

## Themes

These themes ship with BYOB-OIDC. All available themes are auto-discovered and loaded; the `THEME` env var sets the default.

### nbn24

**Location:** `src/plugins-available/themes/nbn24/`
**Env var:** `THEME=nbn24` (default)

Clean Bootstrap 5 theme with light/dark mode support. Uses the core default Mustache templates (`layoutsDir()` returns `null`).

### d3code

**Location:** `src/plugins-available/themes/d3code/`
**Env var:** `THEME=d3code`

The appearance of the D3-code desktop application, in both of its colour schemes: rose call-to-action buttons on warm pink paper in light, violet and pink on deep indigo in dark. Rounded cards, a blurred top bar that the page shows through, and a focus ring set one pixel clear of the control it marks. Ships its own Mustache templates.

The palette and geometry come from the plandrop D3-code theme, vendored unchanged as `scss/_d3code.scss` and licensed under the LGPL-3.0-only. See the `NOTICE` file in the theme directory.

### robotic

**Location:** `src/plugins-available/themes/robotic/`
**Env var:** `THEME=robotic`

Dark/cyberpunk-styled Bootstrap 5 theme. Uses the core default Mustache templates.

### xalior

**Location:** `src/plugins-available/themes/xalior/`
**Env var:** `THEME=xalior`

Alternative Bootstrap 5 theme. Uses the core default Mustache templates.

**Common theme structure:**
```
{name}/
  index.ts           # Plugin wrapper implementing ThemePlugin
  theme.ts           # Core rendering logic (HTML generation)
  main.ts            # Stylesheet entry point
  colour-modes.ts    # Light/dark mode definitions
  layouts/           # Mustache template overrides (if any)
  scss/              # Sass source files
```

**Assets** are served from `public/themes/{name}/` and typically include compiled CSS and images. Webpack compiles SCSS from the theme's `scss/` directory.

---

## MFA

### otp

**Location:** `src/plugins-available/mfa/otp/`
**Env var:** `MFA=otp` (default)

Email-based one-time password. After successful login, a 6-digit PIN is emailed to the user. They must enter it to complete authentication.

**Required env vars:** None (uses core SMTP configuration).

**Flow:**
1. User logs in successfully
2. `requiresChallenge()` returns `true` (always)
3. `issueChallenge()` generates a 6-digit PIN, stores it in the session cache (15-minute TTL), emails it to the user
4. User enters the PIN
5. `verifyChallenge()` checks the PIN against the stored value, deletes it on success

**Dependencies:**
- Core SMTP transporter for sending email
- Session plugin cache for storing PINs

### none

**Location:** `src/plugins-available/mfa/none/`
**Env var:** `MFA=none`

Pass-through MFA that never challenges. `requiresChallenge()` always returns `false`. Use when:
- MFA is not required for your deployment
- The provider already handles strong authentication (e.g., enterprise SSO)

---

## Extensions

No built-in extensions ship with BYOB-OIDC. The extension infrastructure is in place for user-contributed plugins. See [Writing a Plugin](./writing-a-plugin.md#example-5-extension-plugin) for examples.
