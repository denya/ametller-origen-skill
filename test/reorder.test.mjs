import assert from "node:assert/strict";
import test from "node:test";
import { applyApprovedReorder, previewReorder, SafeReorderError } from "../src/reorder.mjs";
import { canonicalCart } from "../src/cart-e2e.mjs";

class FakeReorderClient {
  constructor({ lines, products, cart, failAfterAdd } = {}) {
    this.lines = lines || [];
    this.products = new Map(Object.entries(products || {}));
    this.items = new Map((cart || []).map(({ productId, quantity }) => [productId, quantity]));
    this.failAfterAdd = failAfterAdd;
    this.addCalls = [];
    this.cartReads = 0;
  }

  async getLatestOrderId() { return "latest-order"; }
  async getOrderLines() { return this.lines; }
  async getProduct(productId) {
    if (!this.products.has(productId)) throw new Error("not found");
    return this.products.get(productId);
  }
  cart() {
    return {
      currency: "EUR",
      productItems: [...this.items].map(([productId, quantity]) => ({ productId, quantity })),
    };
  }
  async getCart() { this.cartReads += 1; return this.cart(); }
  async addToCart(productId, quantity) {
    this.addCalls.push({ productId, quantity });
    this.items.set(productId, (this.items.get(productId) || 0) + quantity);
    if (this.addCalls.length === this.failAfterAdd) throw new Error("injected add failure");
    return this.cart();
  }
  async setQuantity(productId, quantity) { this.items.set(productId, quantity); return this.cart(); }
  async removeFromCart(productId) { this.items.delete(productId); return this.cart(); }
}

test("reorder preview revalidates catalog, availability, packs, promotions, and unresolved lines without reading the cart", async () => {
  const client = new FakeReorderClient({
    lines: [
      { productId: "apple", productName: "Old apple", quantity: 2, price: 2 },
      { productId: "milk", productName: "Milk", quantity: 1, price: 2 },
      { productId: "bonus", productName: "Gift", quantity: 1, price: 0, bonusProductLineItem: true },
      { productName: "Service line", quantity: 1, price: 1 },
      { productId: "pack", productName: "Pack", quantity: 3, price: 5 },
      { productId: "gone", productName: "Gone", quantity: 1, price: 4 },
      { productId: "mismatch", productName: "Mismatch", quantity: 1, price: 4 },
    ],
    products: {
      apple: { id: "apple", name: "Current apple 2-pack", price: 2.2, orderable: true, minOrderQuantity: 1, stepQuantity: 1 },
      milk: { id: "milk", name: "Milk", orderable: false },
      pack: { id: "pack", name: "Pack", orderable: true, minOrderQuantity: 2, stepQuantity: 2 },
      mismatch: { id: "different", name: "Different item", orderable: true },
    },
  });

  const preview = await previewReorder(client);
  assert.equal(preview.order_id, "latest-order");
  assert.deepEqual(preview.approved_items_template, [{ product_id: "apple", quantity: 2 }]);
  assert.deepEqual(preview.validated.map((line) => line.name), ["Current apple 2-pack"]);
  assert.deepEqual(new Set(preview.rejected.map((line) => line.reason)), new Set([
    "currently_unavailable",
    "promotion_or_bonus_line",
    "unresolved_product",
    "current_pack_or_quantity_incompatible",
    "not_found_in_current_catalog",
    "catalog_id_mismatch",
  ]));
  assert.equal(client.cartReads, 0);
  assert.equal(client.addCalls.length, 0);
});

test("approved reorder adds only the exact freshly validated subset and verifies the resulting basket", async () => {
  const client = new FakeReorderClient({
    lines: [
      { productId: "apple", productName: "Apple", quantity: 2, price: 2 },
      { productId: "milk", productName: "Milk", quantity: 1, price: 2 },
    ],
    products: {
      apple: { id: "apple", name: "Apple", orderable: true },
      milk: { id: "milk", name: "Milk", orderable: true },
    },
    cart: [{ productId: "apple", quantity: 1 }, { productId: "bread", quantity: 2 }],
  });

  const result = await applyApprovedReorder(client, {
    orderId: "past-order",
    approvedItems: [{ product_id: "apple", quantity: 2 }],
  });
  assert.deepEqual(client.addCalls, [{ productId: "apple", quantity: 2 }]);
  assert.equal(result.added_lines, 1);
  assert.equal(result.added_quantity, 2);
  assert.deepEqual(canonicalCart(result.cart).items, [
    { productId: "apple", quantity: 3 },
    { productId: "bread", quantity: 2 },
  ]);
});

test("reorder rejects stale or invented approval before any cart mutation", async () => {
  const client = new FakeReorderClient({
    lines: [{ productId: "apple", productName: "Apple", quantity: 2, price: 2 }],
    products: { apple: { id: "apple", name: "Apple", orderable: true } },
    cart: [{ productId: "bread", quantity: 2 }],
  });
  await assert.rejects(
    applyApprovedReorder(client, {
      orderId: "past-order",
      approvedItems: [{ product_id: "apple", quantity: 3 }],
    }),
    /no longer matches the fresh preview/i,
  );
  assert.equal(client.cartReads, 0);
  assert.equal(client.addCalls.length, 0);
});

test("partial reorder failure restores the exact original basket", async () => {
  const client = new FakeReorderClient({
    lines: [
      { productId: "apple", productName: "Apple", quantity: 1, price: 2 },
      { productId: "milk", productName: "Milk", quantity: 1, price: 2 },
    ],
    products: {
      apple: { id: "apple", name: "Apple", orderable: true },
      milk: { id: "milk", name: "Milk", orderable: true },
    },
    cart: [{ productId: "bread", quantity: 2 }],
    failAfterAdd: 2,
  });
  const original = canonicalCart(client.cart());

  await assert.rejects(
    applyApprovedReorder(client, {
      orderId: "past-order",
      approvedItems: [
        { product_id: "apple", quantity: 1 },
        { product_id: "milk", quantity: 1 },
      ],
    }),
    (error) => error instanceof SafeReorderError && error.restored === true,
  );
  assert.deepEqual(canonicalCart(client.cart()), original);
});

test("reorder refuses an absent basket before writing because it cannot be restored", async () => {
  const client = new FakeReorderClient({
    lines: [{ productId: "apple", productName: "Apple", quantity: 1, price: 2 }],
    products: { apple: { id: "apple", name: "Apple", orderable: true } },
  });
  client.getCart = async () => null;
  await assert.rejects(
    applyApprovedReorder(client, {
      orderId: "past-order",
      approvedItems: [{ product_id: "apple", quantity: 1 }],
    }),
    /no existing basket/i,
  );
  assert.equal(client.addCalls.length, 0);
});

test("reorder refuses a complex basket before writing", async () => {
  const client = new FakeReorderClient({
    lines: [{ productId: "apple", productName: "Apple", quantity: 1, price: 2 }],
    products: { apple: { id: "apple", name: "Apple", orderable: true } },
    cart: [{ productId: "bread", quantity: 1 }],
  });
  client.getCart = async () => ({
    productItems: [{ productId: "bread", quantity: 1, bonusProductLineItem: true }],
  });
  await assert.rejects(
    applyApprovedReorder(client, {
      orderId: "past-order",
      approvedItems: [{ product_id: "apple", quantity: 1 }],
    }),
    /complex or unsupported line/i,
  );
  assert.equal(client.addCalls.length, 0);
});
