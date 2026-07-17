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

test("loading a legacy session repairs permissions and rejects malformed state", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-session-"));
  const file = path.join(dir, "session.json");
  fs.writeFileSync(file, JSON.stringify({ refresh_token: "refresh" }), { mode: 0o644 });

  assert.equal(loadSession(file).refresh_token, "refresh");
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  fs.writeFileSync(file, JSON.stringify({ customer_id: "customer" }), { mode: 0o600 });
  assert.throws(() => loadSession(file), /No token/);
});

test("client persists a rotated refresh response", async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-session-"));
  const file = path.join(dir, "session.json");
  const expiredPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
  saveSession(file, {
    access_token: `header.${expiredPayload}.signature`,
    refresh_token: "refresh-1",
    customer_id: "customer-1",
  });
  const session = loadSession(file);
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const access = `header.${payload}.signature`;
  const { AmetllerClient } = await import("../src/ametller/api.mjs");
  const client = new AmetllerClient(session, {
    refresh: async (token) => {
      assert.equal(token, "refresh-1");
      return { access_token: access, refresh_token: "refresh-2", customer_id: "customer-2", usid: "usid-2" };
    },
  });

  assert.deepEqual(await client.authStatus(), { signed_in: true, access_token_valid: true });
  const stored = JSON.parse(fs.readFileSync(file, "utf8"));
  assert.equal(stored.refresh_token, "refresh-2");
  assert.equal(stored.customer_id, "customer-2");
  assert.equal(stored.usid, "usid-2");
  assert.equal(stored.access_token, access);
});
