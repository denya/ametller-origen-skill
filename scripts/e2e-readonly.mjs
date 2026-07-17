#!/usr/bin/env node
// Sanitized live API verification: emits no account, cart, order, or token payloads.
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { AmetllerClient } from "../src/ametller/api.mjs";
import { tokenStatus } from "../src/auth/slas.mjs";
import { loadSession } from "../src/auth/store.mjs";
import { canonicalCart } from "../src/cart-e2e.mjs";

const sessionPath = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");
const retry = async (operation, attempts = 4) => {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 500));
    }
  }
  throw lastError;
};

const session = loadSession(sessionPath);
const client = new AmetllerClient(session);

if (process.env.AMETLLER_FORCE_REFRESH === "1") {
  const expiredPayload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) - 60 })).toString("base64url");
  session.access_token = `header.${expiredPayload}.signature`;
}
assert.deepEqual(await retry(() => client.authStatus()), { signed_in: true, access_token_valid: true });
assert.ok(tokenStatus(session.access_token).valid);
assert.equal(fs.statSync(sessionPath).mode & 0o777, 0o600);
console.log(`browser_session=pass refresh_rotation=${process.env.AMETLLER_FORCE_REFRESH === "1" ? "pass" : "not_repeated"} private_persistence=pass`);

const guest = new AmetllerClient();
const search = await retry(() => guest.search("poma", { limit: 3 }));
assert.ok(search.hits?.length);
const detail = await retry(() => guest.getProduct(String(search.hits[0].productId)));
assert.ok(detail?.productId ?? detail?.id);
console.log("guest_search=pass product_detail=pass");

const cart = canonicalCart(await retry(() => client.getCart()));
console.log(`authenticated_cart_read=pass restore_preflight=${cart.exists ? "simple" : "no_existing_basket"}`);

const history = await retry(() => client.getAllOrders({ limit: 50, maxPages: 100 }));
assert.ok(history.data.length > 0);
assert.ok(history.pages > 0);
const lines = await retry(() => client.getOrderLines(history.data[0].orderNo));
assert.ok(Array.isArray(lines));
console.log("full_order_pagination=pass order_detail=pass");
