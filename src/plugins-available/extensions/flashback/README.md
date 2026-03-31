# FlashBack Retro-Auth Extension Plugin

Passwordless login flow for HTTP-only clients that cannot do HTTPS. An HTTP client (e.g. a retro web browser) triggers a login challenge, which gets approved (or registered) by the user on a desktop browser over HTTPS.

**No passwords ever traverse plain HTTP.**

Any registered OIDC client can use the FlashBack protocol. Callbacks are HMAC-signed with the client's own `client_secret` — no additional shared secrets or per-client configuration needed.

## How It Works

```
Retro Device (HTTP)          BYOB-OIDC (HTTPS)          User's Desktop (HTTPS)
       |                           |                            |
       |  1. POST /flashback/init  |                            |
       |  {sessionId, email,       |                            |
       |   callbackUrl}            |                            |
       |-------------------------->|                            |
       |  {challengeId, "pending"} |                            |
       |<--------------------------|                            |
       |                           |  2. Email: "Click to       |
       |                           |     approve/register"      |
       |                           |--------------------------->|
       |                           |                            |
       |                           |  3. GET /flashback/approve |
       |                           |     or /register           |
       |                           |<---------------------------|
       |                           |  (show form)               |
       |                           |--------------------------->|
       |                           |                            |
       |                           |  4. POST approve/register  |
       |                           |<---------------------------|
       |                           |                            |
       |                           |  5. Callback to client     |
       |                           |     (HMAC-signed with      |
       |                           |      client_secret)        |
       |                           |----> Client Server         |
       |                           |                            |
       |  6. User clicks "check"   |                            |
       |  on retro device          |                            |
       |----> Client checks        |                            |
       |      session is active    |                            |
```

### Flow Details

1. **Client server** calls `POST /flashback/init` with `{sessionId, email, callbackUrl}` using its OIDC client credentials (HTTP Basic Auth).

2. **Plugin** looks up the email via the provider plugin:
   - **If user exists:** emails an HTTPS approval link to `/flashback/approve/{challengeId}`
   - **If user does NOT exist:** emails an HTTPS registration link to `/flashback/register/{challengeId}`
   - Returns `{challengeId, status: "pending"}` either way (does not leak account existence)

3. **Existing user** clicks the approval link on their desktop browser:
   - Sees: "Approve login for {email}? [Approve] [Deny]"
   - Clicks Approve or Deny

4. **New user** clicks the registration link on their desktop browser:
   - Sees a registration form with email pre-filled (read-only)
   - Enters display name and password
   - Account is created (auto-verified) and the session is auto-approved

5. **On approval or denial**, the plugin POSTs an HMAC-SHA256 signed callback to the client server:
   - Approval: `POST {callbackUrl}/api/sessions/{sessionId}/activate`
   - Denial: `POST {callbackUrl}/api/sessions/{sessionId}/deny`
   - Signed with the client's own `client_secret`

6. **Retro device** experience: user clicks a link on their retro device to check if the session was approved. This retry/polling page is the client's responsibility, not this plugin's.

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `FLASHBACK_CHALLENGE_TTL` | No | `900` | Challenge expiry in seconds (default: 15 minutes) |

No shared secrets or callback URLs are configured on the server. Each client authenticates with its own OIDC `client_id` + `client_secret` and provides its callback URL in the request. Callbacks are HMAC-signed with that client's `client_secret`.

### Enabling the Extension

Add `flashback` to the `EXTENSIONS` environment variable:

```bash
EXTENSIONS=flashback
# or with other extensions:
EXTENSIONS=flashback,other-extension
```

### Registering a Client

Any OIDC client in the `clients` table can use the FlashBack protocol. Register a client the same way you would for standard OIDC:

```sql
INSERT INTO clients (client_id, client_secret, grant_types, redirect_uris, post_logout_redirect_uris, grant_requirements)
VALUES (
  'my-retro-app',
  'a-strong-secret',
  '["authorization_code"]',
  '["https://my-retro-app.example.com/callback"]',
  '["https://my-retro-app.example.com"]',
  '[]'
);
```

The `client_secret` is used both for authenticating `/flashback/init` requests and for HMAC-signing callbacks.

## API Endpoints

### POST /flashback/init

Create a new login challenge. Server-to-server call, authenticated with OIDC client credentials.

**Authentication:** HTTP Basic Auth with the client's `client_id` and `client_secret`.

**Request:**
```json
{
  "sessionId": "retro-device-session-id",
  "email": "user@example.com",
  "callbackUrl": "https://my-retro-app.example.com"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionId` | Yes | The retro client's session identifier |
| `email` | Yes | Email address of the user trying to log in |
| `callbackUrl` | Yes | Base URL for callbacks (receives /api/sessions/... POSTs) |

**Response (200):**
```json
{
  "challengeId": "550e8400-e29b-41d4-a716-446655440000",
  "status": "pending"
}
```

**Error Responses:**
- `401` — Invalid client credentials
- `400` — Missing required fields or invalid email
- `429` — Rate limited (5 requests per minute per email)

### GET /flashback/approve/:challengeId

Show the approval page for an existing user. Rendered as a simple HTML page with Approve and Deny buttons.

**Response:** HTML page with CSRF-protected form.

### POST /flashback/approve/:challengeId

Handle approval or denial from the approval page.

**Request (form-encoded):**
```
action=approve   # or action=deny
_csrf=<token>
```

**On approval:** sends signed callback, shows success page.
**On denial:** sends signed denial callback, shows denial confirmation.

### GET /flashback/register/:challengeId

Show the registration form for a new user. Email is pre-filled from the challenge.

**Response:** HTML registration form with fields for display name, password, and password confirmation.

### POST /flashback/register/:challengeId

Create an account and auto-approve the pending session.

**Request (form-encoded):**
```
email=<pre-filled, readonly>
display_name=<5-64 characters>
password=<min 16 characters>
password_confirm=<must match password>
_csrf=<token>
```

**Validation:**
- Display name: 5-64 characters
- Password: minimum 16 characters
- Passwords must match

**On success:** creates account (auto-verified), sends approval callback, shows success page.

## Callback Payload Format

### Approval Callback

```
POST {callbackUrl}/api/sessions/{sessionId}/activate
Content-Type: application/json
X-Flashback-Signature: <HMAC-SHA256 hex signature>
```

```json
{
  "userId": "account-id-string",
  "email": "user@example.com",
  "sessionId": "retro-device-session-id",
  "action": "approve",
  "timestamp": 1711756800000
}
```

### Denial Callback

```
POST {callbackUrl}/api/sessions/{sessionId}/deny
Content-Type: application/json
X-Flashback-Signature: <HMAC-SHA256 hex signature>
```

```json
{
  "sessionId": "retro-device-session-id",
  "action": "deny",
  "timestamp": 1711756800000
}
```

### Verifying the HMAC Signature

The `X-Flashback-Signature` header contains the HMAC-SHA256 signature of the JSON body, signed with the client's own `client_secret`.

```typescript
import { createHmac } from 'node:crypto';

function verifySignature(rawBody: string, signature: string, clientSecret: string): boolean {
    const expected = createHmac('sha256', clientSecret)
        .update(rawBody)
        .digest('hex');

    // Use timing-safe comparison
    const sigBuf = Buffer.from(signature, 'hex');
    const expBuf = Buffer.from(expected, 'hex');
    if (sigBuf.length !== expBuf.length) return false;

    let diff = 0;
    for (let i = 0; i < sigBuf.length; i++) {
        diff |= sigBuf[i] ^ expBuf[i];
    }
    return diff === 0;
}
```

## Test Client

A standalone TypeScript test client is available at `examples/flashback-test-client/client.ts`. It starts a local callback server, initiates a challenge, and verifies the HMAC signature on the response.

### Quick Start

```bash
# From the project root:
BYOB_URL=https://dev.id.nextbestnetwork.com \
CLIENT_ID=your-client-id \
CLIENT_SECRET=your-client-secret \
npx tsx examples/flashback-test-client/client.ts --email user@example.com
```

### What It Does

1. Starts a local HTTP server on port 9999 (configurable via `CALLBACK_PORT`)
2. Calls `POST /flashback/init` with your client credentials
3. Prints the challenge ID and waits
4. You click the approve/deny link in the email
5. The callback arrives, signature is verified, result is printed

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `BYOB_URL` | Yes | — | Base URL of your BYOB-OIDC server |
| `CLIENT_ID` | Yes | — | OIDC client_id |
| `CLIENT_SECRET` | Yes | — | OIDC client_secret |
| `CALLBACK_PORT` | No | `9999` | Port for the local callback server |
| `CALLBACK_HOST` | No | `localhost` | Hostname the BYOB server can reach |

### Example Output

```
FlashBack Protocol Test Client
----------------------------------------
Callback server listening on http://localhost:9999

Initiating FlashBack challenge...
  BYOB Server:  https://dev.id.nextbestnetwork.com
  Client ID:    flashback-dev
  Email:        user@example.com
  Session ID:   test-1711756800000
  Callback URL: http://localhost:9999

Challenge created!
  Challenge ID: 550e8400-e29b-41d4-a716-446655440000
  Status:       pending

Check the email for user@example.com and click the approve/deny link.
Waiting for callback...

============================================================
CALLBACK RECEIVED: APPROVED
============================================================
  Method:    POST
  URL:       /api/sessions/test-1711756800000/activate
  Signature: a1b2c3d4...
  Valid:     YES
  Body:      {
    "userId": "abc123",
    "email": "user@example.com",
    "sessionId": "test-1711756800000",
    "action": "approve",
    "timestamp": 1711756800123
  }
============================================================

Session activated successfully!
  User ID: abc123
  Email:   user@example.com
```

### Network Note

The BYOB-OIDC server needs to reach your callback server. If testing locally against a remote BYOB server, use a tunnel:

```bash
# Using ngrok:
ngrok http 9999
# Then set CALLBACK_HOST to the ngrok URL

# Or test against a local dev server (both on localhost):
BYOB_URL=https://localhost:5000 \
CALLBACK_HOST=host.docker.internal \
npx tsx examples/flashback-test-client/client.ts --email user@example.com
```

## Email Templates

### Approval Email (existing user)

**Subject:** `{site_name} - Approve FlashBack Login`

**Content:**
> Someone is trying to log in to FlashBack as {email}.
>
> If this is you, click to approve: [Approve Login]
>
> This link expires in 15 minutes.
>
> If you did not request this, you can safely ignore this email.

### Registration Email (new user)

**Subject:** `{site_name} - Create Account for FlashBack`

**Content:**
> Someone wants to use FlashBack with this email address.
>
> Click here to create an account and approve the login: [Create Account & Approve]
>
> This link expires in 15 minutes.
>
> If you did not request this, you can safely ignore this email.

## Security

- **Per-client HMAC-SHA256** — callbacks signed with the client's own `client_secret`, not a shared secret. Each client verifies callbacks independently.
- **Challenge TTL** — 15 minutes (configurable), prevents stale challenges
- **Rate limiting** — 5 requests per minute per email on `/flashback/init`
- **Client credentials** — `/flashback/init` requires valid OIDC client credentials (same trust model as OIDC)
- **CSRF protection** — browser forms (approve, register) include CSRF tokens
- **No account enumeration** — `/flashback/init` always returns `"pending"` regardless of whether the account exists; different emails are sent but the API response is identical
- **No HTTP passwords** — passwords are only entered on HTTPS pages in the user's desktop browser
- **Registration origin tracking** — accounts created via FlashBack record the initiating `client_id` in `registered_from_client_id`

## Dependencies

This extension uses only core services — no additional npm packages required:

- `config.services.getSession()` — session cache for challenge storage
- `config.services.transporter` — email delivery
- `getProvider()` from registry — user lookup (`findByEmail`) and creation (`createAccount`)
- `Client.findByClientId()` from core — client credentials verification and HMAC key lookup
- Node.js `crypto` — HMAC-SHA256 signing and UUID generation
