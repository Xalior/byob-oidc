# Changelog

## Unreleased

### Added
- New `stdio-auth` provider. It authenticates against a command you supply, writing a JSON request to that command's standard input and reading a JSON reply from its standard output. Accounts can then live wherever you keep them: a file, a directory server, or the host operating system. Passwords travel on standard input only, never in the command line or the environment. See [The stdio-auth provider](plugins/stdio-auth.md) for the contract a command must follow.
- The theme documentation now states which values a template must honour, and what breaks when it does not. Core gained those values without recording what it expected of a theme, so a theme could look correct and still show a field nobody can fill in.
- The login page, the navigation bar and the home page linked to `/register`, `/lost_password` and `/profile` whatever provider was running. Only `simple-sql` serves those routes, so under any other provider each link was a 404, and the password reset link had no setting to turn it off at all. Providers now declare what they serve through an optional `capabilities`, and every page hides a link it cannot honour. `CLIENT_FEATURES_REGISTRATION` still applies on top.
- Providers can say what the login form should ask for, through an optional `loginField`. The form asked for an email address in a field the browser validates, so a provider that identifies people by anything else could not be used at all: the browser refused to submit a name with no `@` in it. Providers that say nothing still get the email field, so `simple-sql` is unchanged. `stdio-auth` asks for a username, and `STDIO_AUTH_LOGIN_LABEL` changes the wording.
- `BIND_ADDRESS` sets the interface the server listens on, and defaults to `0.0.0.0`, which is what it did before. Set one address when a reverse proxy provides TLS and ingress, so the server is not reachable on the machine's other interfaces.
- New `d3code` theme, which carries the appearance of the D3-code desktop application into the sign-in pages. It has a light scheme and a dark one, both first class: rose buttons on warm pink paper in light, violet and pink on deep indigo in dark. The picker in the corner of every page switches between them, or follows the operating system. The palette comes from the plandrop D3-code theme, vendored unchanged and licensed under the LGPL-3.0-only.
- Two worked backends under `examples/backends/`. The file backend keeps accounts in a JSON file with scrypt hashed passwords, and runs anywhere Node runs. The PAM backend authenticates against the accounts of the Linux machine the server runs on, and keeps the privilege needed to read shadow passwords in one small setuid helper instead of in the identity provider itself.

### Changed
- The `lru` session plugin now uses the `lru-cache` package. It was an unbounded `Map` swept every 30 seconds, so it could grow until the process ran out of memory. `SESSION_LRU_MAX` now sets how many entries it holds, default 10000. Eviction can end a session that has not expired, so keep that limit above the number of live sessions.

### Fixed
- The server could not start. It read `data/jkws.json`, a misspelling of the name that `generate-jwks` writes. It now reads `data/jwks.json`. Existing deployments must rename the file in their data volume, see the [upgrade guide](upgrade-from-nbn-oidc.md).
- Docker images held the private keys. `COPY . .` copied the `keys/` directory, which holds the PEM files and the generated key set. `keys/` is now in `.dockerignore`.
- The setup instructions had no step to copy the generated key set from `keys/` into `data/`, so a new install failed to start.

## Release v0.4.1

### Added
- Sign-up link on OIDC login page for new user registration flow

### Changed
- Default theme mode changed from dark to auto (respects OS preference)
- Plugin registry: graceful handling of missing optional plugins (MFA, themes, extensions warn and skip instead of crashing)

### Fixed
- Theme mode picker not functioning (Bootstrap JS was tree-shaken out of production builds)

## Release v0.4.0 — BYOB-OIDC

**Project renamed** from NBN OIDC Provider to BYOB-OIDC (Bring Your Own Backend).

### Breaking Changes
- **Plugin Architecture**: The entire application has been restructured around a plugin system with five plugin types: Provider, Session, Theme, MFA, and Extension. See [MIGRATION_PLAN.md](/MIGRATION_PLAN.md) for the full plan.
- **New Environment Variables**: `PROVIDER`, `SESSION`, `MFA`, and `EXTENSIONS` are new plugin selector env vars. Existing deployments should add these to `.env` (defaults match previous behavior: `PROVIDER=simple-sql`, `SESSION=redis`, `MFA=otp`).
- **Config Split**: `config.ts` is now app-only config (no oidc-provider types). OIDC-specific config moved to `oidc-config.ts`.
- **Directory Structure**: Source files moved under `src/plugins-available/` — themes, providers, sessions, and MFA plugins each live in their own directory.

### Major Changes
- **Plugin Registry**: New plugin loading system with discovery, validation, lifecycle management, and multi-active support. Registry supports single-active (provider, session) and multi-active (theme, mfa, extension) plugins.
- **Provider Plugin**: User authentication extracted into a swappable provider plugin. `simple-sql` (MySQL + bcrypt) is the built-in provider. Providers own their routes (registration, profile, password reset, etc.).
- **Session Plugin**: OIDC adapter and express-session store extracted into session plugins. `redis` (production) and `lru` (dev/test) are built-in.
- **MFA Plugin**: Multi-factor auth extracted from interaction routes into MFA plugins. `otp` (email PIN) and `none` (pass-through) are built-in. Multiple MFA plugins can be enabled simultaneously.
- **Extension Plugin Type**: New plugin type for optional features — account linking, custom routes, middleware, OIDC claims/scopes. No built-in extensions yet.
- **Config Split**: App config (`config.ts`) separated from OIDC provider config (`oidc-config.ts`). Plugins never see oidc-provider types.
- **Boot Sequence Rewrite**: `server.ts` rewritten to load plugins via registry, then wire them into Express and oidc-provider.

### Removed
- `src/lib/plugin.ts` (dead Discord bot code)
- `src/database_adapter.ts` (replaced by session plugins)
- Users/confirmation_codes tables from core schema (moved to simple-sql provider)
- Provider-specific email functions from core `email.ts` (moved to plugins)

### Minor Changes
- `_env_sample` updated with plugin selection variables and organized sections
- Webpack config updated for new theme paths under `plugins-available/themes/`
- Test suite updated for new import paths
- `initializeDb()` made idempotent for test compatibility

## Release v0.3.1

### Bug Fixes
- Clear stale flash messages on successful login

## Release v0.3.0

### Breaking Changes
- **Environment Variables**: `SITE_NAME` and `THEME` are new environment variables. Existing deployments must update their `.env` files (see `_env_sample`). `SITE_NAME` defaults to `OIDC Provider` and `THEME` defaults to `nbn24` if not set.
- **oidc-provider 8.x to 9.x**: Major library upgrade. Most installations won't need any changes unless you've customised the database adapter.

### Major Changes
- **Theme System**: Full multi-theme support with three bundled themes (nbn24, xalior, robotic)
  - Themes can override individual layouts or fall back to defaults
  - Theme selection via `THEME` environment variable
  - Each theme includes its own static assets, layout templates, and styling
- **Configurable Site Name**: Replaced all hard-coded brand references with a `SITE_NAME` environment variable
  - Site name is available in all templates via `{{site_name}}`
  - Emails, page titles, and content all respect the configured name
- **Shared Content Partials**: Extracted TOS and About page content into reusable `content/` partials
  - `{{> tos}}` and `{{> about}}` partials shared across all themes
  - Content uses `{{site_name}}` for brand-agnostic text
- **oidc-client upgrade**: Updated to latest OpenID client library

### Bug Fixes
- Fix body parser warning from oidc-provider by scoping urlencoded middleware to app routes only
- Fix robotic theme: theme-aware views, light mode support, green scrollbar styling
- Replace hard-coded startup timeout with discovery retry loop for reliable self-discovery
- Fix a bug that stopped new grants being created for fresh apps on the closed circuit network
- Handle a bug that could have exposed the wrong template variables

### Minor Changes
- robots.txt now tells search engines to go away
- Security dependency bumps
- Updated About page content
- Updated Terms of Service to use configurable site name

## Release v0.2.2
- SMTP_SECURE, DEBUG_ADAPTER, DEBUG_ACCOUNT all now optional env, default false

### Minor changes
- Full type coverage enforced during linting

## Release v0.2.1

### Minor changes
- Full type coverage enforced during linting

## Release v0.2.0

### Major Changes
- **TypeScript Migration**: The project has been fully migrated to TypeScript with complete type coverage at the point of linting
  - TypeScript is executed directly, not transpiled
  - All source files have been converted to .ts format

- **Configuration System**: Moved from file-based configuration to environment variables
  - Removed `/data/config.js` in favor of environment variables
  - See `_env_sample` file for all available configuration options
  - Environment variables provide better security and deployment flexibility

- **Data Directory Purpose**: The `/data` directory is now used for:
  - Page formatter (page.ts) - Customize the HTML structure of pages
  - JSON Web Key Set (jkws.json) - Generated with our new tool

### Documentation Updates
- Moved Docker documentation to the docs folder
- Updated README with current project structure and setup instructions
- Added this changelog to track project evolution

## Release v0.1.3
- **Testing Framework**: Implemented comprehensive testing with WebDriver.IO
  - End-to-end testing for authentication flows
  - Test suites for login, registration, and error scenarios
  - Mocha test framework integration
