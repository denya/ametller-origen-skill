# Release scratchbook

Keep entries short and free of tokens, customer data, order contents, receipt contents, and machine-specific paths.

## Worked

- Public v0.5.2 and its Desktop asset were re-downloaded successfully; the documented SHA-256 matched and the compact summary reduced the live 240-ticket result from roughly 336 KB to 7 KB.
- The private cache has 240 small ticket files and reads all of them in about 65 ms locally; server-side aggregation is the useful optimization, not parallel file reads.
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
- The live storefront exposes official image variants, category id, orderability, units, minimums, and step quantities. The compact product mapper now surfaces those fields without claiming the placeholder stock count is real inventory.
- The deterministic bundle now embeds a standards-based MCP App resource; an isolated client discovers all 15 tools and reads the app HTML without adjacent dependencies.
- A single routed skill plus a focused analytics reference kept auth/cart safety in one place while adding frequent-product, spending, and suggestion behavior.
- A full Gmail API sync produced 227 valid private ticket files (3,228 item lines), all `0600` under a `0700` directory. Combined read-only analytics covered 229 purchases across 34 months.
- A fresh isolated Claude Code marketplace install enabled v0.3.0, and both its installed bundle and the packed MCPB started with 15 tools plus the embedded app resource. These checks did not invoke login or launch a browser.
- Final v0.3 GitHub authentication, remote read, and Git push dry-run all passed immediately before publication.
- The public v0.3.0 release asset downloaded with the documented SHA-256 and passed the isolated 15-tool/MCP-App startup smoke; public `main` resolved to the release commit.
- The completed chronological research retained the 10/30/120-day multi-scale recency model after 299 round-one and 384 round-two configurations; the runtime reuses only the selected scorer and cleaning rules.
- v0.4 tests reproduce placeholder/service-line removal, duplicate-receipt removal, same-day basket merging, online/offline exact-name joining, and both pre/post-catalog cart exclusion.
- `npm run verify`, deterministic rebuild, strict plugin validation, MCPB validation/pack, clean marketplace install, and isolated packed start all passed without browser invocation.
- Saved-session API checks passed for catalog, full order pagination/details, cart read, and combined online/offline suggestions. The authorized add/set/remove cycle restored the exact original cart fingerprint.
- Existing gitleaks history/worktree scans and dependency audit passed; no new scanner or dependency was needed.
- Public v0.4 main/tag and the exact MCPB asset were verified independently after upload; the downloaded checksum matched and the unpacked 15-tool/MCP-App server started without adjacent dependencies.
- Connected Gmail and the Ametller MCP are sibling tools; the MCP cannot call Gmail directly. A connector-first skill plus a normalized ingestion tool is the smallest portable bridge and stores no raw email body.
- v0.5's 16-tool bundle passed the full one-command gate, deterministic build, clean marketplace install, isolated MCPB start, dependency audit, and secret scan without opening a browser or reading a live mailbox.
- Public v0.5 main/tag and the customer MCPB were re-downloaded after upload; checksum and isolated connector-ingestion smoke both matched the local release artifact.

## Failed or harmful

- A Claude Desktop request asked for 200 raw tickets to answer an aggregate category question, creating a roughly 336 KB tool result while extension install/reload events recycled the local bridge. The local reader was not slow; avoid large raw results and never install or reload an extension during an active call.
- Treating the old root `manifest.json` as a Claude Code plugin manifest would be wrong; it is an MCPB manifest and must remain a separate distribution path.
- The installed extension has local uncommitted changes. Editing or resetting it would risk the working authenticated environment, so release work stays in this repo.
- A buildless Claude Code install is not viable here: source imports npm packages and marketplace installation does not run `npm install`. Commit a self-contained bundle instead.
- Bundling Playwright without exclusions failed on optional `chromium-bidi` modules. Keep only those unused Chromium-BiDi imports external and prove ordinary Chrome login from the final bundle.
- An earlier bundled-login attempt failed before Chrome opened because Playwright dynamically requires Node built-ins and the ESM bundle lacked `createRequire`. Keep the ESM banner for real user-initiated login, but verify packaging statically without calling login.
- A historical browser-reaching login smoke hit the MCP client's timeout and also opened an unwanted separate Chrome window. Never rerun browser login as an automated smoke; use the saved session for API E2E and the no-browser wiring test for packaging.
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
- The first MCP App bundle failed because IIFE output cannot contain top-level await. Use a promise-based `app.connect()` so the browser bundle stays a self-contained IIFE.
- The first live v0.3 insights read hit transient storefront connection refusal. No cart write ran; keep the authenticated live gate open and keep CLI failures generic instead of printing network stacks.
- The first live Gmail receipt sync failed because the Google Workspace CLI network request could not connect before any ticket was written. A later full sync passed and is recorded above; keep the transient failure here so a network error is not mistaken for an auth/parser defect.
- A packaged-login smoke that invokes `ametller_login` is a negative effect: it launches a separate Chrome window and can navigate unexpectedly during tests. Replace it with tool discovery, fresh-state auth-status, adjacent-browser-metadata, and zero-state-write assertions; only genuine user-initiated authorization may open Chrome.
- The first static browser guard scanned only `src/*.mjs` for two patterns, so scripts, tests, indirect login calls, and OS openers could bypass it. Scan every executable source/test file plus package test/E2E commands, with explicit allowlists only for the user-initiated auth path.
- The first v0.3 publication preflight authenticated `gh` and read the remote HEAD, then the separate Git push dry-run hit a transient connection refusal. Recheck the actual Git push path immediately before publication; do not infer it from API auth or an earlier remote read.
- An early suggestion run incorrectly kept the oldest observed receipt price, which allowed two stale-price matches. Track the newest price by purchase date instead. With that fix, all current top-12 suggestions remain unresolved and unselectable rather than silently mapping to a changed or wrong product.
- GitHub rejected a short commit id as `Release.target_commitish`; use `main` or a full commit id when creating the release.
- The intuitive median-cadence ranker lost to multi-scale recency on the untouched chronological holdout. Do not reintroduce cadence without new out-of-sample evidence.
- Inventory proxies, adaptive decay, family boosts/caps, and feature ensembles did not beat the simpler default robustly. Purchase history does not reveal current pantry stock.
- An offline suggestion could resolve to an already-carted product only after live catalog lookup. Apply cart-id exclusion again after resolution, not just before ranking.
- Protein rotation improves family coverage but slightly worsens exact-product metrics. Keep it explicit and never relabel it as the best general predictor.
- Making the Dennis-specific `gws` process the default imposed Python, CLI installation, and separate Google authentication on normal customers. Keep it only as an optional automation fallback.

## Open observations

- Live reorder is intentionally skipped: historical multi-line batches can activate unavailable-product or promotional/bonus-line behavior that the simple canonical snapshot cannot prove losslessly restorable in advance. The reorder path was audited; the supported limitation is safer than speculating about batch atomicity.
