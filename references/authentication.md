# Authentication

## Guest catalog access

Catalog search and product details use Salesforce SLAS public-client PKCE with `hint=guest`. No customer credentials or saved session are required.

## Registered browser authorization

Basket and online-order endpoints need a registered shopper token pair. Use the headed login:

```bash
npm run login
```

Before starting, tell the user:

> I will open Ametller Origen in a browser window. Sign in there and handle any 2FA yourself. Do not send me your password or verification code. I will continue after the site confirms the login.

The login script:

1. Opens the official Ametller login page in installed Chrome.
2. Waits for the exact Salesforce `/shopper/auth/.../oauth2/token` response.
3. Rejects guest tokens.
4. Saves only `access_token`, `refresh_token`, `customer_id`, `usid`, and expiry to `~/.ametller/session.json` with mode `0600`.
5. Closes the temporary browser after capture.

It does not inspect cookies, local storage, passwords, or one-time codes.

The browser boundary ends after token capture. Never use browser UI automation to read products, orders, totals, tickets, or the basket, and never mutate the basket in the browser. All normal operations use SCAPI or the Gmail API workflow.

## Existing authorized browser tab

If the agent's browser-control environment explicitly supports developer network events, it may reload an already-authorized Ametller tab and capture the same exact OAuth token response. Never read cookies or local storage, and never emit token values in tool output. Save the registered pair directly to the session file with `0600` permissions.

## Refresh and recovery

Access tokens are short-lived. The API client refreshes them when fewer than 60 seconds remain and persists both the rotated access token and any rotated refresh token.

If refresh returns `invalid refresh_token`, run `npm run login` again. Guest search remains available while registered authentication is repaired.

Override the state path only when needed:

```bash
AMETLLER_SESSION_PATH=/secure/path/session.json npm run cli -- cart
```
