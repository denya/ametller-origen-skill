# Authentication

## Guest catalog access

Catalog search and product details use Salesforce SLAS public-client PKCE with `hint=guest`. No customer credentials or saved session are required.

## Direct MCP/CLI registered authorization

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

For the direct MCP/CLI lane, the browser boundary ends after token capture. Normal operations use SCAPI or the Gmail API workflow.

## Existing authorized browser tab

If the agent's browser-control environment explicitly supports developer network events, it may reload an already-authorized Ametller tab and capture the same exact OAuth token response. Never read cookies or local storage, and never emit token values in tool output. Save the registered pair directly to the session file with `0600` permissions.

This optional capture path applies only when the environment explicitly exposes the response and a private local session file. Do not attempt it in ChatGPT Work Mode: its protected cloud-browser credentials, cookies, and tokens are deliberately unavailable to the model.

## ChatGPT Work Mode cloud-browser authorization

ChatGPT Work Mode is a separate browser-auth lane for environments where this repository's MCP is not installed:

1. Open only the official Ametller Origen site in the persistent cloud browser.
2. If the site is signed out, invoke the browser's protected authorization flow. The user enters credentials and verification codes in that interface; never ask for them in chat.
3. Verify success from the rendered account page, preferably in a fresh official-site tab.
4. Reuse that private browser profile for bounded website reads. The site owns its browser-session refresh.

Observed support is ordinary rendered-page browser interaction; Ametller currently exposes no page WebMCP tools. The model cannot and must not retrieve cookies, access tokens, refresh tokens, passwords, or verification codes from the protected browser. Do not write or synthesize `~/.ametller/session.json` from this session, and do not claim the session transfers to Claude, Codex CLI, the MCP server, or another browser profile.

When using this fallback:

- Read catalog, profile, online-order history, and basket pages only as needed for the user's request.
- Change the basket UI only after explicit approval of the exact item and quantity; verify the resulting basket.
- Never checkout, place an order, pay, choose a delivery address or slot, or submit any equivalent purchase side effect.
- Get offline shop tickets through separately connected Gmail using the exact subject `"Ametller Origen - El teu tiquet digital"`, not from the website session.

If a fresh tab is signed out or the site asks for credentials again, the browser session has expired. Repeat protected browser authorization. Do not try to recover it by exporting secrets.

## Direct MCP/CLI refresh and recovery

Access tokens are short-lived. The API client refreshes them when fewer than 60 seconds remain and persists both the rotated access token and any rotated refresh token.

If refresh returns `invalid refresh_token`, run `npm run login` again. Guest search remains available while registered authentication is repaired.

This refresh updates only the local direct-API session file. It does not refresh or replace a ChatGPT Work Mode browser session. Conversely, the website's own browser-session refresh does not update the local MCP token pair.

Override the state path only when needed:

```bash
AMETLLER_SESSION_PATH=/secure/path/session.json npm run cli -- cart
```
