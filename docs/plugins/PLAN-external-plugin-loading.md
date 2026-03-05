# PLAN: External Plugin Loading (Prebuilt Bundles)

**Status: Implemented** (see `feature/external-plugin-loading` branch)

This document describes the planned support for loading plugins from **prebuilt bundles in external directories** -- outside the BYOB-OIDC source tree. This is the target model for third-party and user-contributed plugins.

## Current Limitation

Today, plugins must live inside `src/plugins-available/`. They are TypeScript source files loaded via dynamic `import()` and executed by `tsx`. This means:

- Plugins must be TypeScript (or at least valid ESM)
- Plugins are coupled to the source tree
- Adding a third-party plugin means copying it into the project
- There's no clean separation between "core plugins" and "user plugins"

## Goal

Support loading plugins from **any directory** on the filesystem. Plugins are expected to be:

1. **Prebuilt** -- already compiled to JavaScript (ESM). No TypeScript compilation at load time.
2. **Self-contained** -- all dependencies bundled (or installed locally via their own `node_modules/`)
3. **Interface-compliant** -- default export implements the correct plugin interface

The server should be able to load a plugin from `/opt/byob-plugins/my-provider/` the same way it loads one from `src/plugins-available/providers/my-provider/`.

## Proposed Design

### 1. External Plugin Directory

A new env var specifies the root directory for external plugins:

```env
PLUGIN_DIR=/opt/byob-plugins
```

The directory structure mirrors `plugins-available/`:

```
/opt/byob-plugins/
  providers/
    my-ldap/
      index.js        # Prebuilt ESM bundle
      package.json    # Optional: metadata, dependencies
  themes/
    corporate/
      index.js
      assets/
        style.css
  mfa/
    sms/
      index.js
  extensions/
    discord/
      index.js
```

### 2. Discovery Changes

The registry's `discoverAvailable()` function would scan **both** the built-in `plugins-available/` directory and the external `PLUGIN_DIR`. External plugins take precedence (an external `my-theme` overrides a built-in `my-theme` of the same name).

```
Discovery order for themes:
1. src/plugins-available/themes/*  (built-in)
2. $PLUGIN_DIR/themes/*            (external, overrides built-in)
```

### 3. Loading Changes

The `loadPlugin()` function needs to handle:

- **TypeScript source** (current): `import('file:///path/to/index.ts')` -- works under `tsx`
- **JavaScript bundles** (new): `import('file:///path/to/index.js')` -- works in native Node.js

The loader should try `index.js` first, then `index.ts`, to prefer prebuilt bundles.

### 4. Plugin Package Format

A prebuilt plugin directory should contain at minimum:

```
my-plugin/
  index.js            # ESM default export implementing the plugin interface
```

Optionally:

```
my-plugin/
  index.js
  package.json        # name, version, description, byob-oidc plugin metadata
  node_modules/       # Plugin's own dependencies (if any)
  assets/             # Static files (themes)
  README.md           # Documentation
```

A `package.json` could include plugin metadata that supplements or replaces `meta`:

```json
{
    "name": "byob-plugin-my-ldap",
    "version": "2.0.0",
    "description": "LDAP authentication provider for BYOB-OIDC",
    "main": "index.js",
    "type": "module",
    "byob-oidc": {
        "pluginType": "provider",
        "requiredEnv": ["LDAP_URL", "LDAP_BIND_DN", "LDAP_BIND_PASSWORD"],
        "minCoreVersion": "0.4.0"
    }
}
```

### 5. Interface Type Distribution

External plugins need access to the interface types for development. Options:

**Option A: Published npm package**
Publish `@byob-oidc/plugin-types` to npm containing:
- `Plugin`, `PluginMeta`, `PluginConfig`, `PluginType`
- `ThemePlugin`, `ProviderPlugin`, `SessionPlugin`, `MFAPlugin`, `ExtensionPlugin`
- `OIDCAccount`, `OIDCAdapter`, `AdapterConstructor`

Plugin authors would:
```bash
npm install --save-dev @byob-oidc/plugin-types
```

**Option B: TypeScript declaration files in repo**
Ship `.d.ts` files alongside the interfaces. Plugin authors copy them or reference them.

**Recommendation:** Option A, once the interfaces are stable.

### 6. Import Path Resolution

Currently, plugins import from relative paths:
```typescript
import { getSession } from '../../../plugins/registry.ts';
```

External plugins can't use relative paths back into the core source. Options:

**Option A: Package exports**
Expose core utilities as package exports in `package.json`:
```json
{
    "exports": {
        "./plugins/registry": "./src/plugins/registry.ts",
        "./plugins/types": "./src/plugins/types.ts",
        "./lib/email": "./src/lib/email.ts"
    }
}
```

External plugins would import:
```javascript
import { getSession } from 'nbn-oidc-provider/plugins/registry';
```

**Option B: Inject at initialize**
Pass registry accessors and utilities via the `PluginConfig`:
```typescript
interface PluginConfig {
    // ... existing fields ...
    services: {
        getSession(): SessionPlugin;
        transporter: Transporter;  // nodemailer
    };
}
```

**Recommendation:** Option B for services that plugins commonly need. Option A for development-time type imports.

## Implementation Tasks

### Phase 1: Core Changes -- DONE

- [x] Add `PLUGIN_DIR` env var to config (default: `/data/plugins`)
- [x] Update `discoverAvailable()` to scan both built-in and external directories
- [x] Update `loadPlugin()` to try `.js` (external) then `.ts` (built-in)
- [x] Handle `file://` URL resolution for external directories
- [x] Test loading a prebuilt JS plugin from an external directory

### Phase 2: Developer Experience -- DONE

- [x] Extract plugin interfaces into a standalone package (`@byob-oidc/plugin-types`)
- [x] Expand `PluginConfig` to include service accessors (`PluginServices`) for external plugins
- [x] Inject `getSession()` and `transporter` via `config.services`
- [x] Write a guide for building and distributing prebuilt plugins

### Phase 3: Plugin Packaging -- PARTIAL

- [x] Define `package.json` `byob-oidc` metadata schema (in example plugins)
- [ ] Read plugin metadata from `package.json` when available (supplement `meta`)
- [ ] Add version compatibility checking (`minCoreVersion`)
- [x] Document the plugin bundle format

### Phase 4: Plugin Distribution -- DONE

- [x] Create example plugins with build pipeline (`examples/plugins/`)
- [x] Document how to build a plugin with esbuild
- [ ] Consider a plugin registry or directory (long-term, optional)

## Open Questions

1. **Dependency isolation**: Should external plugins use their own `node_modules`, or can they assume core dependencies (Express, etc.) are available? Recommendation: plugins should bundle their unique dependencies but can `peerDependency` on Express, oidc-provider, etc.

2. **Hot reloading**: Should plugins be reloadable without server restart? Probably not for v1 -- the complexity isn't worth it.

3. **Security**: Should we validate plugin signatures or checksums? Probably not for v1 -- trust model is the same as npm packages.

4. **Versioning**: What happens when a plugin targets an older interface version? The `minCoreVersion` field in `package.json` would let the loader reject incompatible plugins at load time.
