// Dev smoke test: drive the built server through the real MCP protocol (the same
// stdio JSON-RPC Claude Desktop uses), against the real signed-in session.
// Does a reversible cart write round-trip (add -> read -> remove) on the real basket.
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SESSION = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [`${ROOT}/dist/server.mjs`],
  env: { PATH: process.env.PATH, AMETLLER_SESSION_PATH: SESSION },
  stderr: "inherit",
});

const client = new Client({ name: "test-harness", version: "0" });
await client.connect(transport);

const { tools } = await client.listTools();
console.log("TOOLS:", tools.map((t) => t.name).join(", "));

async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  const trimmed = text.length > 700 ? text.slice(0, 700) + "\n  …(trimmed)" : text;
  console.log(`\n# ${name}(${JSON.stringify(args)})${r.isError ? "  [isError]" : ""}\n${trimmed}`);
  return text;
}

await call("auth_status");
const search = await call("search_products", { query: "llet", limit: 3 });
const pid = JSON.parse(search).results?.[0]?.id;
await call("get_product", { product_id: pid });
await call("get_cart");
await call("add_to_cart", { product_id: pid, quantity: 1 });
await call("get_cart");
await call("remove_from_cart", { product_id: pid }); // clean up — leave the real cart as we found it
await call("get_cart");
await call("get_purchase_history", { page: 1 });

await client.close();
console.log("\n✓ MCP round-trip complete (real cart left clean)");
