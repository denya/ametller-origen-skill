import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildInsights,
  chooseCatalogMatch,
  offlineEvents,
  onlineEvents,
} from "../src/analytics.mjs";
import { readTickets, syncTickets } from "../src/tickets.mjs";
import { compactProduct } from "../src/ametller/api.mjs";

test("product details expose official images and safe availability without fake stock counts", () => {
  const product = compactProduct({
    id: "synthetic",
    name: "Synthetic apple",
    price: 1.5,
    primaryCategoryId: "fruit",
    inventory: { orderable: true, backorderable: false, stockLevel: 999999 },
    imageGroups: [{ viewType: "large", images: [
      { disBaseLink: "https://www.ametllerorigen.com/one.jpg" },
      { disBaseLink: "https://www.ametllerorigen.com/two.jpg" },
    ] }],
  });
  assert.equal(product.image, "https://www.ametllerorigen.com/one.jpg");
  assert.deepEqual(product.images, [
    "https://www.ametllerorigen.com/one.jpg",
    "https://www.ametllerorigen.com/two.jpg",
  ]);
  assert.deepEqual(product.availability, {
    orderable: true,
    backorderable: false,
    preorderable: false,
  });
  assert.equal("stockLevel" in product, false);
});

test("private ticket reader filters, compacts, and repairs file mode", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ametller-tickets-"));
  const valid = path.join(directory, "valid.json");
  const invalid = path.join(directory, "invalid.json");
  await fs.writeFile(valid, JSON.stringify({
    id: "synthetic-ticket",
    date: "2026-07-01",
    store: "Ametller Origen",
    totalAmount: 3.5,
    items: [{ name: "Quefir natural 4x125g", quantity: 1, pricePerUnit: 3.5, totalPrice: 3.5 }],
  }), { mode: 0o644 });
  await fs.writeFile(invalid, "not-json", { mode: 0o600 });
  try {
    const result = await readTickets(directory, {
      from: "2026-06-01",
      to: "2026-07-31",
      includeItems: true,
    });
    assert.equal(result.tickets.length, 1);
    assert.equal(result.tickets[0].items[0].name, "Quefir natural 4x125g");
    assert.equal(result.invalid_files, 1);
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    assert.equal((await fs.stat(valid)).mode & 0o777, 0o600);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("ticket sync wrapper returns only a sanitized summary", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ametller-sync-"));
  const script = path.join(directory, "synthetic.py");
  await fs.writeFile(script, [
    "import json",
    "print(json.dumps({'query': 'private', 'matched_messages': 3, 'written': 2, 'skipped_existing': 1, 'failed': 0}))",
  ].join("\n"));
  try {
    assert.deepEqual(await syncTickets({ scriptPath: script, ticketDir: directory }), {
      matched_messages: 3,
      written: 2,
      skipped_existing: 1,
      failed: 0,
    });
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
});

test("insights merge online and offline purchases and exclude cart products", () => {
  const orders = [{
    orderNo: "online-1",
    creationDate: "2026-06-01T10:00:00Z",
    orderTotal: 10,
    productItems: [{
      productId: "100",
      productName: "Poma Gala",
      quantity: 2,
      priceAfterOrderDiscount: 2,
      c_VS_NameCategoryPrimary: "Fruita",
      c_VS_imageURL: "https://www.ametllerorigen.com/image.jpg",
    }],
  }, {
    orderNo: "online-2",
    creationDate: "2026-06-15T10:00:00Z",
    orderTotal: 12,
    productItems: [{
      productId: "100",
      productName: "Poma Gala",
      quantity: 1,
      priceAfterOrderDiscount: 1,
      c_VS_NameCategoryPrimary: "Fruita",
    }],
  }];
  const tickets = [{
    id: "offline-1",
    date: "2026-06-02",
    total: 5,
    items: [{ name: "Quefir natural 4x125g", quantity: 1, unit_price: 3, total: 5 }],
  }, {
    id: "offline-2",
    date: "2026-06-16",
    total: 5,
    items: [{ name: "Quefir natural 4x125g", quantity: 1, unit_price: 5, total: 5 }],
  }];
  const events = [...onlineEvents(orders), ...offlineEvents(tickets)];
  const insights = buildInsights(events, {
    cart: { productItems: [{ productId: "100", quantity: 1 }] },
    now: new Date("2026-07-17T00:00:00Z"),
  });

  assert.deepEqual(insights.summary, {
    purchases: 4,
    products: 2,
    spend: 32,
    average_basket: 8,
    sources: [
      { source: "offline", purchases: 2, spend: 10 },
      { source: "online", purchases: 2, spend: 22 },
    ],
  });
  assert.equal(insights.top_products[0].purchase_count, 2);
  assert.equal(insights.suggestions.length, 1);
  assert.equal(insights.suggestions[0].name, "Quefir natural 4x125g");
  assert.equal(insights.suggestions[0].product_id, undefined);
  assert.equal(insights.suggestions[0].expected_price, 5);
  assert.equal(insights.categories.some((category) => category.heuristic), true);
});

test("offline catalog matching requires both strong name and compatible price", () => {
  const suggestion = { name: "Quefir natural 4x125g", expected_price: 2 };
  const hits = [
    { productId: "wrong", productName: "Quefir natural 1kg", price: 4.5 },
    { productId: "right", productName: "Quefir natural 4x125g", price: 2.1 },
  ];
  assert.equal(chooseCatalogMatch(suggestion, hits).productId, "right");
  assert.equal(chooseCatalogMatch(suggestion, [{ productName: "Llet sencera", price: 2 }]), null);
  assert.equal(chooseCatalogMatch(
    { name: "Quefir natural 4x125g", expected_price: 2 },
    [{ productId: "expanded", productName: "Quefir natural 4x125g ecologic", price: 2.1 }],
  ).productId, "expanded");
  assert.equal(chooseCatalogMatch(
    { name: "Llet", expected_price: 2 },
    [{ productId: "generic", productName: "Llet sencera 1l", price: 2 }],
  ), null);
});
