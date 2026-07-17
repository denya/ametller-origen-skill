// Real-data spike for the SCAPI client (guest mode, no login needed).
// Proves: guest token -> search -> product detail. Never touches a cart.
import { AmetllerClient, compactProduct } from "../src/ametller/api.mjs";

const c = new AmetllerClient(); // guest
const term = process.argv[2] || "llet";

console.log(`\n# search "${term}"`);
const s = await c.search(term, { limit: 5 });
console.log("total:", s.total);
for (const h of (s.hits || []).slice(0, 5)) console.log(compactProduct(h));

const pid = s.hits?.[0]?.productId;
console.log(`\n# product ${pid}`);
console.log(compactProduct(await c.getProduct(pid)));

console.log("\nOK — guest catalog search and product detail work against the live API.");
