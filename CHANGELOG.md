# Changelog

## 0.5.0 — 2026-07-17

- Add connector-first offline-ticket ingestion through Claude's existing Gmail integration.
- Keep the Python/`gws` workflow as an optional local automation fallback.

## 0.4.0 — 2026-07-17

- Replace cadence-based suggestions with the chronologically backtested 10/30/120-day repeat-purchase ranker.
- Clean placeholders/service lines, remove exact duplicate receipts, merge same-day prediction baskets, and exclude the current cart.
- Add an explicitly experimental protein-rotation mode and keep novelty as a separate live-catalog workflow.
- Explain the research, reusable integration harness, and human jobs-to-be-done.
- Add `npm run verify` as the one-command checkout-free packaging gate.

## 0.3.0 — 2026-07-17

- Add combined online/offline purchase analytics, private Gmail ticket sync, and official product images.
- Add the Claude Desktop MCP App with an explicit approval step before cart additions.
- Publish deterministic Claude Code and MCPB packaging with API-only tests and no checkout surface.
