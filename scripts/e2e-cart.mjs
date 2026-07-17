#!/usr/bin/env node
import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AmetllerClient } from "../src/ametller/api.mjs";
import { loadSession } from "../src/auth/store.mjs";
import { canonicalCart, encodeCart, exerciseCart, restoreCart } from "../src/cart-e2e.mjs";

const sessionPath = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");

const fingerprint = (value, salt) => createHash("sha256").update(salt).update(encodeCart(value)).digest("hex");

const client = new AmetllerClient(loadSession(sessionPath));
const guest = new AmetllerClient();

if (process.env.AMETLLER_E2E_MUTATE !== "1") {
  console.log("mutation=skipped set AMETLLER_E2E_MUTATE=1 for the authorized reversible cart test");
  process.exit(0);
}

const original = canonicalCart(await client.getCart());
assert.ok(original.exists, "mutation refused: the account has no existing basket, which cannot be losslessly restored");
const salt = randomBytes(32);
const work = fs.mkdtempSync(path.join(os.tmpdir(), "ametller-cart-e2e-"));
fs.chmodSync(work, 0o700);
const snapshotPath = path.join(work, "snapshot.json");
fs.writeFileSync(snapshotPath, `${encodeCart(original)}\n`, { mode: 0o600 });
const originalFingerprint = fingerprint(original, salt);
let restored = false;

console.log(`snapshot=created fingerprint=${originalFingerprint}`);
try {
  await exerciseCart(client, guest, original);
  console.log("search=pass product_detail=pass");
  console.log("add=pass");
  console.log("quantity_change=pass");
  console.log("remove=pass");
} finally {
  try {
    const finalState = await restoreCart(client, original);
    const restoredFingerprint = fingerprint(finalState, salt);
    restored = encodeCart(finalState) === encodeCart(original);
    console.log(`restore=${restored ? "exact" : "failed"} fingerprint=${restoredFingerprint}`);
    if (restored) {
      fs.unlinkSync(snapshotPath);
      fs.rmdirSync(work);
    }
  } catch (error) {
    console.error(`restore=failed recovery_snapshot=${snapshotPath}`);
    throw error;
  }
}

assert.ok(restored, "cart restoration did not reproduce the original semantic state");
