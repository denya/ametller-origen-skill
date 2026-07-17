# Release workload

- [x] Inspect the public repo, installed extension, and Glovo install baseline without modifying live state.
- [x] Package as a current Claude Code plugin and self-hosted marketplace entry.
- [x] Package the same server as a separate Claude Desktop `.mcpb` bundle.
- [x] Validate manifests and perform clean, isolated install/start smoke tests.
- [x] Audit and test login, secure token rotation, guest catalog, orders, cart, and Gmail tickets; document the evidenced live-reorder limitation.
- [x] Snapshot the live cart, run authorized API-only add/set/remove E2E, and prove exact restoration.
- [x] Run tests, dependency/security/privacy scans, commit, and push the verified release.

## v0.3 analytics workload

- [x] Map live catalog/order fields and confirm offline POS tickets are absent from SCAPI.
- [x] Add private Gmail ticket sync/read MCP tools and a shared normalized analytics layer.
- [x] Add frequency, monthly/category spend, official images/availability, and conservative smart suggestions.
- [x] Embed an explicit-approval MCP App and prove it is discoverable from an isolated server.
- [x] Add regression tests and local installation/testing guidance.
- [x] Replace the browser-launching bundle-login smoke with a no-browser packaged-wiring test.
- [x] Expand the no-browser guard across source, scripts, tests, and package test/E2E entrypoints.
- [x] Re-run authenticated read-only insights when storefront networking is stable.
- [x] Prove full Gmail sync, a clean Claude Code marketplace install, and an isolated packed-MCPB start without launching a browser.
- [ ] Visually confirm the MCP App after the user installs the packed v0.3 MCPB in Claude Desktop.
- [x] Commit and publish the verified combined update.
