# Changelog

## Unreleased

## Release v0.3.1

### Bug Fixes
- Fix stale flash messages persisting after successful login — flash errors from prior failed attempts (bad CSRF, wrong password, etc.) are now cleared on successful callback

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
