# Upgrading from nbn-oidc-provider to BYOB-OIDC

This guide covers migrating an existing `nbn-oidc-provider` (v0.3.x) deployment to the plugin-based `byob-oidc` architecture.

## Overview of Changes

| Aspect | nbn-oidc-provider (old) | byob-oidc (new) |
|--------|------------------------|-----------------|
| Architecture | Monolithic (hardcoded auth, session, themes) | Plugin-based (provider, session, MFA, theme, extension) |
| Auth/Account | `src/models/account.ts` (hardcoded MySQL+bcrypt) | Provider plugin (`simple-sql`) |
| Session/Cache | Hardcoded Redis adapter (`src/database_adapter.ts`) | Session plugin (`redis` or `lru`) |
| MFA | Hardcoded email OTP in interaction routes | MFA plugin (`otp` or `none`) |
| Themes | `src/themes/{name}/` with direct imports | Theme plugins in `src/plugins-available/themes/{name}/` |
| Config | Flat env vars, monolithic `config.ts` | Plugin selection env vars + plugin-specific env vars |
| Data volume | `/app/data` (JWKS only) | `/data` (JWKS + external plugins directory) |
| Default port | 3000 | 5000 |
| Plugin loading | Legacy `src/lib/plugin.ts` (unused) | `src/plugins/registry.ts` with typed interfaces |

## Pre-Upgrade Checklist

- [ ] Back up the MySQL database
- [ ] Back up `data/jkws.json` (JWKS keys)
- [ ] Note all environment variables from your deployment config
- [ ] Record the current git commit hash
- [ ] Confirm no custom code modifications on the server

## Environment Variable Changes

### New required variables

Add these to your `.env` or `docker-compose.yml`:

```env
PROVIDER=simple-sql
SESSION=redis
MFA=otp
THEME=nbn24
# EXTENSIONS=  (optional, comma-separated list)
```

### Changed variables

| Old | New | Notes |
|-----|-----|-------|
| _(none)_ | `PROVIDER` | Was hardcoded, now configurable |
| _(none)_ | `SESSION` | Was hardcoded, now configurable |
| _(none)_ | `MFA` | Was hardcoded, now configurable |
| `THEME` | `THEME` | Unchanged, but theme directory moved |
| _(none)_ | `PLUGIN_DIR` | Optional, default `/data/plugins` |

Existing env vars (`HOSTNAME`, `DATABASE_URL`, `CACHE_URL`, `SMTP_HOST`, etc.) are unchanged.

## Docker Changes

### Volume mount

The data volume changed from `/app/data` to `/data`:

```yaml
volumes:
  - ./data:/data        # was ./data:/app/data
```

### External plugins

If using external plugins, place them in the plugins directory:

```
/data/plugins/
  providers/
  sessions/
  themes/
  mfa/
  extensions/
```

Set `PLUGIN_DIR=/data/plugins` (this is the default).

### Entrypoint

The new entrypoint (`docker-entrypoint.sh`) handles:
1. Generating Drizzle migrations
2. Pushing schema to database
3. Running custom migrations
4. Starting the application

No manual migration steps needed on container start.

## Database

The core schema (`src/db/schema.ts`) no longer contains user or confirmation_code tables — these are now owned by the `simple-sql` provider plugin. The plugin manages its own schema via Drizzle.

Existing data is compatible — the tables are the same, just owned by the plugin now.

## Step-by-Step Migration

1. **Stop the running container**

2. **Update the image** (pull new version or rebuild)

3. **Update volume mount** from `/app/data` to `/data`

4. **Add plugin env vars** to your compose file:
   ```env
   PROVIDER=simple-sql
   SESSION=redis
   MFA=otp
   THEME=nbn24
   ```

5. **Rename the key set** in your data volume. The old name was a
   misspelling:
   ```bash
   mv data/jkws.json data/jwks.json
   ```

6. **Start the container** — the entrypoint will handle schema migration automatically

7. **Verify** — check logs for successful plugin loading:
   ```
   Plugin loaded: session/redis v1.0.0 (built-in)
   Plugin loaded: provider/simple-sql v1.0.0 (built-in)
   Plugin loaded: mfa/otp v1.0.0 (built-in)
   Plugin loaded: theme/nbn24 v1.0.0 (built-in)
   ```

8. **Test login flow** — confirm authentication, MFA, and theme rendering work

## Rollback

If something goes wrong:
1. Stop the new container
2. Revert the volume mount to `/app/data`
3. Rename `data/jwks.json` back to `data/jkws.json`
4. Remove the plugin env vars
5. Restart with the old image

The database schema is backwards-compatible — no destructive changes are made.
