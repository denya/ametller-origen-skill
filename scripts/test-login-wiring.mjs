// Validate the packaged login tool without calling it or launching a browser.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const root = dirname(dirname(fileURLToPath(import.meta.url)));
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-login-wiring-"));
const dist = path.join(work, "dist");
const sessionPath = path.join(work, "state", "session.json");
fs.mkdirSync(dist);
const serverPath = path.join(dist, "server.mjs");
fs.copyFileSync(path.join(root, "dist", "server.mjs"), serverPath);
fs.copyFileSync(path.join(root, "package.json"), path.join(work, "package.json"));
fs.copyFileSync(path.join(root, "browsers.json"), path.join(work, "browsers.json"));

const transport = new StdioClientTransport({
  command: process.execPath,
  args: [serverPath],
  env: {
    PATH: process.env.PATH,
    NODE_PATH: "",
    AMETLLER_SESSION_PATH: sessionPath,
    AMETLLER_BROWSER_CHANNEL: "chrome",
  },
  stderr: "inherit",
});
const client = new Client({ name: "ametller-login-wiring", version: "0.4.0" });

try {
  await client.connect(transport);
  const listed = await client.listTools();
  const login = listed.tools.find((tool) => tool.name === "ametller_login");
  assert.ok(login, "packaged login tool is missing");
  assert.match(login.description, /browser window|sign in/i);
  assert.deepEqual(login.inputSchema.required || [], []);
  assert.equal(fs.existsSync(path.join(work, "browsers.json")), true);

  const status = await client.callTool({ name: "ametller_auth_status", arguments: {} });
  assert.equal(status.isError, undefined);
  assert.equal(JSON.parse(status.content?.[0]?.text || "{}").signed_in, false);
  assert.equal(fs.existsSync(sessionPath), false, "wiring test must not create auth state");
  console.log("packaged_login_wiring=pass browser_launch=not_attempted state_write=none");
} finally {
  await client.close().catch(() => {});
  fs.rmSync(work, { recursive: true, force: true });
}
