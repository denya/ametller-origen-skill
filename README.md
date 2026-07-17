# Ametller Origen skill and MCP

Open Claude integration for Ametller Origen's live catalog, online orders, real cart, and optional offline Gmail tickets. It intentionally has no checkout, payment, delivery-slot, or order-placement tool. Chrome is used only to establish authorization; all catalog, order, and cart operations use the API and never drive or scrape the shopping website.

## Claude Code

Requires current [Claude Code](https://code.claude.com/docs/en/setup), Node.js 18 or newer, and installed Google Chrome.

```bash
claude plugin marketplace add denya/ametller-origen-skill
claude plugin install ametller-origen@dany-grocery
```

Start or reload Claude Code, then ask for Ametller Origen or invoke `/ametller-origen:ametller-origen`. The MCP server starts automatically. On the first account action Claude opens the official Ametller login in Chrome; enter credentials and 2FA only in that browser. After the login response is captured, Chrome closes and normal operations use the direct API.

Claude Code stores the browser-created session in its persistent private plugin-data directory, not in the versioned plugin cache. Uninstall with `--keep-data` if you want to preserve that authorization.

## Claude Desktop

Download the released installer:

**[Download Ametller Origen v0.2.0 for Claude Desktop (.mcpb)](https://github.com/denya/ametller-origen-skill/releases/download/v0.2.0/ametller-origen-0.2.0.mcpb)**

[Release notes and checksum](https://github.com/denya/ametller-origen-skill/releases/tag/v0.2.0)

1. Download the `.mcpb` file from the link above.
2. Open Claude Desktop on macOS.
3. Go to **Settings → Extensions → Advanced settings → Install Extension…**.
4. Select `ametller-origen-0.2.0.mcpb` and approve the installation.
5. Ask Claude to use Ametller Origen. Chrome opens only when account authorization is needed.

![Ametller Origen cart review and product card in Claude Desktop](docs/claude-desktop-example.png)

This release targets Claude Desktop on macOS. The bundle is self-contained; Chrome is required for browser sign-in. Desktop state is kept in `~/.ametller/session.json` with mode `0600`.

To build the same bundle from source instead:

```bash
git clone https://github.com/denya/ametller-origen-skill.git
cd ametller-origen-skill
npm ci
npm run pack:mcpb
```

## CLI and offline tickets

For local development or direct use:

```bash
npm ci
npm run build
npm run login
npm run cli -- search 'quefir natural'
npm run cli -- cart
npm run cli -- orders all
```

Offline store tickets are separate from SCAPI online orders. With the authenticated `gws` Google Workspace CLI on `PATH`:

```bash
npm run tickets:sync -- --overwrite
```

Tickets default to `~/.ametller/tickets` with private directory/file modes. This ticket workflow is available to the agent skill/CLI, not as a Claude Desktop MCP tool.

## Verify a checkout-free build

```bash
npm test
npm run build
npm run test:mcp
npm run test:mcp:live
npm run validate:plugin
npm run validate:mcpb
npm audit
```

The committed `dist/server.mjs` is deterministic and lets Claude Code install without relying on `npm install` inside its plugin cache. Normal Chrome login is supported; Playwright's optional WebDriver-BiDi bridge is not bundled. Custom MCPB installation is supported, but this project has not been reviewed for Anthropic's public extension directory.

Live single-product cart restoration is release-tested. The multi-line **reorder** tool remains available, but its live mutation is not release-tested because unavailable historical products or promotion-generated bonus lines cannot be proven losslessly restorable in advance. Review the past order first and prefer adding its items individually when exact reversibility matters.

The public maintainer display name is **Dany** and the GitHub account is **denya**.

MIT licensed. Based on Igor Safonov's MIT-licensed [Ametller Origen MCP extension](https://github.com/igorsafonov-gif/ametller-origen). Independent project; not affiliated with, endorsed by, or sponsored by Ametller Origen.
