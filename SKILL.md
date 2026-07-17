---
name: ametller-origen
description: Use Ametller Origen's live catalog and authenticated basket API, inspect online order history, and sync offline store tickets from Gmail. Use for Ametller product search, receipt matching, cart reads or explicit cart changes, browser authorization, buy-again analysis, and offline-vs-online purchase history.
---

# Ametller Origen

This repository includes a modular Salesforce Commerce API client, MCP server, CLI, browser login, and Gmail receipt sync.

## Safety

- Catalog and receipt research are read-only. Only mutate the real basket when the user explicitly asks.
- Never checkout, pay, select delivery, or enter payment information.
- Never ask the user to paste a password, one-time code, access token, or refresh token into chat.
- Never print, upload, or commit `~/.ametller/session.json` or synced receipts.
- Use the browser only to establish or renew authorization. Catalog, orders, statistics, tickets, and every basket read/write must use the API client or Gmail API workflow, never browser UI automation or scraping.
- Match products by name, brand, size, and price. A matching price alone is not enough.
- If the exact product is absent online, say so. Do not silently substitute another format or brand.

## Route the task

- Authentication or expired tokens: read [references/authentication.md](references/authentication.md).
- Search, product matching, or basket changes: read [references/catalog-and-cart.md](references/catalog-and-cart.md).
- API endpoints or online order history: read [references/api.md](references/api.md).
- Offline tickets, Gmail sync, or purchase comparison: read [references/receipts.md](references/receipts.md).
- Frequent products, spending charts, grouping, or smart basket suggestions: read [references/analytics.md](references/analytics.md).

## Commands

Run from this repository:

```bash
npm run login
npm run cli -- search 'quefir natural'
npm run cli -- product 10022
npm run cli -- cart
npm run cli -- add 10022 1
npm run cli -- set 10022 2
npm run cli -- remove 10022
npm run cli -- orders
npm run cli -- orders all
npm run cli -- order
npm run cli -- tickets 50
npm run cli -- insights 12
npm run cli -- suggestions 12
npm run tickets:sync -- --overwrite
```

Guest catalog commands work without login. Basket and order commands require a registered browser session.

When the user asks to see a product, include its official link and image. In artifact sandboxes that block remote images, download the image and embed it as base64. `ametller_purchase_insights` is the exception: it already supplies the official MCP App view in supporting clients.
