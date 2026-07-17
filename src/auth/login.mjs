// Headed browser login for Ametller Origen's SFCC storefront. Opens a real browser;
// the user signs in manually (handling any 2FA), and we capture the registered SLAS
// token straight from the /oauth2/token network response — which carries the access
// token, refresh token, and customer id in one shot — then persist it to disk.
//
// Uses playwright-core (no bundled browser) to drive the user's installed Chrome
// through the "chrome" channel. It is imported dynamically and bundled for install.
import { decodeJwt, tokenStatus } from "./slas.mjs";
import { saveSession } from "./store.mjs";

const LOGIN_URL = "https://www.ametllerorigen.com/ca/login";

// A SLAS access token is a guest token while its `isb` claim says upn:Guest.
// Anything else means a real signed-in shopper.
function isRegistered(accessToken) {
  try {
    const isb = decodeJwt(accessToken)?.isb || "";
    return Boolean(isb) && !/upn:Guest\b/i.test(isb);
  } catch {
    return false;
  }
}

export async function runLogin(sessionPath, { timeoutMs = 5 * 60_000 } = {}) {
  let chromium;
  try {
    ({ chromium } = await import("playwright-core"));
  } catch {
    throw new Error("Browser authorization component is unavailable.");
  }
  const channel = process.env.AMETLLER_BROWSER_CHANNEL || "chrome";
  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel });
  } catch {
    throw new Error("Could not open Google Chrome. Make sure it is installed and retry.");
  }
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    let captured = null;
    page.on("response", async (res) => {
      const url = res.url();
      if (!url.includes("/shopper/auth/") || !url.includes("/oauth2/token")) return;
      let body;
      try {
        body = await res.json();
      } catch {
        return;
      }
      if (!body?.access_token || !body?.refresh_token || !isRegistered(body.access_token)) return;
      captured = {
        access_token: body.access_token,
        refresh_token: body.refresh_token,
        customer_id: body.customer_id,
        usid: body.usid,
        exp: decodeJwt(body.access_token).exp,
      };
    });
    await page.goto(LOGIN_URL, { waitUntil: "domcontentloaded" });
    const start = Date.now();
    while (!captured && Date.now() - start < timeoutMs) await page.waitForTimeout(1000);
    if (!captured) throw new Error("No Ametller login detected in time — run login again and sign in.");
    saveSession(sessionPath, captured);
    return { customerId: captured.customer_id, daysLeft: tokenStatus(captured.access_token).daysLeft };
  } catch (error) {
    if (/No Ametller login detected in time/.test(error?.message)) throw error;
    throw new Error("Browser authorization did not complete. Retry the login.");
  } finally {
    await browser.close().catch(() => {});
  }
}
