# Release hypotheses

| ID | Result | Evidence |
|---|---|---|
| H1 | Proven | One deterministic server bundle passes strict Claude plugin validation, MCPB validation/packing, and isolated starts. |
| H2 | Proven | A live forced SLAS refresh rotated and persisted the session; regression tests enforce atomic `0600` storage. |
| H3 | Proven | Live full history/details and deterministic multi-page/repeated-page tests pass. |
| H4 | Proven for simple existing baskets | API-only add/set/remove returned to the exact original canonical state and salted fingerprint. Reads never create an absent basket; mutation refuses that unrestorable case. |
| H5 | Confirmed | SCAPI supplies online orders. Offline POS tickets remain an isolated Gmail CLI workflow with private files and tests. |
| H6 | Proven, with installer nuance | A source tree without `node_modules` installed and started the committed bundle. Current Claude Code may still install package dependencies into its private cache. |
