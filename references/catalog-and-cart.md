# Catalog and basket

## Find the correct product

1. Search with a short Catalan phrase.
2. Inspect the strongest candidates with `product <id>`.
3. Match name, brand, package size or weight, and price.
4. For a receipt match, treat the receipt description and price as evidence, not as a substitute for package identity.
5. If the exact pack is not returned by the live catalog, report it as unavailable or store-only.

```bash
npm run cli -- search 'pernil duroc 80g'
npm run cli -- product 17302
```

Never invent a product id.

## Read and mutate the basket

Read the live basket before conditional requests such as “add if absent”:

```bash
npm run cli -- cart
```

Use `add` when the user wants additional units. Use `set` when the requested quantity is an exact target.

```bash
npm run cli -- add 17302 1
npm run cli -- set 17302 2
npm run cli -- remove 17302
```

After every mutation, verify the returned line quantity and basket total. Discounts can change the basket total by more than the added line price.

## Repeat a past order safely

1. Call `ametller_preview_reorder` with the past order id (or omit it for the latest order).
2. Show the current-catalog validated lines and every rejected unavailable, unresolved, promotion/bonus, or incompatible-pack line.
3. Ask the user which exact validated lines and quantities to add. Do not interpret approval of the old order as approval of a changed preview.
4. Call `ametller_reorder_order` with that exact subset and `confirm: true`.

The apply step revalidates again, snapshots the existing simple basket, verifies additions, and restores the snapshot if an attempted write fails. It refuses an absent or complex basket that cannot be proven losslessly restorable. Reorder only adds basket lines; it never places an order.

No checkout or payment command exists.
