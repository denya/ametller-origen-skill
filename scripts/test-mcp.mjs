// Privacy-safe MCP contract smoke. It runs the committed bundle from an isolated
// directory with no session and never touches or prints a real account/cart.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-mcp-smoke-"));
const dist = path.join(work, "dist");
fs.mkdirSync(dist);
const serverPath = path.join(dist, "server.mjs");
const serverSource = process.env.AMETLLER_SERVER_PATH || path.join(root, "dist", "server.mjs");
const artifactRoot = process.env.AMETLLER_SERVER_PATH ? dirname(dirname(serverSource)) : root;
fs.copyFileSync(serverSource, serverPath);
fs.copyFileSync(path.join(artifactRoot, "package.json"), path.join(work, "package.json"));
fs.copyFileSync(path.join(artifactRoot, "browsers.json"), path.join(work, "browsers.json"));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: {
    PATH: process.env.PATH,
    NODE_PATH: "",
    AMETLLER_SESSION_PATH: path.join(work, "state", "session.json"),
    AMETLLER_TICKET_DIR: path.join(work, "tickets"),
  },
  stderr: "inherit",
});
const client = new Client({ name: "ametller-contract-smoke", version: "0.5.2" });

async function call(name, args = {}) {
  const response = await client.callTool({ name, arguments: args });
  return { response, text: response.content?.[0]?.text || "" };
}

async function callOk(name, args = {}) {
  let result;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    result = await call(name, args);
    if (!result.response.isError) return result;
    if (attempt < 3) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
  }
  throw new Error(`${name} failed after retries: ${result.text}`);
}

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const names = new Set(listed.tools.map((tool) => tool.name));
  for (const required of [
    "ametller_auth_status",
    "ametller_login",
    "ametller_search_products",
    "ametller_get_product",
    "ametller_get_cart",
    "ametller_get_purchase_history",
    "ametller_get_order_items",
    "ametller_ingest_offline_tickets",
    "ametller_sync_offline_tickets",
    "ametller_get_offline_tickets",
    "ametller_purchase_insights",
    "ametller_add_to_cart",
    "ametller_set_quantity",
    "ametller_remove_from_cart",
    "ametller_reorder_order",
  ]) assert.ok(names.has(required), `missing MCP tool: ${required}`);
  assert.equal([...names].some((name) => /checkout|payment|place_order/i.test(name)), false);

  const resources = await client.listResources();
  const insightsResource = resources.resources.find((resource) =>
    resource.uri === "ui://ametller/purchase-insights.html");
  assert.ok(insightsResource, "missing MCP App resource");
  const appResource = await client.readResource({ uri: insightsResource.uri });
  assert.match(appResource.contents[0].mimeType, /text\/html;profile=mcp-app/);
  assert.match(appResource.contents[0].text, /Add selected to real basket/);

  const auth = await call("ametller_auth_status");
  assert.equal(JSON.parse(auth.text).signed_in, false);

  const ingested = await call("ametller_ingest_offline_tickets", {
    tickets: [{
      id: "synthetic-message-id",
      date: "2026-07-13",
      total: 1.99,
      items: [{ name: "Synthetic product", quantity: 1, unit: "ud", unit_price: 1.99, total: 1.99 }],
    }],
  });
  assert.deepEqual(JSON.parse(ingested.text), {
    received: 1,
    written: 1,
    skipped_existing: 0,
    failed: 0,
  });
  const offline = await call("ametller_get_offline_tickets", { limit: 1 });
  assert.equal(JSON.parse(offline.text).count, 1);
  const offlineSummary = JSON.parse((await call("ametller_get_offline_tickets", { summary: true })).text);
  assert.equal(offlineSummary.ticket_count, 1);
  assert.equal(offlineSummary.category_leaders[0].name, "Synthetic product");
  assert.equal("tickets" in offlineSummary, false);

  let liveCatalog = "skipped";
  if (process.env.AMETLLER_LIVE_SMOKE === "1") {
    const search = await callOk("ametller_search_products", { query: "poma", limit: 3 });
    const results = JSON.parse(search.text).results;
    assert.ok(results.length > 0);
    const product = await callOk("ametller_get_product", { product_id: String(results[0].id) });
    assert.ok(JSON.parse(product.text).id);
    liveCatalog = "pass";
  }

  const cart = await call("ametller_get_cart");
  assert.equal(cart.response.isError, true);
  assert.match(cart.text, /sign|login/i);
  const insights = await call("ametller_purchase_insights");
  assert.equal(insights.response.isError, true);
  assert.match(insights.text, /sign|login/i);
  console.log(`mcp_smoke=pass tools=${listed.tools.length} app_resource=pass gmail_ingest=pass live_catalog=${liveCatalog} registered_guard=pass`);
} finally {
  await client.close().catch(() => {});
  try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
}
