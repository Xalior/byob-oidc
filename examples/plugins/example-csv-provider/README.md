# Example CSV Provider Plugin

A BYOB-OIDC provider plugin that authenticates users against a CSV flat file with bcrypt-hashed passwords. This is a read-only provider with no user registration or management routes.

## CSV Format

The CSV file must have a header row with these columns:

```csv
id,email,password_hash,name
1,alice@example.com,$2b$11$...,Alice Smith
2,bob@example.com,$2b$11$...,Bob Jones
```

All passwords in `users.example.csv` are `password`.

## Generating Password Hashes

```bash
node -e "import('bcryptjs').then(b => b.default.hash('mypassword', 11).then(console.log))"
```

## Building

```bash
cd examples/plugins/example-csv-provider
npm install
npm run build
```

This outputs `dist/index.js` — the prebuilt ESM bundle.

## Installing

Copy the built plugin into your BYOB-OIDC data directory:

```bash
mkdir -p /data/plugins/providers/example-csv
cp dist/index.js /data/plugins/providers/example-csv/
cp node_modules/bcryptjs /data/plugins/providers/example-csv/node_modules/bcryptjs  # or bundle it
```

Or with Docker:

```bash
# Mount your plugins directory
docker run -v ./my-plugins:/data/plugins -v ./users.csv:/data/users.csv \
  -e PROVIDER=example-csv \
  -e CSV_USERS_FILE=/data/users.csv \
  byob-oidc
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CSV_USERS_FILE` | `/data/users.csv` | Path to the CSV users file |

## Features

- Bcrypt password verification
- Auto-reloads CSV on file changes (5-second polling)
- Supports `email` and `profile` OIDC scopes
- Read-only — no registration, profile editing, or password reset routes
