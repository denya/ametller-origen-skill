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
