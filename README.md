# BYOB-OIDC (Bring Your Own Backend)

A plugin-based OpenID Connect (OIDC) Provider. Authenticate users, issue tokens, and extend functionality through a modular plugin architecture.

## Overview

BYOB-OIDC is a standards-compliant OpenID Connect identity provider built on [oidc-provider](https://github.com/panva/node-oidc-provider). Every major subsystem is a swappable plugin:

| Plugin Type | Loading Model | Purpose |
|---|---|---|
| **Provider** | Single active | Where users come from (SQL, LDAP, CSV, etc.) |
| **Session** | Single active | Runtime persistence (Redis, in-memory LRU) |
| **Theme** | Multiple loaded, one default | UI appearance (all available themes loaded at boot) |
| **MFA** | Multiple enabled | Multi-factor auth (users choose which to use) |
| **Extension** | Multiple active | Optional features (account linking, custom routes, gamification) |

The system ships with a working set of built-in plugins and is designed so that user-contributed plugins can be added in the future.

For a list of recent changes, see the [Changelog](docs/changelog.md).

## Quick Start

### Prerequisites

- Node.js 22.14+
- pnpm 10.7+

Additional dependencies depend on your plugin choices:
- **simple-sql** provider: MySQL/MariaDB database
- **redis** session: Redis server (the `lru` plugin requires no external dependencies but sessions are lost on restart)

### Installation

```bash
pnpm install
```

### Configuration

```bash
cp _env_sample .env
```

Edit `.env` — see [Environment Variables](#environment-variables) below.

### Generate JWKS

```bash
pnpm run generate-jwks
```

This creates cryptographic keys for signing OIDC tokens. Use `-f` to force overwrite existing keys.

### Start

```bash
pnpm start        # Production
pnpm dev           # Development with watch mode
```

## Plugin Architecture

### Directory Structure

```
src/
  plugins/
    registry.ts              # Plugin loader, validator, registry
    types.ts                 # Shared plugin interfaces
    theme/interface.ts       # ThemePlugin interface
    provider/interface.ts    # ProviderPlugin interface
    session/interface.ts     # SessionPlugin interface
    mfa/interface.ts         # MFAPlugin interface
    extension/interface.ts   # ExtensionPlugin interface
  plugins-available/
    themes/
      nbn24/                 # Clean, modern Bootstrap design
      robotic/               # Terminal/sci-fi green-on-black
      xalior/                # Retro-styled Bootstrap layout
    providers/
      simple-sql/            # MySQL + bcrypt authentication
    sessions/
      redis/                 # Redis-backed persistence
      lru/                   # In-memory LRU (dev/test only)
    mfa/
      otp/                   # Email one-time password
      none/                  # Pass-through (no MFA)
    extensions/
      # Future: discord/, patreon/, etc.
```

### Built-in Plugins

**Providers:**
- `simple-sql` — MySQL/MariaDB with bcrypt password hashing. Includes registration, profile management, password reset, and email confirmation routes.

**Sessions:**
- `redis` — Redis-backed OIDC adapter and express-session store. Production-ready.
- `lru` — In-memory Map with TTL eviction. No external dependencies, but sessions are lost on restart.

**Themes:**
- `nbn24` — Clean Bootstrap design with dark mode toggle (default)
- `xalior` — Retro-styled Bootstrap layout
- `robotic` — Terminal/sci-fi green-on-black theme

Themes can override individual Mustache layout templates. Missing templates fall back to defaults in `src/views/`. Shared content (TOS, About) lives in `content/` and is available to all themes via Mustache partials.

**MFA:**
- `otp` — Generates a 6-digit PIN, emails it to the user, and verifies it. Uses the session plugin's cache for storage.
- `none` — Pass-through, always succeeds. Use when MFA isn't required.

Multiple MFA plugins can be enabled simultaneously (`MFA=otp,none`). Users choose which to use.

**Extensions:**
- No built-in extensions yet. The plugin type supports custom routes, middleware, OIDC claims/scopes, and account linking.

## Environment Variables

### Core Settings

| Variable | Default | Description |
|---|---|---|
| `HOSTNAME` | *(required)* | Domain for the OIDC provider (e.g., `id.example.com`) |
| `SITE_NAME` | `OIDC Provider` | Display name used in emails, titles, and content |
| `PORT` | `5000` | HTTP listen port |
| `SESSION_SECRET` | `session-secret` | Secret for express-session encryption |
| `COOKIE_KEYS` | *(required)* | Comma-separated cookie encryption keys |

### Plugin Selection

| Variable | Default | Description |
|---|---|---|
| `PROVIDER` | `simple-sql` | Provider plugin to load |
| `SESSION` | `redis` | Session plugin to load |
| `THEME` | `nbn24` | Default theme (all available themes are loaded) |
| `MFA` | `otp` | Comma-separated list of MFA plugins to enable |
| `EXTENSIONS` | *(empty)* | Comma-separated list of extension plugins to enable |

### OIDC Client (Self-Discovery)

| Variable | Default | Description |
|---|---|---|
| `CLIENT_ID` | `SELF` | OIDC client ID (must match a record in the clients table) |
| `CLIENT_SECRET` | `SELF_SECRET` | OIDC client secret |

### SMTP (Core Service)

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | *(required)* | SMTP relay hostname |
| `SMTP_PORT` | `25` | SMTP port |
| `SMTP_SECURE` | `false` | Use SSL/TLS |
| `SMTP_USER` | *(optional)* | SMTP username |
| `SMTP_PASS` | *(optional)* | SMTP password |

### Provider: simple-sql

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(required)* | MySQL connection string |
| `PASSWORD_SALT` | `11` | bcrypt salt rounds |
| `CLIENT_FEATURES_REGISTRATION` | `true` | Enable user self-registration |

### Session: redis

| Variable | Default | Description |
|---|---|---|
| `CACHE_URL` | *(required)* | Redis connection string |

### Optional Integrations

| Variable | Description |
|---|---|
| `PATREON_CLIENT_ID` | Patreon OAuth client ID |
| `PATREON_CLIENT_SECRET` | Patreon OAuth client secret |

### Debug

| Variable | Default | Description |
|---|---|---|
| `DEBUG_ADAPTER` | `false` | Log session adapter operations |
| `DEBUG_ACCOUNT` | `false` | Log account lookups |

## Development

### Package Manager: pnpm

This project enforces pnpm. npm/yarn installations will fail.

```bash
npm install -g pnpm    # Install pnpm if needed
pnpm install           # Install dependencies
```

### Building Frontend Assets

```bash
pnpm run build:assets                    # Production build
npx webpack serve --mode development     # Dev server with hot reload
```

### Database Management

```bash
pnpm run db:generate      # Generate Drizzle migrations
pnpm run db:push          # Push schema changes
pnpm run db:run-migrations # Run pending migrations
pnpm run db:remake        # Reset and recreate database
```

### Running Tests

End-to-end tests use WebDriverIO with Safari.

```bash
pnpm run wdio                          # Run all tests
pnpm run wdio -- --suite auth          # Auth test suite
pnpm run wdio -- --suite registration  # Registration test suite
```

### TypeScript

TypeScript is executed directly via tsx (not transpiled). Type checking:

```bash
pnpm lint
```

## Docker

See [Docker Documentation](docs/docker.md) for build and deployment instructions.

```bash
docker-compose up                      # Quick start
docker build -t byob-oidc .           # Manual build
```

## Boot Sequence

1. Load app config (Zod env validation)
2. Initialize plugin registry
3. Load session plugin (single active)
4. Load provider plugin (single active)
5. Load MFA plugins (multiple active)
6. Load all available theme plugins (config sets default)
7. Load extension plugins (multiple active)
8. Build OIDC provider config
9. Create Express app with middleware
10. Register routes (core + provider + extensions)
11. Mount oidc-provider
12. Start server, self-discovery loop, Passport setup

## Architecture Notes

- **Config split**: `src/lib/config.ts` handles app config (Zod validation, no oidc-provider types). `src/lib/oidc-config.ts` builds the oidc-provider config object. Plugins never see oidc-provider types.
- **Provider design**: Providers are headless by default — they answer "does this user exist?" and "are these credentials valid?". Route-providing features (registration, profiles) are optional and provider-specific.
- **MFA independence**: MFA is not a provider concern. It's an independent verification layer between authentication and session creation.
- **Extension model**: Extensions are purely additive. They can register routes, middleware, OIDC claims, and scopes.
