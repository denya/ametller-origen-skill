import assert from "node:assert/strict";
import test from "node:test";
import { canonicalCart, exerciseCart, restoreCart } from "../src/cart-e2e.mjs";

class FakeCartClient {
  constructor(items) {
    this.items = new Map(items.map(({ productId, quantity }) => [productId, quantity]));
  }
  cart() {
    return { currency: "EUR", productItems: [...this.items].map(([productId, quantity]) => ({ productId, quantity })) };
  }
  async getCart() { return this.cart(); }
  async addToCart(id, quantity) { this.items.set(id, (this.items.get(id) || 0) + quantity); return this.cart(); }
  async setQuantity(id, quantity) { this.items.set(id, quantity); return this.cart(); }
  async removeFromCart(id) { this.items.delete(id); return this.cart(); }
}

const guest = {
  async search() { return { hits: [{ productId: "test-product" }] }; },
  async getProduct() { return { productId: "test-product" }; },
};

for (const failAfter of ["add", "set"]) {
  test(`finally restoration recovers an injected failure after ${failAfter}`, async () => {
    const client = new FakeCartClient([{ productId: "existing", quantity: 3 }]);
    const original = canonicalCart(await client.getCart());
    try {
      await exerciseCart(client, guest, original, { failAfter });
      assert.fail("expected injected failure");
    } catch (error) {
      assert.match(error.message, /injected failure/);
    } finally {
      await restoreCart(client, original, { attempts: 2 });
    }
    assert.deepEqual(canonicalCart(await client.getCart()), original);
  });
}

test("restore retries transient reads, removals, and quantity repairs", async () => {
  class FlakyRestoreClient extends FakeCartClient {
    constructor() {
      super([{ productId: "existing", quantity: 9 }, { productId: "extra", quantity: 1 }]);
      this.failures = { get: 2, remove: 1, set: 1 };
      this.calls = { get: 0, remove: 0, set: 0 };
    }
    async getCart() {
      this.calls.get += 1;
      if (this.failures.get-- > 0) throw new Error("transient get");
      return super.getCart();
    }
    async removeFromCart(id) {
      this.calls.remove += 1;
      if (this.failures.remove-- > 0) throw new Error("transient remove");
      return super.removeFromCart(id);
    }
    async setQuantity(id, quantity) {
      this.calls.set += 1;
      if (this.failures.set-- > 0) throw new Error("transient set");
      return super.setQuantity(id, quantity);
    }
  }

  const client = new FlakyRestoreClient();
  const original = canonicalCart({
    currency: "EUR",
    productItems: [{ productId: "existing", quantity: 3 }],
  });
  const restored = await restoreCart(client, original, { attempts: 3 });

  assert.deepEqual(restored, original);
  assert.deepEqual(client.calls, { get: 4, remove: 2, set: 2 });
});

test("mutation and restoration refuse an originally absent basket", async () => {
  const absent = canonicalCart(null);
  assert.deepEqual(absent, { exists: false, items: [], totals: {} });
  await assert.rejects(exerciseCart(new FakeCartClient([]), guest, absent), /refuses to create a basket/);
  await assert.rejects(restoreCart(new FakeCartClient([]), absent), /cannot losslessly restore/);
});
