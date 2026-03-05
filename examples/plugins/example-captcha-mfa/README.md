# Example Captcha MFA Plugin

A BYOB-OIDC MFA plugin that presents a random question from a configurable question bank. The user must answer correctly to complete login. Useful as a lightweight bot deterrent.

## How It Works

1. After the user enters valid credentials, a random question is selected
2. The question is displayed on the MFA form (via flash message)
3. The user types their answer into the MFA code field
4. If correct, login proceeds. If wrong, they can retry with the same question.

## Building

```bash
cd examples/plugins/example-captcha-mfa
npm install
npm run build
```

This outputs `dist/index.js` — the prebuilt ESM bundle.

## Installing

Copy the built plugin into your BYOB-OIDC data directory:

```bash
mkdir -p /data/plugins/mfa/example-captcha
cp dist/index.js /data/plugins/mfa/example-captcha/
```

Or with Docker:

```bash
docker run -v ./my-plugins:/data/plugins \
  -e MFA=example-captcha \
  byob-oidc
```

## Custom Questions

Create a JSON file with your own questions:

```json
[
    { "question": "What is the company mascot?", "answer": "penguin" },
    { "question": "What floor is the break room on?", "answer": "3" }
]
```

Then set `CAPTCHA_QUESTIONS_FILE=/data/my-questions.json`.

If no file is specified, 15 built-in general knowledge questions are used.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `CAPTCHA_QUESTIONS_FILE` | _(none, uses built-in)_ | Path to custom JSON questions file |

## Answer Matching

- Case-insensitive: "Blue" matches "blue"
- Whitespace-trimmed: "  5  " matches "5"
- Must be exact otherwise: "five" does NOT match "5"
