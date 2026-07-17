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
const client = new Client({ name: "ametller-contract-smoke", version: "0.5.3" });

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
  assert.deepEqual(client.getServerVersion(), { name: "ametller", version: "0.5.3" });
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
    "ametller_preview_reorder",
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

  const pageFixtures = Array.from({ length: 200 }, (_, index) => ({
    id: `pagination-${String(index).padStart(3, "0")}`,
    date: `2026-06-${String((index % 28) + 1).padStart(2, "0")}`,
    total: 12,
    items: Array.from({ length: 6 }, (_unused, itemIndex) => ({
      name: `Synthetic pagination product ${index}-${itemIndex}`,
      quantity: 1,
      unit: "ud",
      unit_price: 2,
      total: 2,
    })),
  }));
  for (let start = 0; start < pageFixtures.length; start += 50) {
    const batch = await call("ametller_ingest_offline_tickets", { tickets: pageFixtures.slice(start, start + 50) });
    assert.equal(JSON.parse(batch.text).written, 50);
  }
  const boundedRaw = await call("ametller_get_offline_tickets", { limit: 200 });
  const firstPage = JSON.parse(boundedRaw.text);
  assert.equal(firstPage.count, 5);
  assert.equal(firstPage.total, 201);
  assert.equal(firstPage.page_limit, 5);
  assert.equal(firstPage.requested_limit, 200);
  assert.equal(firstPage.has_more, true);
  assert.equal(firstPage.next_offset, 5);
  assert.ok(Buffer.byteLength(boundedRaw.text) < 64 * 1024, "raw ticket page exceeded the 64 KiB bridge budget");
  const secondPage = JSON.parse((await call("ametller_get_offline_tickets", {
    limit: 200,
    offset: firstPage.next_offset,
    include_items: false,
  })).text);
  assert.equal(secondPage.offset, 5);
  assert.equal(secondPage.count, 5);
  assert.equal(secondPage.next_offset, 10);
  assert.equal(secondPage.tickets.some((ticket) => firstPage.tickets.some((first) => first.id === ticket.id)), false);

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
  console.log(`mcp_smoke=pass version=${client.getServerVersion().version} tools=${listed.tools.length} app_resource=pass gmail_ingest=pass ticket_page_guard=pass live_catalog=${liveCatalog} registered_guard=pass`);
} finally {
  await client.close().catch(() => {});
  try { fs.rmSync(work, { recursive: true, force: true }); } catch {}
}
