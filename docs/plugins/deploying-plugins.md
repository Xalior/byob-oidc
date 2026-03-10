# Deploying Plugins

How to install and configure plugins in a BYOB-OIDC deployment.

## Built-in Plugins (Source Tree)

Built-in plugins live inside the source tree under `src/plugins-available/`. To add one:

1. Place the plugin directory in the correct location:
   ```
   src/plugins-available/providers/my-provider/
   src/plugins-available/sessions/my-session/
   src/plugins-available/themes/my-theme/
   src/plugins-available/mfa/my-mfa/
   src/plugins-available/extensions/my-extension/
   ```

2. Set the corresponding env var:
   ```env
   PROVIDER=my-provider
   ```

3. Set any plugin-specific env vars the plugin requires (check the plugin's README).

4. Restart the server.

## External Plugins (Prebuilt Bundles)

External plugins are prebuilt JavaScript (ESM) bundles loaded from the `/data/plugins` directory. This is the recommended approach for user-created and third-party plugins.

### Directory Structure

```
/data/plugins/
  providers/
    example-csv/
      index.js          # Prebuilt ESM bundle (default export)
    my-ldap/
      index.js
      node_modules/     # Plugin's own dependencies (if any)
  sessions/
    my-custom-session/
      index.js
  themes/
    corporate/
      index.js
      assets/
        style.css
  mfa/
    example-captcha/
      index.js
  extensions/
    my-webhook/
      index.js
```

### Installing an External Plugin

1. Build the plugin (see [Writing a Plugin](./writing-a-plugin.md)):
   ```bash
   cd my-plugin
   npm install && npm run build
   ```

2. Copy the built bundle to the plugins directory:
   ```bash
   mkdir -p /data/plugins/providers/my-plugin
   cp dist/index.js /data/plugins/providers/my-plugin/
   ```

3. If the plugin has runtime dependencies not bundled into index.js, copy those too:
   ```bash
   cp -r node_modules /data/plugins/providers/my-plugin/
   ```

4. Set the env var:
   ```env
   PROVIDER=my-plugin
   ```

5. Restart the server.

### Plugin Resolution Order

When loading a plugin by name, the registry checks:

1. **External directory first** — `$PLUGIN_DIR/{type}/{name}/index.js`
2. **Built-in fallback** — `src/plugins-available/{type}/{name}/index.ts`

This means an external plugin with the same name as a built-in plugin will override it.

### PLUGIN_DIR Environment Variable

| Variable | Default | Description |
|----------|---------|-------------|
| `PLUGIN_DIR` | `/data/plugins` | Root directory for external plugin bundles |

Override this if your plugins live elsewhere:

```env
PLUGIN_DIR=/opt/byob-plugins
```

If the directory doesn't exist, the registry logs a message and skips external scanning.

## Theme Assets

Theme plugins have two directories to be aware of:

- **Source directory** (the plugin itself): `src/plugins-available/themes/{name}/` or `/data/plugins/themes/{name}/`
- **Static assets**: Wherever `assetsDir()` points. Built-in themes use `public/themes/{name}/`.

Your theme's `assetsDir()` must return a valid absolute path. The core mounts it at `/theme` in Express. If your theme uses SCSS, you'll need to compile it before deployment.

## Environment Variables

### Core (always required)

| Variable | Description | Default |
|---|---|---|
| `HOSTNAME` | Server hostname | _(required)_ |
| `SITE_NAME` | Display name | `OIDC Provider` |
| `MODE` | `dev` or `prod` | `dev` |
| `PORT` | Server port | `5000` |
| `SESSION_SECRET` | Express session secret | `session-secret` |
| `CLIENT_ID` | OIDC client ID | `SELF` |
| `CLIENT_SECRET` | OIDC client secret | `SELF_SECRET` |
| `SMTP_HOST` | SMTP relay hostname | _(required for email)_ |
| `SMTP_PORT` | SMTP relay port | `25` |
| `SMTP_SECURE` | Use TLS | `false` |
| `SMTP_USER` | SMTP auth user | _(optional)_ |
| `SMTP_PASS` | SMTP auth password | _(optional)_ |

### Plugin Selection

| Variable | Description | Default |
|---|---|---|
| `PROVIDER` | Active provider plugin name | `simple-sql` |
| `SESSION` | Active session plugin name | `redis` |
| `THEME` | Default theme name | `nbn24` |
| `MFA` | Comma-separated MFA plugin names | `otp` |
| `EXTENSIONS` | Comma-separated extension plugin names | _(empty)_ |
| `PLUGIN_DIR` | External plugin directory | `/data/plugins` |

### Plugin-Specific

Each plugin may require its own env vars. Check the plugin's documentation.

**simple-sql provider:**
| Variable | Default |
|---|---|
| `DATABASE_URL` | _(required)_ |
| `PASSWORD_SALT` | `11` |

**redis session:**
| Variable | Default |
|---|---|
| `CACHE_URL` | _(required)_ |

**example-csv provider:**
| Variable | Default |
|---|---|
| `CSV_USERS_FILE` | `/data/users.csv` |

**example-captcha MFA:**
| Variable | Default |
|---|---|
| `CAPTCHA_QUESTIONS_FILE` | _(built-in questions)_ |

## Docker

### External Plugins via Volume Mount

Mount your data directory containing prebuilt plugins:

```bash
docker run -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  -e PROVIDER=example-csv \
  -e MFA=example-captcha \
  -e CSV_USERS_FILE=/data/users.csv \
  byob-oidc
```

### Baking Plugins into the Image

For built-in source plugins, copy them during build:

```dockerfile
COPY my-provider/ /app/src/plugins-available/providers/my-provider/
```

For prebuilt external plugins, copy the bundle:

```dockerfile
COPY my-plugin/dist/index.js /data/plugins/providers/my-plugin/index.js
```

### docker-compose Example

```yaml
services:
  oidc:
    build: .
    ports:
      - "5000:5000"
    volumes:
      - ./data:/app/data
    environment:
      - HOSTNAME=id.example.com
      - PROVIDER=example-csv
      - SESSION=redis
      - MFA=example-captcha
      - CSV_USERS_FILE=/data/users.csv
      - CACHE_URL=redis://redis:6379/
      - SMTP_HOST=mailhog
  redis:
    image: redis:7-alpine
```

## Verifying Plugin Loading

On startup, the server logs each plugin as it loads:

```
External plugin directory: /data/plugins
Plugin loaded: session/redis v1.0.0 (built-in)
Plugin loaded: provider/example-csv v1.0.0 (external)
Plugin loaded: mfa/example-captcha v1.0.0 (external)
Plugin loaded: theme/nbn24 v1.0.0 (built-in)
```

If a plugin fails validation or initialization, you'll see a descriptive error:

```
Failed to load provider plugin "my-provider" from .../index.js: Cannot find module
Plugin "my-plugin" (provider) is missing required method: authenticate()
Plugin "my-plugin" (provider) failed during initialize(): CSV_USERS_FILE not found
```

## Troubleshooting

**Plugin not found:**
- Check the directory name matches what you set in the env var
- Check the directory is in the correct type folder (providers, sessions, themes, mfa, extensions)
- For external plugins: ensure `index.js` exists (not `index.ts` — external plugins must be prebuilt)
- For built-in: ensure `index.ts` with a default export exists

**Validation errors:**
- Ensure `meta.type` matches the directory type (e.g., `'provider'` for a plugin in `providers/`)
- Ensure all required methods are implemented (see [Interfaces](./interfaces.md))

**Initialization errors:**
- Check plugin-specific env vars are set
- Check external service connectivity (database, Redis, APIs)
- Look at the error message -- plugins should throw descriptive errors during `initialize()`

**External plugin can't access session/email:**
- External plugins receive `config.services` with `getSession()` and `transporter`
- Don't try to import from core source paths — use the injected services instead
- The session is only available after initialization, so access `config.services.getSession()` during operation, not during `initialize()`
