import assert from "node:assert/strict";
import test from "node:test";
import { AmetllerClient } from "../src/ametller/api.mjs";
import { getGuestToken } from "../src/auth/slas.mjs";

const liveToken = () => {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  return `header.${payload}.signature`;
};

test("SCAPI errors never expose response bodies", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response("private customer payload", { status: 500 });
  try {
    const client = new AmetllerClient({ access_token: liveToken(), customer_id: "synthetic" });
    await assert.rejects(client.getProduct("synthetic-product"), (error) => {
      assert.match(error.message, /GET .* failed \(500\)/);
      assert.doesNotMatch(error.message, /private customer payload/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("guest OAuth errors never expose redirects or response bodies", async () => {
  const originalFetch = globalThis.fetch;
  let call = 0;
  globalThis.fetch = async () => {
    call += 1;
    if (call === 1) {
      return new Response(null, {
        status: 302,
        headers: { location: "https://www.ametllerorigen.com/callback?code=synthetic&usid=private-usid" },
      });
    }
    return new Response("private OAuth payload", { status: 400 });
  };
  try {
    await assert.rejects(getGuestToken(), (error) => {
      assert.equal(error.message, "SLAS token exchange failed (400).");
      assert.doesNotMatch(error.message, /private|synthetic|callback/);
      return true;
    });
  } finally {
    globalThis.fetch = originalFetch;
  }
});
