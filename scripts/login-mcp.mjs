// Exercise browser login through the final self-contained MCP bundle.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const sessionPath = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-login-smoke-"));
const dist = path.join(work, "dist");
fs.mkdirSync(dist);
const serverPath = path.join(dist, "server.mjs");
fs.copyFileSync(path.join(root, "dist", "server.mjs"), serverPath);
fs.copyFileSync(path.join(root, "package.json"), path.join(work, "package.json"));
fs.copyFileSync(path.join(root, "browsers.json"), path.join(work, "browsers.json"));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: { PATH: process.env.PATH, NODE_PATH: "", AMETLLER_SESSION_PATH: sessionPath, AMETLLER_BROWSER_CHANNEL: "chrome" },
  stderr: "inherit",
});
const client = new Client({ name: "ametller-login-smoke", version: "0.2.0" });

try {
  await client.connect(transport);
  const login = await client.callTool(
    { name: "ametller_login", arguments: {} },
    undefined,
    { timeout: 6 * 60_000, maxTotalTimeout: 6 * 60_000 },
  );
  assert.ok(!login.isError, login.content?.[0]?.text || "bundled login failed");
  const status = await client.callTool({ name: "ametller_auth_status", arguments: {} });
  assert.ok(!status.isError);
  assert.equal(JSON.parse(status.content?.[0]?.text || "{}").signed_in, true);
  console.log("bundled_chrome_login=pass authenticated_status=pass");
} finally {
  await client.close().catch(() => {});
  try { fs.unlinkSync(serverPath); } catch {}
  try { fs.unlinkSync(path.join(work, "package.json")); } catch {}
  try { fs.unlinkSync(path.join(work, "browsers.json")); } catch {}
  try { fs.rmdirSync(dist); } catch {}
  try { fs.rmdirSync(work); } catch {}
}
