# Upgrading from nbn-oidc-provider to BYOB-OIDC

This guide covers migrating an existing `nbn-oidc-provider` (v0.3.x) deployment to the plugin-based `byob-oidc` architecture.

## Overview of Changes

| Aspect | nbn-oidc-provider (old) | byob-oidc (new) |
|--------|------------------------|-----------------|
| Package name | `nbn-oidc-provider` | `nbn-oidc-provider` (same) |
| Architecture | Monolithic (hardcoded auth, session, themes) | Plugin-based (provider, session, MFA, theme, extension) |
| Auth/Account | `src/models/account.ts` (hardcoded MySQL+bcrypt) | Provider plugin (`simple-sql`) |
| Session/Cache | Hardcoded Redis adapter (`src/database_adapter.ts`) | Session plugin (`redis` or `lru`) |
| MFA | Hardcoded email OTP in interaction routes | MFA plugin (`otp` or `none`) |
| Themes | `src/themes/{name}/` with direct imports | Theme plugins in `src/plugins-available/themes/{name}/` |
| Config | Flat env vars, monolithic `config.ts` | Plugin selection env vars + plugin-specific env vars |
| Data volume | `/app/data` (JWKS only) | `/data` (JWKS + external plugins directory) |
| Default port | 3000 | 5000 |
| Plugin loading | Legacy Discord-based `src/lib/plugin.ts` (unused) | `src/plugins/registry.ts` with typed interfaces |
| Git repo | `Xalior/nbn-oidc-provider` | `Xalior/byob-oidc` (new repo) |

## Pre-Upgrade Checklist

- [ ] Back up the MySQL database (`nbnid_prod`)
- [ ] Back up `data/jkws.json` (JWKS keys)
- [ ] Note all environment variables from `docker-compose.yml`
- [ ] Record the current git commit: `70d884d` (main branch)
- [ ] Confirm no custom code modifications on the server

## Current angela.xalior.com Setup

```
Path:       /home/docker/nbn-oidc-provider
Git remote: git@github.com:Xalior/nbn-oidc-provider.git
Branch:     main (commit 70d884d)
Container:  nbn-oidc-provider-nbn-oidc-provider-1 (Up, port 127.0.0.1:3000)
Data:       ./data mounted at /app/data (contains jkws.json, testdata.js)
Database:   mysql://nbnid:***@100.64.0.5:3306/nbnid_prod
Cache:      redis://100.64.0.5:6379/0
SMTP:       clientmail.xalior.com:25 (no TLS, no auth)
```

## Step-by-Step Upgrade

### 1. Prepare the New Codebase

```bash
# On angela.xalior.com
cd /home/docker

# Clone the new repo alongside the old one
git clone git@github.com:Xalior/byob-oidc.git byob-oidc

# Copy JWKS keys from old deployment
mkdir -p byob-oidc/data
cp nbn-oidc-provider/data/jkws.json byob-oidc/data/jkws.json
```

> **Important:** The JWKS keys must be preserved. If they change, all existing OIDC sessions and tokens will be invalidated.

### 2. Create docker-compose.yml

Create `/home/docker/byob-oidc/docker-compose.yml`:

```yaml
services:
  byob-oidc:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "127.0.0.1:3000:5000"
    volumes:
      - ./data:/data
    environment:
      # --- Core ---
      - SITE_NAME=NBN:ID
      - NODE_ENV=production
      - HOSTNAME=id.nextbestnetwork.com
      - PORT=5000

      # --- Plugin Selection ---
      - PROVIDER=simple-sql
      - SESSION=redis
      - THEME=nbn24
      - MFA=otp

      # --- OIDC Client (self-discovery) ---
      # Set these to match a record in your clients table
      - CLIENT_ID=OWN_CLIENT_ID
      - CLIENT_SECRET=OWN_CLIENT_SECRET

      # --- Session/Cookie Secrets ---
      - SESSION_SECRET=<generate-a-new-secret>
      - COOKIE_KEYS=some secret key,and also the old rotated away some time ago,and one more

      # --- Provider: simple-sql ---
      - DATABASE_URL=mysql://nbnid:eZWrAdb18.S7kEJU3@100.64.0.5:3306/nbnid_prod
      - PASSWORD_SALT=13
      - CLIENT_FEATURES_REGISTRATION=true

      # --- Session: redis ---
      - CACHE_URL=redis://100.64.0.5:6379/0

      # --- SMTP ---
      - SMTP_HOST=clientmail.xalior.com
      - SMTP_PORT=25
      - SMTP_SECURE=false

      # --- Optional Integrations ---
      - PATERON_CLIENT_ID=3JutWk4NZaPG3QU39Ya8ZKLVGrar12P-Slel8-m1SiFS2XYePTzBs9J3Q4357qQD
      - PATREON_CLIENT_SECRET=eUZZKFsQwOg2fr1jg4uUrX17LGPk5IdFeo93eDbeAmiBzaTqCNvPe_dDjdukno_o

      # --- Debug ---
      - VERBOSE=false
      - DEBUG_ADAPTER=false
      - DEBUG_ACCOUNT=false
    restart: unless-stopped
```

> **Note:** The new default port is 5000 (not 3000). The port mapping `127.0.0.1:3000:5000` preserves the external-facing port so your reverse proxy config doesn't change.

### 3. Environment Variable Mapping

| Old Variable | New Variable | Notes |
|-------------|-------------|-------|
| `HOSTNAME` | `HOSTNAME` | Unchanged |
| `SITE_NAME` | `SITE_NAME` | Unchanged |
| `NODE_ENV` | `NODE_ENV` | Unchanged |
| `PORT` (was 3000) | `PORT` (now 5000) | Default changed; set explicitly or adjust port mapping |
| `DATABASE_URL` | `DATABASE_URL` | Unchanged (consumed by `simple-sql` provider) |
| `CACHE_URL` | `CACHE_URL` | Unchanged (consumed by `redis` session plugin) |
| `PASSWORD_SALT` | `PASSWORD_SALT` | Unchanged |
| `CLIENT_FEATURES_REGISTRATION` | `CLIENT_FEATURES_REGISTRATION` | Unchanged |
| `SMTP_HOST/PORT/SECURE` | `SMTP_HOST/PORT/SECURE` | Unchanged |
| `PATREON_CLIENT_ID` | `PATREON_CLIENT_ID` | Unchanged |
| `PATREON_CLIENT_SECRET` | `PATREON_CLIENT_SECRET` | Unchanged |
| `VERBOSE` | `VERBOSE` | Unchanged |
| `DEBUG_ADAPTER` | `DEBUG_ADAPTER` | Unchanged |
| `DEBUG_ACCOUNT` | `DEBUG_ACCOUNT` | Unchanged |
| _(not present)_ | `PROVIDER=simple-sql` | **New** — selects auth provider plugin |
| _(not present)_ | `SESSION=redis` | **New** — selects session plugin |
| _(not present)_ | `MFA=otp` | **New** — selects MFA plugin |
| _(not present)_ | `THEME=nbn24` | **New** — selects default theme (was hardcoded) |
| _(not present)_ | `CLIENT_ID` | **New** — OIDC self-discovery client ID |
| _(not present)_ | `CLIENT_SECRET` | **New** — OIDC self-discovery client secret |
| _(not present)_ | `SESSION_SECRET` | **New** — express-session secret |
| _(not present)_ | `COOKIE_KEYS` | **New** — OIDC cookie signing keys |

### 4. Volume Changes

The data volume mount point changes:

The volume mount path stays the same: `./data:/app/data`.

The `data/` directory in BYOB-OIDC contains:
```
data/
  jkws.json              # JWKS keys (migrated from old setup)
  content/               # Site-specific content overrides (new)
    about.mustache       # Custom about page
  plugins/               # External plugin bundles (new, auto-created)
    providers/
    sessions/
    themes/
    mfa/
    extensions/
```

### 5. Database Compatibility

The database schema is **compatible**. BYOB-OIDC uses the same Drizzle ORM schema with the same tables:
- `users` — identical columns
- `confirmation_codes` — identical columns
- `clients` — identical columns

The `docker-entrypoint.sh` runs `db:push --force` on startup, which will reconcile any minor differences non-destructively.

> **Important:** The Redis cache adapter also remains compatible. Existing Redis data (OIDC sessions, grants) will continue to work.

### 6. Perform the Switch

```bash
# Stop the old container
cd /home/docker/nbn-oidc-provider
docker compose down

# Start the new container
cd /home/docker/byob-oidc
docker compose up -d

# Watch logs for startup
docker compose logs -f
```

**Verify startup completes:**
- Database migrations run successfully
- "Starting the application..." message appears
- Self-discovery loop completes (up to 30 retries is normal)
- No plugin loading errors

### 7. Verify

```bash
# Check container is running
docker compose ps

# Test OIDC discovery endpoint
curl -s https://id.nextbestnetwork.com/.well-known/openid-configuration | head -20

# Test login page loads
curl -s -o /dev/null -w "%{http_code}" https://id.nextbestnetwork.com/login
```

### 8. Rollback Plan

If something goes wrong:

```bash
# Stop the new container
cd /home/docker/byob-oidc
docker compose down

# Restart the old one
cd /home/docker/nbn-oidc-provider
docker compose up -d
```

The database is shared and forward-compatible, so rollback is safe.

## Breaking Changes to Watch For

1. **Theme rendering** — Theme plugins now use a standardized interface (`meta`, `page()`, `logout()`, `loggedout()`, `error()`). The built-in themes (nbn24, robotic, xalior) are all ported, but if you had customized theme files directly, those changes won't carry over.

2. **Plugin.ts removal** — The old `src/lib/plugin.ts` (Discord-based plugin system) is completely gone. It was largely unused in the OIDC context.

3. **Session secret** — The old system used a hardcoded fallback (`'session-secret'`). The new system requires `SESSION_SECRET` to be set explicitly. Generate a proper secret.

4. **COOKIE_KEYS** — Previously hardcoded in `config.ts`. Now read from the `COOKIE_KEYS` env var. Use the same values to preserve existing sessions.

5. **Content pages** — The old `content/about.mustache` and `content/tos.mustache` may need to be placed in the appropriate theme or views directory. Check if your deployment relies on these.

## Post-Upgrade Cleanup

Once the upgrade is confirmed stable:

```bash
# Remove old deployment (optional, keep as backup for a while)
# cd /home/docker && mv nbn-oidc-provider nbn-oidc-provider.bak

# Update any CI/CD or deployment scripts to reference byob-oidc
# Update DNS/reverse proxy if the hostname or port changed
```
