# Release hypotheses

| ID | Result | Evidence |
|---|---|---|
| H1 | Proven | One deterministic server bundle passes strict Claude plugin validation, MCPB validation/packing, and isolated starts. |
| H2 | Proven | A live forced SLAS refresh rotated and persisted the session; regression tests enforce atomic `0600` storage. |
| H3 | Proven | Live full history/details and deterministic multi-page/repeated-page tests pass. |
| H4 | Proven for simple existing baskets | API-only add/set/remove returned to the exact original canonical state and salted fingerprint. Reads never create an absent basket; mutation refuses that unrestorable case. |
| H5 | Confirmed | SCAPI supplies online orders. Offline POS tickets come from a separate private Gmail API workflow, now exposed through MCP without claiming they came from SCAPI. |
| H6 | Proven, with installer nuance | A source tree without `node_modules` installed and started the committed bundle. Current Claude Code may still install package dependencies into its private cache. |
| H7 | Proven locally | Offline POS tickets are not exposed by the shopper APIs; the existing Gmail parser is the smallest source and is now callable from MCP. |
| H8 | Proven by tests/smoke | One normalized event model can combine source-labelled online orders and offline tickets for frequency, monthly/category spend, and cadence suggestions without exposing raw payloads. |
| H9 | Proven by static and MCP contract tests | The MCP App is embedded in the deterministic server bundle, renders only after the insights tool, and can call the existing cart tool only inside the visible approval button handler. |
| H10 | Proven after transient failures | Authenticated API-only insights and the full Gmail ticket sync completed without a browser; the design tolerates unresolved catalog matches rather than guessing. |
