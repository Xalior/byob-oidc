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

In-memory session storage for development and testing. **Not suitable for production** -- all data is lost on restart.

**Files:**
```
lru/
  index.ts           # Plugin entry point
  adapter.ts         # In-memory Map-based OIDC adapter
```

**Required env vars:** None.

**Key features:**
- Pure in-memory using `Map` with TTL-based expiry
- Periodic cleanup every 30 seconds
- Zero external dependencies
- No express-session store (uses default MemoryStore)
- Identical interface to Redis plugin

---

## Themes

All three themes ship with BYOB-OIDC. All available themes are auto-discovered and loaded; the `THEME` env var sets the default.

### nbn24

**Location:** `src/plugins-available/themes/nbn24/`
**Env var:** `THEME=nbn24` (default)

Clean Bootstrap 5 theme with light/dark mode support. Uses the core default Mustache templates (`layoutsDir()` returns `null`).

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
