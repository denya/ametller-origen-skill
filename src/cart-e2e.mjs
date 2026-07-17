import assert from "node:assert/strict";

export function canonicalCart(cart) {
  if (!cart) return { exists: false, items: [], totals: {} };
  const seen = new Set();
  const items = (cart.productItems || []).map((item) => {
    assert.equal(typeof item.productId, "string", "cart contains a line without a product id");
    assert.ok(Number.isInteger(item.quantity) && item.quantity > 0, "cart contains a non-integer quantity");
    assert.ok(!seen.has(item.productId), "cart contains duplicate product lines");
    assert.ok(!(item.optionItems?.length || item.bundledProductItems?.length || item.bonusProductLineItem), "cart contains a complex line");
    seen.add(item.productId);
    return { productId: item.productId, quantity: item.quantity };
  });
  items.sort((a, b) => a.productId.localeCompare(b.productId));
  const totals = Object.fromEntries(
    ["currency", "orderTotal", "productTotal", "productSubTotal", "shippingTotal", "taxTotal"]
      .filter((key) => cart[key] !== undefined)
      .map((key) => [key, cart[key]]),
  );
  return { exists: true, items, totals };
}

export const encodeCart = (value) => JSON.stringify(value);
export const quantities = (state) => new Map(state.items.map((item) => [item.productId, item.quantity]));

function assertOriginalLinesUnchanged(original, current, extraProductId, extraQuantity) {
  const expected = quantities(original);
  const actual = quantities(current);
  for (const [productId, quantity] of expected) assert.equal(actual.get(productId), quantity);
  assert.equal(actual.get(extraProductId), extraQuantity);
  assert.equal(actual.size, expected.size + 1);
}

async function retry(operation, attempts = 3) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((resolve) => setTimeout(resolve, attempt * 250));
    }
  }
  throw lastError;
}

export async function restoreCart(client, original, { attempts = 3 } = {}) {
  assert.ok(original.exists, "cannot losslessly restore an originally absent basket");
  const expected = quantities(original);
  const current = canonicalCart(await retry(() => client.getCart(), attempts));
  for (const { productId } of current.items) {
    if (!expected.has(productId)) await retry(() => client.removeFromCart(productId), attempts);
  }
  for (const { productId, quantity } of original.items) {
    await retry(() => client.setQuantity(productId, quantity), attempts);
  }
  return canonicalCart(await retry(() => client.getCart(), attempts));
}

export async function exerciseCart(client, guest, original, { failAfter } = {}) {
  assert.ok(original.exists, "cart E2E refuses to create a basket that did not exist at snapshot time");
  const search = await guest.search("poma", { limit: 24 });
  const existing = quantities(original);
  const candidate = (search.hits || []).find((hit) => hit.productId && !existing.has(String(hit.productId)));
  assert.ok(candidate, "no absent catalog product available for isolated cart test");
  const productId = String(candidate.productId);
  await guest.getProduct(productId);

  const afterAdd = canonicalCart(await client.addToCart(productId, 1));
  assertOriginalLinesUnchanged(original, afterAdd, productId, 1);
  if (failAfter === "add") throw new Error("injected failure after add");

  const afterSet = canonicalCart(await client.setQuantity(productId, 2));
  assertOriginalLinesUnchanged(original, afterSet, productId, 2);
  if (failAfter === "set") throw new Error("injected failure after set");

  const afterRemove = canonicalCart(await client.removeFromCart(productId));
  assert.equal(encodeCart(afterRemove), encodeCart(original));
  return { productId };
}
