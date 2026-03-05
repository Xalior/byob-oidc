# BYOB-OIDC Plugin System

BYOB-OIDC is a plugin-based OIDC (OpenID Connect) identity server. All user-facing functionality is delivered through plugins: how users authenticate, how sessions are stored, how pages look, how multi-factor auth works, and what extra features are available.

This document is the entry point for understanding, using, and writing plugins.

## Contents

| Document | Description |
|---|---|
| [Architecture Overview](./architecture.md) | How the plugin system works: lifecycle, registry, discovery, configuration |
| [Writing a Plugin](./writing-a-plugin.md) | Step-by-step guide to creating your own plugin |
| [Plugin Interfaces](./interfaces.md) | Complete API reference for all five plugin types |
| [Built-in Plugins](./built-in-plugins.md) | Documentation of the plugins that ship with BYOB-OIDC |
| [Deploying Plugins](./deploying-plugins.md) | How to install and configure third-party plugins |
| [PLAN: External Plugin Loading](./PLAN-external-plugin-loading.md) | Plan for features not yet implemented (prebuilt bundle support) |

## Quick Start

BYOB-OIDC ships with working defaults. Out of the box:

| Plugin Type | Default | Alternatives |
|---|---|---|
| **Provider** | `simple-sql` (MySQL + bcrypt) | Write your own |
| **Session** | `redis` (Redis JSON) | `lru` (in-memory, dev only) |
| **Theme** | `nbn24` (Bootstrap 5) | `robotic`, `xalior` |
| **MFA** | `otp` (email PIN) | `none` (disabled) |
| **Extensions** | _(none)_ | Write your own |

Select plugins via environment variables:

```env
PROVIDER=simple-sql
SESSION=redis
THEME=nbn24
MFA=otp
EXTENSIONS=
```

## Plugin Types at a Glance

### Provider (single active)
Where users come from. Handles authentication, account lookup, and OIDC claims. Optionally registers its own routes (registration, profile, password reset, etc.). A provider can be a SQL database, an LDAP directory, a CSV file, or an external SSO system.

### Session (single active)
How runtime data is persisted. Provides the OIDC adapter (tokens, grants, interactions) and an optional express-session store. Also provides a simple key-value cache used by other plugins (e.g., MFA codes).

### Theme (multiple loaded, one default)
How pages look. Renders page wrappers, error pages, logout screens. Can override Mustache templates and serve its own static assets (CSS, images, fonts). All available themes are discovered and loaded; the `THEME` env var sets which one is the default.

### MFA (multiple active)
Multi-factor authentication. Sits between provider authentication and session creation. Each MFA plugin decides if it needs to challenge the user, issues the challenge, and verifies the response. Multiple can be enabled simultaneously via comma-separated `MFA=otp,sms`.

### Extension (multiple active)
Optional features bolted onto the server. Can add routes, middleware, OIDC claims, and scopes. Examples: Discord account linking, Patreon membership checks, custom games. Enabled via comma-separated `EXTENSIONS=discord,patreon`.
