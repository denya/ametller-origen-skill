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

No checkout or payment command exists.
