# Deploying Plugins

How to install and configure plugins in a BYOB-OIDC deployment.

## Source Plugins (Current Method)

Currently, plugins live inside the source tree under `src/plugins-available/`. To add a plugin:

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

## Theme Assets

Theme plugins have two directories to be aware of:

- **Source directory** (the plugin itself): `src/plugins-available/themes/{name}/`
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

## Docker

In Docker, plugins are baked into the image at build time. Mount plugin directories as volumes or copy them in during the Docker build:

```dockerfile
# Copy a custom plugin into the image
COPY my-provider/ /app/src/plugins-available/providers/my-provider/
```

Or via docker-compose volume mounts:

```yaml
volumes:
  - ./my-plugins/my-provider:/app/src/plugins-available/providers/my-provider
```

Set plugin env vars in your docker-compose.yml or docker run command:

```yaml
environment:
  - PROVIDER=my-provider
  - MY_PROVIDER_API_KEY=secret
```

## Verifying Plugin Loading

On startup, the server logs each plugin as it loads:

```
Plugin loaded: session/redis v1.0.0
Plugin loaded: provider/simple-sql v1.0.0
Plugin loaded: mfa/otp v1.0.0
Plugin loaded: theme/nbn24 v1.0.0
Plugin loaded: theme/robotic v1.0.0
Plugin loaded: theme/xalior v1.0.0
```

If a plugin fails validation or initialization, you'll see a descriptive error:

```
Failed to load provider plugin "my-provider" from .../index.ts: Cannot find module
Plugin "my-plugin" (provider) is missing required method: authenticate()
Plugin "my-plugin" (provider) failed during initialize(): DATABASE_URL is required
```

## Troubleshooting

**Plugin not found:**
- Check the directory name matches what you set in the env var
- Check the directory is in the correct type folder (providers, sessions, themes, mfa, extensions)
- Check there's an `index.ts` (or `index.js`) with a default export

**Validation errors:**
- Ensure `meta.type` matches the directory type (e.g., `'provider'` for a plugin in `providers/`)
- Ensure all required methods are implemented (see [Interfaces](./interfaces.md))

**Initialization errors:**
- Check plugin-specific env vars are set
- Check external service connectivity (database, Redis, APIs)
- Look at the error message -- plugins should throw descriptive errors during `initialize()`
