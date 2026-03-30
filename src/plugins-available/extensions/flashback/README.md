# FlashBack Retro-Auth Extension Plugin

Passwordless login flow for HTTP-only clients that cannot do HTTPS. An HTTP client (e.g. a retro web browser) triggers a login challenge, which gets approved (or registered) by the user on a desktop browser over HTTPS.

**No passwords ever traverse plain HTTP.**

## How It Works

```
Retro Device (HTTP)          BYOB-OIDC (HTTPS)          User's Desktop (HTTPS)
       |                           |                            |
       |  1. POST /flashback/init  |                            |
       |  {sessionId, email}       |                            |
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
       |                           |  5. Callback to FlashBack  |
       |                           |     (HMAC-signed)          |
       |                           |----> FlashBack Server      |
       |                           |                            |
       |  6. User clicks "check"   |                            |
       |  on retro device          |                            |
       |----> FlashBack checks     |                            |
       |      session is active    |                            |
```

### Flow Details

1. **FlashBack server** calls `POST /flashback/init` with `{sessionId, email, callbackUrl}` using OIDC client credentials (HTTP Basic Auth).

2. **Plugin** looks up the email via the provider plugin:
   - **If user exists:** emails an HTTPS approval link to `/flashback/approve/{challengeId}`
   - **If user does NOT exist:** emails an HTTPS registration link to `/flashback/register/{challengeId}`
   - Returns `{challengeId, status: "pending"}` either way (does not leak account existence)

3. **Existing user** clicks the approval link on their desktop browser:
   - Sees: "Approve login for {email} on FlashBack? [Approve] [Deny]"
   - Clicks Approve or Deny

4. **New user** clicks the registration link on their desktop browser:
   - Sees a registration form with email pre-filled (read-only)
   - Enters display name and password
   - Account is created (auto-verified) and the session is auto-approved

5. **On approval or denial**, the plugin POSTs an HMAC-SHA256 signed callback to the FlashBack server:
   - Approval: `POST {callbackUrl}/api/sessions/{sessionId}/activate`
   - Denial: `POST {callbackUrl}/api/sessions/{sessionId}/deny`

6. **Retro device** experience: user clicks a link on their retro device to check if the session was approved. This retry page is FlashBack's responsibility, not this plugin's.

## Configuration

| Environment Variable | Required | Default | Description |
|---------------------|----------|---------|-------------|
| `FLASHBACK_SHARED_SECRET` | Yes | — | HMAC-SHA256 shared secret for signing callbacks |
| `FLASHBACK_CALLBACK_URL` | Yes | — | Default FlashBack server URL (e.g. `https://flashback.page`) |
| `FLASHBACK_CHALLENGE_TTL` | No | `900` | Challenge expiry in seconds (default: 15 minutes) |

### Enabling the Extension

Add `flashback` to the `EXTENSIONS` environment variable:

```bash
EXTENSIONS=flashback
# or with other extensions:
EXTENSIONS=flashback,other-extension
```

## API Endpoints

### POST /flashback/init

Create a new login challenge. Server-to-server call, authenticated with OIDC client credentials.

**Authentication:** HTTP Basic Auth with the FlashBack OIDC client's `client_id` and `client_secret`.

**Request:**
```json
{
  "sessionId": "retro-device-session-id",
  "email": "user@example.com",
  "callbackUrl": "https://flashback.page"
}
```

| Field | Required | Description |
|-------|----------|-------------|
| `sessionId` | Yes | The retro client's session identifier |
| `email` | Yes | Email address of the user trying to log in |
| `callbackUrl` | No | Override the default callback URL |

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

**On approval:** sends callback to FlashBack, shows success page.
**On denial:** sends denial callback, shows denial confirmation.

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

The `X-Flashback-Signature` header contains the HMAC-SHA256 signature of the JSON body, signed with the shared secret.

```javascript
const crypto = require('crypto');

function verifySignature(body, signature, secret) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
  return crypto.timingSafeEqual(
    Buffer.from(signature, 'hex'),
    Buffer.from(expected, 'hex')
  );
}
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

- **HMAC-SHA256** on all callbacks — prevents spoofed session activations
- **Challenge TTL** — 15 minutes (configurable), prevents stale challenges
- **Rate limiting** — 5 requests per minute per email on `/flashback/init`
- **Client credentials** — `/flashback/init` requires valid OIDC client credentials
- **CSRF protection** — browser forms (approve, register) include CSRF tokens
- **No account enumeration** — `/flashback/init` always returns `"pending"` regardless of whether the account exists; different emails are sent but the API response is identical
- **No HTTP passwords** — passwords are only entered on HTTPS pages in the user's desktop browser

## Dependencies

This extension uses only core services — no additional npm packages required:

- `config.services.getSession()` — session cache for challenge storage
- `config.services.transporter` — email delivery
- `getProvider()` from registry — user lookup (`findByEmail`) and creation (`createAccount`)
- `Client.findByClientId()` from core — client credentials verification
- Node.js `crypto` — HMAC-SHA256 signing and UUID generation
