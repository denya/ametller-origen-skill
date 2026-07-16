// Post-login real-data check: reads the saved session and exercises the
// registered-only endpoints (cart + order history) with the user's own token.
import os from "node:os";
import path from "node:path";
import { loadSession } from "../src/auth/store.mjs";
import { AmetllerClient, compactCart, compactOrder } from "../src/ametller/api.mjs";
import { tokenStatus } from "../src/auth/slas.mjs";

const dest = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");
let session;
try {
  session = loadSession(dest);
} catch {
  console.error(`No session at ${dest}. Run "npm run login" first.`);
  process.exit(1);
}
const c = new AmetllerClient(session);

console.log("# auth");
console.log({ customer_id: c.customerId, days_left: Number(tokenStatus(session.access_token).daysLeft.toFixed(1)) });

console.log("\n# cart");
console.log(compactCart(await c.getCart()));

console.log("\n# orders (latest 5)");
const orders = await c.getOrders(1, 5);
for (const o of orders.data || []) console.log(compactOrder(o));

console.log("\nOK — registered session works end-to-end.");
