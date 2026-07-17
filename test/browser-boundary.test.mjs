import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const guardFile = "test/browser-boundary.test.mjs";

function executableFiles(directory) {
  if (!fs.existsSync(directory)) return [];
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) return executableFiles(absolute);
    return /\.(?:[cm]?js|tsx?|py|sh)$/.test(entry.name) ? [path.relative(root, absolute)] : [];
  });
}

test("browser automation stays confined to explicit user-initiated auth", () => {
  const files = ["src", "scripts", "test", "tests"]
    .flatMap((directory) => executableFiles(path.join(root, directory)))
    .filter((file) => file !== guardFile);
  const source = new Map(files.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
  const rules = [
    {
      name: "browser automation library",
      pattern: /(?:from\s*|import\s*\()\s*["'](?:playwright(?:-core)?|puppeteer|selenium)["']|require\(\s*["'](?:playwright(?:-core)?|puppeteer|selenium)["']\s*\)/,
      allowed: ["src/auth/login.mjs"],
    },
    {
      name: "browser launch or navigation",
      pattern: /\b(?:chromium|firefox|webkit)\.(?:launch|launchPersistentContext|connectOverCDP)\s*\(|\b(?:page\.goto|browser\.newContext|context\.newPage)\s*\(/,
      allowed: ["src/auth/login.mjs"],
    },
    {
      name: "login implementation import",
      pattern: /\b(?:(?:from\s*|import\s*\()\s*["'][^"']*auth\/login\.mjs["']|require\(\s*["'][^"']*auth\/login\.mjs["']\s*\))/,
      allowed: ["scripts/login.mjs", "src/server.mjs"],
    },
    {
      name: "runLogin call",
      pattern: /\brunLogin\s*\(/,
      allowed: ["scripts/login.mjs", "src/auth/login.mjs", "src/server.mjs"],
    },
    {
      name: "automated ametller_login tool call",
      pattern: /(?:\b(?:callTool|callServerTool)\s*\(\s*\{[\s\S]{0,160}?\bname\s*:\s*|\b(?:call|callOk)\s*\()\s*["']ametller_login["']/,
      allowed: [],
    },
    {
      name: "indirect login process launch",
      pattern: /\b(?:exec|execFile|spawn|spawnSync|fork)\s*\([\s\S]{0,180}?(?:npm\s+(?:run\s+)?login\b|scripts\/login\.mjs)|^\s*(?:npm\s+(?:run\s+)?login|node\s+(?:\.\/)?scripts\/login\.mjs)\b/m,
      allowed: [],
    },
    {
      name: "OS browser opener",
      pattern: /\b(?:exec|execFile|spawn|spawnSync)\s*\(\s*["'`](?:osascript|open|xdg-open|start)\b|^\s*(?:osascript|open|xdg-open)\b|tell application ["'](?:Google Chrome|Safari)["']/im,
      allowed: [],
    },
  ];

  const blockedExamples = {
    "browser automation library": 'await import("playwright-core")',
    "browser launch or navigation": 'await page.goto("https://example.com")',
    "login implementation import": 'import { runLogin } from "../src/auth/login.mjs"',
    "runLogin call": "await runLogin(sessionPath)",
    "automated ametller_login tool call": 'await client.callTool({ name: "ametller_login", arguments: {} })',
    "indirect login process launch": 'spawn(process.execPath, ["scripts/login.mjs"])',
    "OS browser opener": 'execFile("open", ["https://example.com"])',
  };

  for (const rule of rules) {
    assert.match(blockedExamples[rule.name], rule.pattern, `${rule.name} regression sample`);
    const offenders = files.filter((file) => rule.pattern.test(source.get(file))).sort();
    assert.deepEqual(offenders, [...rule.allowed].sort(), rule.name);
  }

  const scripts = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).scripts;
  const automatedEntrypoints = Object.entries(scripts).filter(([name]) => /test|e2e|smoke|verify|check/i.test(name));
  const unsafeEntrypoints = automatedEntrypoints
    .filter(([, command]) => /npm\s+(?:run\s+)?login\b|scripts\/login\.mjs|ametller_login|login:bundle/i.test(command))
    .map(([name]) => name);
  assert.deepEqual(unsafeEntrypoints, [], "package test/E2E entrypoints must not invoke login");
  assert.equal(Object.hasOwn(scripts, "login:bundle"), false);
});

test("interactive suggestions require a visible click before a cart tool call", () => {
  const source = fs.readFileSync(path.join(root, "src", "insights-app.js"), "utf8");
  assert.equal((source.match(/callServerTool/g) || []).length, 1);
  const click = source.indexOf('button.addEventListener("click"');
  const mutation = source.indexOf("app.callServerTool");
  assert.ok(click >= 0 && mutation > click, "cart tool call must stay inside the approval click handler");
  assert.match(source, /Add selected to real basket/);
});
