import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

test("browser automation stays confined to login", () => {
  const walk = (directory) => fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.name.endsWith(".mjs") ? [path.relative(root, absolute)] : [];
  });
  const sourceFiles = walk(path.join(root, "src"));
  const browserUsers = sourceFiles.filter((file) =>
    /(?:from|import\()\s*["']playwright-core|chromium\.launch/.test(fs.readFileSync(path.join(root, file), "utf8")),
  );
  assert.deepEqual(browserUsers, ["src/auth/login.mjs"]);
});

test("interactive suggestions require a visible click before a cart tool call", () => {
  const source = fs.readFileSync(path.join(root, "src", "insights-app.js"), "utf8");
  assert.equal((source.match(/callServerTool/g) || []).length, 1);
  const click = source.indexOf('button.addEventListener("click"');
  const mutation = source.indexOf("app.callServerTool");
  assert.ok(click >= 0 && mutation > click, "cart tool call must stay inside the approval click handler");
  assert.match(source, /Add selected to real basket/);
});

test("packaged login verification never invokes the browser login tool", () => {
  const source = fs.readFileSync(path.join(root, "scripts", "test-login-wiring.mjs"), "utf8");
  assert.doesNotMatch(source, /callTool\(\s*\{\s*name:\s*["']ametller_login/);
  assert.match(source, /browser_launch=not_attempted/);
});
