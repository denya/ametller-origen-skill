# Purchase analytics and smart basket suggestions

Use `ametller_purchase_insights` for a combined view of complete online order history and any privately cached offline Gmail tickets. It returns structured data in every MCP client and an interactive MCP App in Claude Desktop.

The analysis includes:

- spend and shop count by source;
- monthly spend from actual order/receipt totals;
- frequent products and quantities;
- category spend from item lines;
- due-again suggestions based on observed purchase cadence;
- current official catalog links, images, prices, and orderability for resolved suggestions.

Offline receipts have no catalog product id or taxonomy. Their categories are explicitly marked as name-based estimates. An offline suggestion is selectable only when the live catalog has a strong name match and a compatible current price. Never silently substitute an unresolved line.

The interactive view starts with no products selected. Checking products changes only local UI state. The real basket changes only after the user presses **Add selected to real basket**. That button calls the existing add tool; there is still no checkout, delivery, payment, or order-placement operation.

CLI equivalents:

```bash
npm run cli -- insights 12
npm run cli -- suggestions 12
```

Suggestions are a convenience, not a forecast of need. Explain sparse history, heuristic categories, unresolved ticket matches, or unavailable products rather than pretending certainty.
