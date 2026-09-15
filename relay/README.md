# Farangis ↔ Grok Relay

Small server-side relay for Grok App Builder → Farangis Bridge.

## Endpoints

- `GET /health` — relay health and non-sensitive config flags.
- `GET /api/farangis/health` — checks the protected Farangis Bridge health endpoint.
- `POST /api/chat` — forwards a bounded chat request to `POST /api/v1/chat` on Farangis Bridge.

Every `/api/*` request must include:

```http
x-relay-client: grok-salon-v1
```

`RELAY_ACCESS_TOKEN` is optional. If set, callers must also send either `Authorization: Bearer <token>` or `x-relay-token: <token>`.

## Server-only environment variables

- `VERCEL_AUTOMATION_BYPASS_SECRET` (preferred) or `FARANGIS_PROTECTION_BYPASS`
- `FARANGIS_DEVICE_TOKEN` when the Bridge has device auth enabled
- `FARANGIS_BASE_URL` (defaults to `https://farangis-core-v2-i-sector.vercel.app`)
- `RELAY_CLIENT_ID` (defaults to `grok-salon-v1`)
- `RELAY_ACCESS_TOKEN` (optional; use once the caller can hold a secret)
- `RELAY_ALLOWED_ORIGIN` (defaults to `*`)
- `RELAY_TIMEOUT_MS`, `RELAY_MAX_TEXT_LENGTH`, `RELAY_MAX_CONTEXT`, `RELAY_MINUTE_LIMIT`, `RELAY_DAILY_LIMIT`

Secrets must never be copied into frontend code or browser storage.

## Grok App Builder request

```js
await fetch('https://<relay-host>/api/chat', {
  method: 'POST',
  headers: {
    'content-type': 'application/json',
    'x-relay-client': 'grok-salon-v1'
  },
  body: JSON.stringify({
    conversationId: 'room-1',
    text: message,
    context
  })
})
```

The relay only targets the configured Farangis Bridge URL, caps message/context sizes, uses timeout + one bounded retry for transient upstream failures, and does not log message bodies or credentials.
