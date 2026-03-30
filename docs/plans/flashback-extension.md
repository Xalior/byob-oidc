# FlashBack Retro-Auth Extension Plugin

Build at: `src/plugins-available/extensions/flashback/index.ts`

## Context

FlashBack (flashback.page) is registered as a standard OIDC client in byob-oidc's clients table. Desktop browser login uses the normal OIDC authorization code flow — nothing special.

The problem: some FlashBack users connect over plain HTTP from devices that cannot do HTTPS (no trusted SSL). Passwords cannot be sent over HTTP. This plugin bridges that gap — it lets an HTTP client trigger a login that gets approved on a desktop browser over HTTPS.

## What this plugin does

ExtensionPlugin that adds routes under /flashback/* for passwordless login from HTTP-only clients. Routes are top-level (no namespace prefix required by the extension system).

### Retro Login Flow

1. FlashBack server calls POST /flashback/init with {sessionId, email, callbackUrl}
   - Plugin looks up user by email via the provider plugin
   - Creates a pending challenge (15 min TTL) in session cache, linking sessionId + email + callbackUrl
   - **If user exists:** emails an HTTPS approval link: https://{byob-hostname}/flashback/approve/{challengeId}. Email: "Someone is trying to log in to FlashBack as {email}. If this is you, click to approve."
   - **If user does NOT exist:** emails an HTTPS register-and-approve link: https://{byob-hostname}/flashback/register/{challengeId}. Email: "Someone wants to use FlashBack with this email. Click here to create an account and approve the login."
   - Returns {challengeId, status: "pending"} either way (do not leak whether account exists)
2. **Existing user** clicks approval link on desktop browser (HTTPS):
   - GET /flashback/approve/:challengeId — page: "Approve login for {email} on FlashBack? [Approve] [Deny]"
   - POST /flashback/approve/:challengeId with {action: "approve"}
   - Plugin POSTs to {callbackUrl}/api/sessions/{sessionId}/activate with {userId, email}, signed HMAC-SHA256 (X-Flashback-Signature header)
   - Shows: "Done! Your device is now logged in."
3. **New user** clicks registration link on desktop browser (HTTPS):
   - GET /flashback/register/:challengeId — registration form (username, password) with email pre-filled from the challenge
   - POST /flashback/register/:challengeId — creates account via the provider plugin, then auto-approves the pending session (same callback as step 2)
   - Shows: "Account created! Your device is now logged in."
4. On approval or denial, plugin always POSTs the result back to {callbackUrl}/api/sessions/{sessionId}/activate (or /deny). FlashBack never polls byob-oidc.
5. **Retro client experience:** After FlashBack initiates the challenge, it shows the retro user a page: "Check your email! Once you've approved the login, click here to continue." That link points back to FlashBack (e.g. /login/check?session={sessionId}). If the callback hasn't arrived yet, FlashBack shows "Not yet approved. Click here to try again." This is user-driven retry on the retro device — no polling, no auto-refresh, just a link the user clicks when ready. This retry page is FlashBack's responsibility, not this plugin's.

## Configuration

- FLASHBACK_SHARED_SECRET (required) — HMAC shared secret for signing callbacks
- FLASHBACK_CALLBACK_URL (required) — e.g. https://flashback.page
- FLASHBACK_CHALLENGE_TTL — seconds, default 900

## Security

- HMAC-SHA256 on all callbacks
- Challenge TTL 15 minutes
- Rate limit /flashback/init: 5/min per email
- /flashback/init authenticated with OIDC client credentials (client_id + client_secret)
- No passwords ever traverse plain HTTP
- Do not reveal whether an account exists (always return "pending", send different emails)

## Implementation

- Implements ExtensionPlugin interface
- config.services.transporter for email
- config.services.getSession for challenge storage (ephemeral, TTL-based)
- config.services.getProvider to look up and create users
- Routes via getRoutes(app) — all under /flashback/*
- No new DB tables, no core modifications

## Documentation

Document everything thoroughly:
- JSDoc on all exported functions, interfaces, and types
- README.md in the plugin directory explaining the flow, configuration, and setup
- Inline comments on non-obvious logic (HMAC signing, challenge lifecycle, rate limiting)
- Document the API endpoints (request/response shapes) in the README
- Document the email templates and what the user sees at each step
- Document the callback payload format so FlashBack developers know what to expect
