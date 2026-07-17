# Release scratchbook

Keep entries short and free of tokens, customer data, order contents, receipt contents, and machine-specific paths.

## Worked

- Public worktree started clean; the installed extension was inspected read-only and its local session-persistence improvements already exist in this repo.
- Current official packaging separates Claude Code plugins from Claude Desktop MCP Bundles.
- Existing Git credentials can fetch and dry-run push this repository even though the separate GitHub CLI token is stale.
- The live session file permission was repaired from `0644` to `0600` without reading or rewriting its contents.
- A clean local Claude marketplace add/install started the deterministic MCP bundle destined for this commit; a packed MCPB also started from an isolated unpack directory.
- The existing authorized Chrome session was used only to capture the registered OAuth response. Guest catalog, registered cart, full order history/details, and all cart writes were verified through API/MCP calls only.
- A forced live token refresh rotated and persisted the registered session at `0600`; no token values were emitted.
- The live API cart cycle added an absent product, set its quantity, removed it, and restored the exact original canonical state and salted fingerprint.
- A shared read/write split now guarantees `getCart()` cannot create an empty basket. Unit tests prove the no-basket read issues no POST, and live mutation refuses an originally absent basket.
- Final `gh` authentication, Git remote read, and Git push dry-run all passed immediately before publication.

## Failed or harmful

- Treating the old root `manifest.json` as a Claude Code plugin manifest would be wrong; it is an MCPB manifest and must remain a separate distribution path.
- The installed extension has local uncommitted changes. Editing or resetting it would risk the working authenticated environment, so release work stays in this repo.
- A buildless Claude Code install is not viable here: source imports npm packages and marketplace installation does not run `npm install`. Commit a self-contained bundle instead.
- Bundling Playwright without exclusions failed on optional `chromium-bidi` modules. Keep only those unused Chromium-BiDi imports external and prove ordinary Chrome login from the final bundle.
- The first isolated bundled-login attempt failed before Chrome opened because Playwright dynamically requires Node built-ins and the ESM bundle lacked `createRequire`. Add an ESM `createRequire` banner and keep the bundled-login regression smoke.
- The first browser-reaching login smoke hit the MCP client's default 60-second request timeout. Give only the interactive login call a six-minute timeout; ordinary tools retain normal limits.
- A combined validation run reached the isolated MCP server but live guest search failed after three retries with `fetch failed`. Keep deterministic MCP startup separate from the explicit live smoke and do not mutate a real cart while the network is unstable.
- Omitting the Claude plugin version enables commit-SHA updates per the docs, but current `claude plugin validate --strict` treats the omission as an error-level warning. Version the plugin and bump it on every release.
- An early `gh` check reported an invalid API token while Git access remained separate; the required final recheck later showed both `gh` and Git network authentication healthy.
- The final bundle also needs Playwright's generated `browsers.json` beside it; without that file the ordinary Chrome channel cannot initialize.
- The first live read-only rerun hit transient connection refusals. No cart mutation ran during that failure; the bounded retry, live MCP smoke, full read gate, and mutation later passed on stable API connectivity.
- Product detail responses use `id` in this deployment, while the first assertion expected `productId`; the regression now accepts the API's documented shape without weakening the actual-object check.
- MCPB validation emits a generic 512×512 recommendation even though the existing icon is already 512×512; it is accepted and not a release blocker.
- Current Claude Code populated its private installed-plugin cache with dependencies even though the marketplace source was clean. The plugin still points to the deterministic committed bundle and does not depend on that installer behavior.
- A broad secret scan flagged Playwright's bundled RFC WebSocket sample nonce as a generic API key. The narrow file/rule/line fingerprint is documented in `.gitleaksignore`; source, history, and the remaining bundle still scan cleanly.
- Final privacy review found raw SCAPI/OAuth/browser error details could reach MCP or CLI output. Error bodies, redirect URLs, browser paths, and unknown exception text are now suppressed, with regression tests for API and OAuth failures.

## Open observations

- Live reorder is intentionally skipped: historical multi-line batches can activate unavailable-product or promotional/bonus-line behavior that the simple canonical snapshot cannot prove losslessly restorable in advance. The reorder path was audited; the supported limitation is safer than speculating about batch atomicity.
