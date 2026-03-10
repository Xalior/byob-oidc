# Docker Setup for BYOB-OIDC

Instructions for building, running, and deploying BYOB-OIDC using Docker.

## Prerequisites

- Docker installed on your machine
- Docker Compose (optional, recommended)

## Building

The Docker image uses Node.js 22.14.0 as specified in `.nvmrc`.

```bash
# Using Docker Compose
docker-compose build

# Or directly
docker build -t byob-oidc .
```

## Running Locally

### Docker Compose

```bash
docker-compose up
```

### Docker

```bash
mkdir -p data
docker run -p 5000:5000 -v $(pwd)/data:/app/data byob-oidc
```

## Environment Variables

Pass environment variables to configure the application. See `_env_sample` for all available options.

Key variables for Docker deployment:

```bash
docker run -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  -e NODE_ENV=production \
  -e HOSTNAME=id.example.com \
  -e SESSION_SECRET=your-secure-secret \
  -e COOKIE_KEYS="key1,key2,key3" \
  -e PROVIDER=simple-sql \
  -e SESSION=redis \
  -e THEME=nbn24 \
  -e MFA=otp \
  -e DATABASE_URL=mysql://user:pass@host:3306/database \
  -e CACHE_URL=redis://host:6379/ \
  -e SMTP_HOST=smtp.example.com \
  -e CLIENT_ID=your_client_id \
  -e CLIENT_SECRET=your_client_secret \
  byob-oidc
```

Or in `docker-compose.yml`:

```yaml
environment:
  - NODE_ENV=production
  - HOSTNAME=id.example.com
  - PROVIDER=simple-sql
  - SESSION=redis
  - THEME=nbn24
  - MFA=otp
  - DATABASE_URL=mysql://user:pass@host:3306/database
  - CACHE_URL=redis://host:6379/
```

## Database Initialization

The Docker container automatically initializes the database on startup:
1. Generates database migrations if they don't exist
2. Pushes schema changes (creates/updates tables)
3. Runs any pending migrations

This ensures your database schema is always up-to-date, handling both fresh installations and upgrades.

## Data Volume

The `/data` directory is mounted as a Docker volume and contains:

```
/data/
  jwks.json          # JSON Web Key Set (generated with pnpm run generate-jwks)
  content/           # Content overrides (Mustache partials)
    about.mustache   # Custom about page (overrides built-in default)
    tos.mustache     # Custom terms of service (overrides built-in default)
  plugins/           # External plugin bundles
    providers/       # Provider plugins (e.g., example-csv/)
    sessions/        # Session plugins
    themes/          # Theme plugins
    mfa/             # MFA plugins (e.g., example-captcha/)
    extensions/      # Extension plugins
```

### Custom Content

Site-specific content pages (About, Terms of Service) can be customised by placing Mustache partial files in `/data/content/`. These override the generic defaults shipped with BYOB-OIDC.

```bash
# Override the about page with your own content
mkdir -p data/content
cat > data/content/about.mustache << 'EOF'
<h2>{{site_name}}</h2>
<p>Welcome to our identity service, powered by BYOB-OIDC.</p>
EOF
```

Files not present in `/data/content/` fall back to the built-in defaults in `content/`. The `{{site_name}}` Mustache variable is available in all partials.

### External Plugins

Place prebuilt plugin bundles in `/data/plugins/{type}/{name}/index.js`. The app scans this directory on startup.

```bash
# Example: install an external CSV provider and captcha MFA
mkdir -p data/plugins/providers/example-csv
mkdir -p data/plugins/mfa/example-captcha

cp my-csv-plugin/dist/index.js data/plugins/providers/example-csv/
cp my-captcha-plugin/dist/index.js data/plugins/mfa/example-captcha/
```

Then configure via environment variables:

```bash
docker run -p 5000:5000 \
  -v $(pwd)/data:/app/data \
  -e PROVIDER=example-csv \
  -e MFA=example-captcha \
  -e CSV_USERS_FILE=/data/users.csv \
  byob-oidc
```

The `PLUGIN_DIR` env var controls where external plugins are loaded from (default: `/data/plugins`). You can override it if your plugins live elsewhere.

See [External Plugin Development](plugins/deploying-plugins.md) for how to build your own plugins.

## Deployment Options

### Option 1: Build on Target Server

Copy project files to the target server and build there.

### Option 2: Docker Registry

```bash
docker tag byob-oidc your-registry.com/byob-oidc
docker push your-registry.com/byob-oidc

# On target server:
docker pull your-registry.com/byob-oidc
docker run -p 5000:5000 -v /path/to/data:/app/data your-registry.com/byob-oidc
```

### Option 3: Export/Import

```bash
docker save -o byob-oidc.tar byob-oidc
# Transfer to target server
docker load -i byob-oidc.tar
docker run -p 5000:5000 -v /path/to/data:/app/data byob-oidc
```

## Security

- Use secure passwords and connection strings
- Use Docker secrets or environment variables for sensitive values
- Secure the data volume on the host
- Use HTTPS for all external connections
