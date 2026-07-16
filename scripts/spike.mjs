// Real-data spike for the SCAPI client (guest mode, no login needed).
// Proves: guest token -> search -> product detail -> basket create/add/setQty/remove.
import { AmetllerClient, compactProduct, compactCart } from "../src/ametller/api.mjs";

const c = new AmetllerClient(); // guest
const term = process.argv[2] || "llet";

console.log(`\n# search "${term}"`);
const s = await c.search(term, { limit: 5 });
console.log("total:", s.total);
for (const h of (s.hits || []).slice(0, 5)) console.log(compactProduct(h));

const pid = s.hits?.[0]?.productId;
console.log(`\n# product ${pid}`);
console.log(compactProduct(await c.getProduct(pid)));

console.log("\n# basket: add x2");
await c.addToCart(pid, 2);
console.log(compactCart(await c.getCart()));

console.log("\n# basket: setQuantity -> 5");
await c.setQuantity(pid, 5);
console.log(compactCart(await c.getCart()));

console.log("\n# basket: remove");
console.log(compactCart(await c.removeFromCart(pid)));

console.log("\nOK — guest read+basket round-trip works against the live API.");
