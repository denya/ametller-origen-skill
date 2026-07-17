import assert from "node:assert/strict";
import test from "node:test";
import { AmetllerClient, compactCart } from "../src/ametller/api.mjs";

const liveToken = () => {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `header.${payload}.signature`;
};

test("getCart reports no basket without creating one", async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (url, options = {}) => {
    calls.push({ url: String(url), method: options.method || "GET" });
    return new Response(JSON.stringify({ baskets: [] }), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
  };

  try {
    const client = new AmetllerClient({ access_token: liveToken(), customer_id: "customer-test" });
    assert.equal(await client.getCart(), null);
    assert.deepEqual(compactCart(null), { basket_exists: false, products_count: 0, total: null, lines: [] });
    assert.equal(calls.length, 1);
    assert.equal(calls[0].method, "GET");
    assert.match(calls[0].url, /\/customers\/customer-test\/baskets\?/);
  } finally {
    globalThis.fetch = originalFetch;
  }
});
