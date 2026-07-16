# Offline and online purchase history

## Offline store tickets from Gmail

Ametller sends in-store digital receipts with a subject matching:

```text
Ametller Origen - El teu tiquet digital
```

With an authenticated Google Workspace CLI (`gws`) on `PATH`, sync and parse them locally:

```bash
npm run tickets:sync -- --overwrite
```

The default destination is `~/.ametller/tickets`. Override it with `--tickets-dir` or `AMETLLER_TICKET_DIR`.

Useful checks:

```bash
rg -n -i 'quefir|pernil|foie' ~/.ametller/tickets
jq -r '.date, .store, .totalAmount' ~/.ametller/tickets/*.json
```

Receipt files can contain purchase history and store locations. Keep them local; their default and common output paths are ignored by Git.

## Online orders from SCAPI

```bash
npm run cli -- orders
npm run cli -- order             # latest
npm run cli -- order ORDER_NUMBER
```

These are online orders only. No supported Ametller shopper API for offline POS tickets has been identified, so do not merge the two histories or claim that SCAPI is complete.

## Matching a receipt line to the live catalog

Search the full receipt name first, then shorter distinctive terms. Confirm package size and brand, compare the current price, and show the image when identity is uncertain. If the exact line is absent online, label it store-only or currently unavailable rather than selecting a same-price substitute.
