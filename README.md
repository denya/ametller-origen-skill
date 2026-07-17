# Ametller Origen skill and MCP

Open Claude integration for Ametller Origen's live catalog, online orders, real cart, optional offline Gmail tickets, purchase analytics, and smart basket suggestions. It intentionally has no checkout, payment, delivery-slot, or order-placement tool. Chrome is used only to establish authorization; all catalog, order, analytics, and cart operations use APIs and never drive or scrape the shopping website.

Version 0.3 adds an official MCP App for Claude Desktop: spend charts, frequent products, official product images, and a suggestion picker. Products start unselected; the real cart changes only after the user checks items and presses **Add selected to real basket**.

## Claude Code

Requires current [Claude Code](https://code.claude.com/docs/en/setup), Node.js 20 or newer, and installed Google Chrome.

```bash
claude plugin marketplace add denya/ametller-origen-skill
claude plugin install ametller-origen@dany-grocery
```

Start or reload Claude Code, then ask for Ametller Origen or invoke `/ametller-origen:ametller-origen`. The MCP server starts automatically. On the first account action Claude opens the official Ametller login in Chrome; enter credentials and 2FA only in that browser. After the login response is captured, Chrome closes and normal operations use the direct API.

Claude Code stores the browser-created session in its persistent private plugin-data directory, not in the versioned plugin cache. Uninstall with `--keep-data` if you want to preserve that authorization.

## Claude Desktop

Download the v0.3.0 installer:

**[Download Ametller Origen v0.3.0 for Claude Desktop (.mcpb)](https://github.com/denya/ametller-origen-skill/releases/download/v0.3.0/ametller-origen-0.3.0.mcpb)**

[Release notes and checksum](https://github.com/denya/ametller-origen-skill/releases/tag/v0.3.0)

1. Download the `.mcpb` file from the link above.
2. Open Claude Desktop on macOS.
3. Go to **Settings → Extensions → Advanced settings → Install Extension…**.
4. Select `ametller-origen-0.3.0.mcpb` and approve the installation.
5. Ask Claude to use Ametller Origen. Chrome opens only when account authorization is needed.

![Ametller Origen cart review and product card in Claude Desktop](docs/claude-desktop-example.png)

This release targets Claude Desktop on macOS. The bundle is self-contained; Node.js and Chrome are required. Desktop state is kept in `~/.ametller/session.json` with mode `0600`.

To build the same bundle from source instead:

```bash
git clone https://github.com/denya/ametller-origen-skill.git
cd ametller-origen-skill
npm ci
npm run pack:mcpb
```

## Test the local MCP

Build and verify the new server without touching a real account:

```bash
git clone https://github.com/denya/ametller-origen-skill.git
cd ametller-origen-skill
npm ci
npm test
npm run build
npm run test:mcp
npm run test:login-wiring
```

Run it as a local Claude Code plugin:

```bash
claude --plugin-dir "$(pwd)"
```

Then ask: “Use Ametller purchase insights and show my frequent products and smart basket suggestions.” The first account read opens Chrome for sign-in if the saved session is missing or expired.

Automated packaging and E2E tests never open or navigate Chrome. `ametller_login` opens the official login only after a real user-initiated authorization request; an already saved session is used directly by API tests.

For Claude Desktop, build the one-click local extension:

```bash
npm run pack:mcpb
```

Install `dist/ametller-origen-0.3.0.mcpb` through **Settings → Extensions → Advanced settings → Install Extension…**. This bundle contains the interactive analytics view and the offline-ticket parser. Anthropic MCP Apps support is required for the interactive view; other MCP clients still receive the structured text result.

## CLI and offline tickets

For local development or direct use:

```bash
npm ci
npm run build
npm run login
npm run cli -- search 'quefir natural'
npm run cli -- cart
npm run cli -- orders all
npm run cli -- insights 12
npm run cli -- suggestions 12
```

Offline store tickets are separate from SCAPI online orders. With the authenticated `gws` Google Workspace CLI on `PATH`:

```bash
npm run tickets:sync -- --overwrite
npm run cli -- tickets 50
```

Tickets default to `~/.ametller/tickets` with private directory/file modes. Claude can call `ametller_sync_offline_tickets` and `ametller_get_offline_tickets` directly. The sync requires Python 3 plus an authenticated [`gws`](https://github.com/googleworkspace/cli) on `PATH`; offline tickets are not part of Ametller's commerce API.

## What it can do

- Search products and return official links, all image variants, prices, units, and safe availability flags.
- Read complete paginated online order history and individual order lines.
- Sync and read offline digital tickets from Gmail without browser scraping.
- Group purchases, show monthly/category spend, and rank frequent products.
- Resolve due-again suggestions against the current catalog by id or a conservative name+price match.
- Add, set, remove, or reorder cart items after explicit approval; there is no checkout tool.

Current limitations: offline category grouping is a transparent name-based estimate; receipt discounts are not allocated across categories; uncertain ticket-to-catalog matches are shown but cannot be selected; live batch reorder remains less safely reversible than individual additions. Category browsing, search refinements, dedicated promotions, wishlists, and coupons are good future API candidates. Shipping, delivery, payment, and order placement are intentionally out of scope.

## Verify a checkout-free build

```bash
npm test
npm run build
npm run test:mcp
npm run test:mcp:live
npm run test:login-wiring
npm run validate:plugin
npm run validate:mcpb
npm audit
```

The committed `dist/server.mjs` is deterministic and lets Claude Code install without relying on `npm install` inside its plugin cache. Normal Chrome login is supported; Playwright's optional WebDriver-BiDi bridge is not bundled. Custom MCPB installation is supported, but this project has not been reviewed for Anthropic's public extension directory.

Live single-product cart restoration is release-tested. The multi-line **reorder** tool remains available, but its live mutation is not release-tested because unavailable historical products or promotion-generated bonus lines cannot be proven losslessly restorable in advance. Review the past order first and prefer adding its items individually when exact reversibility matters.

The public maintainer display name is **Dany** and the GitHub account is **denya**.

MIT licensed. Based on Igor Safonov's MIT-licensed [Ametller Origen MCP extension](https://github.com/igorsafonov-gif/ametller-origen). Independent project; not affiliated with, endorsed by, or sponsored by Ametller Origen.
