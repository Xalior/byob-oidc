# Writing a Plugin

This guide walks through creating a BYOB-OIDC plugin from scratch. We'll cover the structure, the interface contract, how to test it, and how to ship it.

## Plugin Structure

Every plugin is a directory with an `index.ts` (or `index.js` for prebuilt bundles) that has a **default export** implementing the appropriate interface.

Minimal structure:

```
my-plugin/
  index.ts          # Default export: the plugin object
```

Real-world structure (a provider plugin, for example):

```
my-ldap-provider/
  index.ts          # Plugin entry point (default export)
  connection.ts     # LDAP connection management
  search.ts         # User search logic
  README.md         # Plugin documentation
```

## The Minimum Viable Plugin

Here's the simplest possible plugin -- an MFA plugin that does nothing:

```typescript
import type { MFAPlugin } from '../../../plugins/mfa/interface.ts';
import type { OIDCAccount } from '../../../plugins/provider/interface.ts';
import type { PluginConfig } from '../../../plugins/types.ts';
import type { Request } from 'express';

const plugin: MFAPlugin = {
    meta: {
        name: 'my-mfa',
        version: '1.0.0',
        type: 'mfa',
        description: 'My custom MFA plugin',
    },

    async initialize(config: PluginConfig) {
        // Set up connections, read env vars, etc.
    },

    async requiresChallenge(account: OIDCAccount): Promise<boolean> {
        return false;
    },

    async issueChallenge(account: OIDCAccount, req: Request): Promise<string> {
        throw new Error('Not implemented');
    },

    async verifyChallenge(challengeId: string, req: Request): Promise<boolean> {
        throw new Error('Not implemented');
    },
};

export default plugin;
```

Key rules:
1. **Default export** -- the plugin object must be the default export
2. **`meta.type` must match** -- if you're in `plugins-available/mfa/`, `meta.type` must be `'mfa'`
3. **`meta.name` must be unique** within its type
4. **All required methods** for the type must be present (see [Interfaces](./interfaces.md))

## Step-by-Step Examples

### Example 1: Theme Plugin

A theme controls how pages are rendered. At minimum, you need to wrap HTML content and point to an assets directory.

```typescript
// plugins-available/themes/my-theme/index.ts
import type { ThemePlugin } from '../../../plugins/theme/interface.ts';
import type { PluginConfig } from '../../../plugins/types.ts';
import { fileURLToPath } from 'node:url';
import * as path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const plugin: ThemePlugin = {
    meta: { name: 'my-theme', version: '1.0.0', type: 'theme' },
    site_name: '',

    async initialize(config: PluginConfig) {
        this.site_name = config.site_name;
    },

    page(html: string): string {
        return `<!DOCTYPE html>
<html>
<head>
    <title>${this.site_name}</title>
    <link rel="stylesheet" href="/theme/style.css">
</head>
<body>
    <header><h1>${this.site_name}</h1></header>
    <main>${html}</main>
</body>
</html>`;
    },

    logout(form: string, hostname: string): string {
        return this.page(`<h2>Log out of ${hostname}?</h2>${form}`);
    },

    loggedout(display: string): string {
        return this.page(`<h2>Logged Out</h2><p>${display}</p>`);
    },

    error(html: string): string {
        return this.page(`<div class="error">${html}</div>`);
    },

    layoutsDir(): string | null {
        // Return a path to override Mustache templates, or null for defaults
        return null;
    },

    assetsDir(): string {
        // Point to your static files (CSS, images, etc.)
        return path.resolve(__dirname, 'assets');
    },
};

export default plugin;
```

Create your assets alongside:

```
my-theme/
  index.ts
  assets/
    style.css
    logo.png
```

**Activate it:** Set `THEME=my-theme` in your environment.

### Example 2: Provider Plugin

A provider handles user authentication and account lookup. This example shows a simple JSON-file-based provider.

```typescript
// plugins-available/providers/json-file/index.ts
import type { ProviderPlugin, OIDCAccount } from '../../../plugins/provider/interface.ts';
import type { PluginConfig } from '../../../plugins/types.ts';
import type { Request } from 'express';
import { readFileSync } from 'node:fs';

interface User {
    id: string;
    email: string;
    password: string;  // plain text for demo only!
    name: string;
}

let users: User[] = [];

function findUser(email: string): User | undefined {
    return users.find(u => u.email === email);
}

function wrapUser(user: User): OIDCAccount {
    return {
        accountId: user.id,
        async claims(use: string, scope: string) {
            return {
                sub: user.id,
                email: user.email,
                name: user.name,
            };
        },
    };
}

const plugin: ProviderPlugin = {
    meta: { name: 'json-file', version: '1.0.0', type: 'provider' },

    async initialize(config: PluginConfig) {
        const filePath = process.env.USERS_FILE || './users.json';
        users = JSON.parse(readFileSync(filePath, 'utf-8'));
        console.log(`json-file provider: loaded ${users.length} users from ${filePath}`);
    },

    async authenticate(req: Request): Promise<OIDCAccount | null> {
        const { login, password } = req.body;
        const user = findUser(login);
        if (!user || user.password !== password) {
            req.flash('error', 'Invalid credentials');
            return null;
        }
        return wrapUser(user);
    },

    async findAccount(ctx: any, id: string): Promise<OIDCAccount | null> {
        const user = users.find(u => u.id === id);
        return user ? wrapUser(user) : null;
    },

    async getClaims(accountId: string, use: string, scope: string) {
        const user = users.find(u => u.id === accountId);
        if (!user) return { sub: accountId };
        return { sub: accountId, email: user.email, name: user.name };
    },

    // No routes -- this is a read-only provider
};

export default plugin;
```

**Activate it:** Set `PROVIDER=json-file` and `USERS_FILE=/path/to/users.json`.

### Example 3: Session Plugin

Session plugins are the most complex because they bridge the oidc-provider library's adapter interface with your storage backend. Study the built-in `lru` plugin for the simplest working implementation.

Key responsibilities:
1. Implement the OIDC adapter (upsert/find/destroy/consume/revoke)
2. Implement the key-value cache (set/get/del)
3. Accept a client finder callback
4. Optionally provide an express-session store

See [Built-in Plugins](./built-in-plugins.md) for the `lru` and `redis` implementations.

### Example 4: MFA Plugin (SMS)

```typescript
// plugins-available/mfa/sms/index.ts
import type { MFAPlugin } from '../../../plugins/mfa/interface.ts';
import type { OIDCAccount } from '../../../plugins/provider/interface.ts';
import type { PluginConfig } from '../../../plugins/types.ts';
import type { Request } from 'express';
import { getSession } from '../../../plugins/registry.ts';

let twilioClient: any;

const plugin: MFAPlugin = {
    meta: { name: 'sms', version: '1.0.0', type: 'mfa', description: 'SMS-based MFA via Twilio' },

    async initialize(config: PluginConfig) {
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        if (!accountSid || !authToken) {
            throw new Error('SMS MFA requires TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN');
        }
        // Initialize your SMS client here
    },

    async requiresChallenge(account: OIDCAccount): Promise<boolean> {
        // Check if user has a phone number on file
        const claims = await account.claims('id_token', 'phone');
        return !!claims.phone_number;
    },

    async issueChallenge(account: OIDCAccount, req: Request): Promise<string> {
        const session = getSession();
        const pin = ('000000' + Math.floor(Math.random() * 1000000)).slice(-6);
        const challengeId = req.params.uid;

        await session.set(`sms:mfa:${challengeId}`, { pin }, 300); // 5 min TTL

        const claims = await account.claims('id_token', 'phone');
        // Send SMS with your client here
        console.log(`SMS MFA: sent PIN to ${claims.phone_number}`);

        return challengeId;
    },

    async verifyChallenge(challengeId: string, req: Request): Promise<boolean> {
        const session = getSession();
        const data = await session.get(`sms:mfa:${challengeId}`);
        if (!data) {
            req.flash('error', 'Code expired. Please log in again.');
            return false;
        }
        if (req.body.mfa?.trim() !== data.pin) {
            req.flash('error', 'Invalid code');
            return false;
        }
        await session.del(`sms:mfa:${challengeId}`);
        return true;
    },
};

export default plugin;
```

### Example 5: Extension Plugin

```typescript
// plugins-available/extensions/api-keys/index.ts
import type { ExtensionPlugin } from '../../../plugins/extension/interface.ts';
import type { PluginConfig } from '../../../plugins/types.ts';
import type { Application } from 'express';

const plugin: ExtensionPlugin = {
    meta: { name: 'api-keys', version: '1.0.0', type: 'extension', description: 'API key management' },

    async initialize(config: PluginConfig) {
        // Set up any storage needed
    },

    getRoutes(app: Application) {
        app.get('/api-keys', (req, res) => {
            // List user's API keys
        });
        app.post('/api-keys', (req, res) => {
            // Create a new API key
        });
        app.delete('/api-keys/:id', (req, res) => {
            // Revoke an API key
        });
    },

    getScopes() {
        return ['api_keys:read', 'api_keys:write'];
    },

    async getClaims(accountId: string) {
        // Return any additional claims
        return {};
    },
};

export default plugin;
```

## Reading Configuration

Plugins receive core config via `initialize(config)`. For plugin-specific configuration, read directly from `process.env`:

```typescript
async initialize(config: PluginConfig) {
    // Core config is in `config`
    const hostname = config.hostname;
    const siteName = config.site_name;

    // Plugin-specific config comes from env vars
    const myApiKey = process.env.MY_PLUGIN_API_KEY;
    if (!myApiKey) throw new Error('MY_PLUGIN_API_KEY is required');
}
```

This is by design -- plugins own their configuration. Document your required env vars in your plugin's README.

## Using Other Plugins

**Built-in plugins** can import directly from the registry:

```typescript
import { getSession } from '../../../plugins/registry.ts';

const session = getSession();
await session.set('my-key', { data: 'value' }, 3600);
const data = await session.get('my-key');
```

**External plugins** should use the injected services instead:

```typescript
let services: any;

const plugin = {
    async initialize(config: PluginConfig) {
        services = config.services;
    },

    async someMethod() {
        const session = services.getSession();
        await session.set('my-key', { data: 'value' }, 3600);

        // Send an email
        await services.transporter.sendMail({ from: '...', to: '...', subject: '...' });
    },
};
```

**Important:** Only use the registry/services during operation (after `initialize()`), never during module load time. The registry isn't populated until the boot sequence runs.

## Error Handling

- Throw during `initialize()` to prevent the server from starting. Use this for missing required config, failed connections, etc.
- During operation, set flash messages on `req` for user-facing errors and return `null`/`false` as appropriate.
- Log internal errors with `console.error()`.

## Installing Your Plugin

### Built-in (Source Tree)

Place your plugin directory under `plugins-available/`:

```
src/plugins-available/
  providers/my-provider/index.ts
  sessions/my-session/index.ts
  themes/my-theme/index.ts
  mfa/my-mfa/index.ts
  extensions/my-extension/index.ts
```

### External (Prebuilt Bundle)

Build your plugin to ESM JavaScript and place it in the external plugin directory:

```
/data/plugins/
  providers/my-provider/index.js
  mfa/my-mfa/index.js
```

Then set the corresponding env var:

```env
PROVIDER=my-provider
MFA=my-mfa
```

External plugins take precedence over built-in plugins with the same name.

## Building an External Plugin

External plugins are fully standalone projects with their own build tooling. Here's the typical setup:

### 1. Initialize the project

```bash
mkdir my-plugin && cd my-plugin
npm init -y
npm install --save-dev @byob-oidc/plugin-types esbuild typescript @types/node
```

### 2. Write your plugin

```typescript
// src/index.ts
import type { MFAPlugin, PluginConfig } from '@byob-oidc/plugin-types';

const plugin: MFAPlugin = {
    meta: { name: 'my-mfa', version: '1.0.0', type: 'mfa' },
    async initialize(config: PluginConfig) { /* ... */ },
    async requiresChallenge() { return true; },
    async issueChallenge(account, req) { /* ... */ return req.params.uid; },
    async verifyChallenge(challengeId, req) { /* ... */ return true; },
};
export default plugin;
```

### 3. Build

Add to `package.json`:

```json
{
    "type": "module",
    "scripts": {
        "build": "esbuild src/index.ts --bundle --platform=node --format=esm --outfile=dist/index.js"
    }
}
```

```bash
npm run build
```

### 4. Deploy

```bash
mkdir -p /data/plugins/mfa/my-mfa
cp dist/index.js /data/plugins/mfa/my-mfa/
```

### Runtime Dependencies

If your plugin imports npm packages at runtime, either:

- **Bundle them** (esbuild does this by default)
- **Mark as external** and copy `node_modules/` alongside `index.js`

```bash
# Bundle everything except bcryptjs (native module)
esbuild src/index.ts --bundle --platform=node --format=esm \
  --outfile=dist/index.js --external:bcryptjs
```

### Example Plugins

See the `examples/plugins/` directory for complete, working examples:

- **[example-csv-provider](../../examples/plugins/example-csv-provider/)** — CSV flat-file auth with bcrypt
- **[example-captcha-mfa](../../examples/plugins/example-captcha-mfa/)** — Random question captcha

Each has its own `package.json`, `tsconfig.json`, build script, and README.

See [Deploying Plugins](./deploying-plugins.md) for production deployment details.
