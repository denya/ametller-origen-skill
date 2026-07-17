# Purchase analytics and smart basket suggestions

Use `ametller_purchase_insights` for a combined view of complete online order history and any privately cached offline Gmail tickets. It returns structured data in every MCP client and an interactive MCP App in Claude Desktop.

The analysis includes:

- spend and shop count by source;
- monthly spend from actual order/receipt totals;
- frequent products and quantities;
- category spend from item lines;
- repeat-purchase suggestions from the validated 10/30/120-day recency model;
- current official catalog links, images, prices, and orderability for resolved suggestions.

Before prediction, the shared layer removes known placeholders/service lines, deduplicates exact receipts, merges same-day receipts, and excludes current API-cart ids and names. Offline receipts have no catalog product id or taxonomy. Their categories are explicitly marked as name-based estimates. An offline suggestion is selectable only when the live catalog has a strong name match and a compatible current price. Never silently substitute an unresolved line.

The default `repeat` mode is the exact-product model selected by chronological holdout evaluation. `protein-rotation` is an explicit experimental meal-planning mode: it improved protein-family recall but slightly reduced exact-product Precision/NDCG. Do not present it as more accurate overall.

Repeat prediction cannot infer a genuinely unseen product. For “something new,” local products, an unfamiliar sausage, or Spanish fruit discovery, search the live catalog as a separate content/exploration task and explain the difference.

The interactive view starts with no products selected. Checking products changes only local UI state. The real basket changes only after the user presses **Add selected to real basket**. That button calls the existing add tool; there is still no checkout, delivery, payment, or order-placement operation.

CLI equivalents:

```bash
npm run cli -- insights 12
npm run cli -- suggestions 12
npm run cli -- suggestions 12 protein-rotation
```

Scores are relative ranks, not calibrated probabilities or proof of need. Explain sparse history, heuristic categories, unresolved ticket matches, or unavailable products rather than pretending certainty. See `docs/NEXT-BASKET-RESEARCH.md` for the full audit.
