import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { loadSession, saveSession } from "../src/auth/store.mjs";

test("rotated tokens persist without serializing helpers", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-session-"));
  const file = path.join(dir, "session.json");
  saveSession(file, { access_token: "access-1", refresh_token: "refresh-1", customer_id: "customer" });

  const session = loadSession(file);
  session.access_token = "access-2";
  session.refresh_token = "refresh-2";
  session.persist();

  assert.deepEqual(JSON.parse(fs.readFileSync(file, "utf8")), {
    access_token: "access-2",
    refresh_token: "refresh-2",
    customer_id: "customer",
  });
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});
