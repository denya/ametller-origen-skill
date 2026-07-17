# Reusable shop/API integration harness

This is the smallest workflow that produced a public, installable grocery integration without weakening auth, privacy, or cart safety.

## Workflow

1. **Start durable notes.** Keep `TODO.md` as gates, `HYPOTHESES.md` as falsifiable claims, and `SCRATCHBOOK.md` as concise positive and negative evidence.
2. **Audit the real API read-only.** Map guest catalog/search/details, authenticated order pagination/details, existing-cart reads, and every pre-checkout capability. Separate absent endpoints from untested guesses.
3. **Design auth and state.** Let a user initiate browser authorization, then persist rotated refresh state atomically in a `0700` directory and `0600` file. Normal operations stay API-only.
4. **Separate offline evidence.** If store receipts live in Gmail rather than commerce history, sync them into a private cache through the Gmail API. Never imply SCAPI returned them.
5. **Normalize before analytics.** Remove placeholders/service lines, deduplicate receipts, merge same-day baskets, preserve source labels, and never commit raw customer data.
6. **Evaluate recommendations chronologically.** Begin with frequency/recency baselines, reserve an untouched final time block, report repeat versus novel behavior, and prefer the simplest model within uncertainty.
7. **Keep approval at the mutation boundary.** Read and rank first. Resolve exact current catalog products. Let an interactive picker change only local selection state until a visible approval invokes the existing cart tool.
8. **Package one deterministic runtime.** Point the Claude Code plugin and separate MCPB manifest to the same committed stdio bundle. Do not rely on marketplace installation running `npm install`.
9. **Verify in isolation.** Test without adjacent dependencies or user state, validate manifests with official tooling, start the packed artifact, and statically forbid browser automation outside the explicit auth implementation.
10. **Run live E2E safely.** Snapshot/fingerprint the existing cart, mutate only with an explicit environment gate, restore in `finally` with bounded retries, and assert exact semantic restoration. Never expose checkout/payment/order placement.
11. **Scan and publish.** Run unit/contract tests, dependency audit, secret/history/privacy scans, deterministic rebuild comparison, Git remote checks, then push and verify the public asset/checksum.

## Five things that worked

1. A single API client shared by CLI, MCP tools, E2E, analytics, and the app prevented contract drift.
2. Atomic token rotation plus `0600` load migration made authorization durable without bundling secrets.
3. Purchase-day cleaning and chronological rolling-origin evaluation turned a vague “smart basket” into an evidenced model choice.
4. Conservative id or name-plus-price catalog resolution kept ambiguous offline products visible but unselectable.
5. One deterministic bundle supported both Claude Code and MCPB, while the interactive app reused the same explicitly approved cart tool.

## Five failures or negative effects to avoid

1. Automated login smoke tests opened unwanted browser windows. Package tests must inspect wiring without invoking login.
2. A supposedly read-only cart call created an empty basket. Separate read-existing from ensure/create-for-write at the API root.
3. Bundling all Playwright dependencies failed or bloated the package. Exclude only proven optional Chromium-BiDi modules and keep `node_modules` out of MCPB.
4. Median cadence looked intuitive but lost chronological holdout evaluation. Do not ship a narrative feature because it “feels smart.”
5. Broad product clusters and price-only matching caused unsafe substitutions. Exact pack/name/id must dominate; uncertain matches need user review.

## Release checklist

```text
tests + deterministic build
strict Claude plugin validation
MCPB validate + pack + isolated start
dependency audit
secret, history, and privacy scans
API-only authenticated read smoke
no-browser boundary regression
env-gated cart snapshot -> add -> set -> remove -> exact restore
clean main -> push -> public asset/checksum verification
```

