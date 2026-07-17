import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import {
  buildInsights,
  chooseCatalogMatch,
  enrichSuggestions,
  inferOfflineCategory,
  offlineEvents,
  onlineEvents,
} from "../src/analytics.mjs";
import { ingestTickets, readTickets, syncTickets } from "../src/tickets.mjs";
import { compactProduct } from "../src/ametller/api.mjs";

test("offline category heuristics cover common receipt-only names", () => {
  assert.equal(inferOfflineCategory("Móres extra -safata 125g"), "Fruita i verdura");
  assert.equal(inferOfflineCategory("Skyr natural 450g"), "Lactis i ous");
  assert.equal(inferOfflineCategory("Corona de gambes salsa còctel"), "Peix");
  assert.equal(inferOfflineCategory("Suc premsat de raïm"), "Begudes");
});

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

test("connected Gmail ingestion writes only normalized private ticket data", async () => {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "ametller-ingest-"));
  const ticket = {
    id: "synthetic-message-id",
    date: "2026-07-13",
    store: "Ametller Origen",
    invoice_number: "2026/1/1",
    total: 1.99,
    items: [{
      name: "Quefir natural AO 4x125g",
      quantity: 1,
      unit: "ud",
      unit_price: 1.99,
      total: 1.99,
    }],
  };
  try {
    assert.deepEqual(await ingestTickets(directory, [ticket]), {
      received: 1,
      written: 1,
      skipped_existing: 0,
      failed: 0,
    });
    assert.equal((await fs.stat(directory)).mode & 0o777, 0o700);
    const [name] = await fs.readdir(directory);
    const file = path.join(directory, name);
    const stored = JSON.parse(await fs.readFile(file, "utf8"));
    assert.equal((await fs.stat(file)).mode & 0o777, 0o600);
    assert.equal(stored.source, "gmail-connector");
    assert.equal(stored.items[0].name, ticket.items[0].name);
    assert.equal("body" in stored, false);
    assert.equal((await readTickets(directory)).tickets.length, 1);
    assert.deepEqual(await ingestTickets(directory, [{ ...ticket, date: "2026-07-14" }]), {
      received: 1,
      written: 0,
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
  assert.deepEqual(insights.category_leaders.map((item) => item.name).sort(), [
    "Poma Gala",
    "Quefir natural 4x125g",
  ]);
  assert.equal(insights.prediction.model, "multi-scale-recency-30");
  assert.equal(insights.prediction.purchase_days, 4);
});

test("prediction cleaning removes placeholders and duplicate receipts, then merges same-day baskets", () => {
  const tickets = [{
    id: "ticket-a",
    date: "2026-07-01",
    total: 6,
    items: [
      { name: "Parking", quantity: 1, total: 1 },
      { name: "Poma Gala", quantity: 1, unit_price: 2, total: 2 },
    ],
  }, {
    id: "ticket-a-copy",
    date: "2026-07-01",
    total: 6,
    items: [
      { name: "Parking", quantity: 1, total: 1 },
      { name: "Poma Gala", quantity: 1, unit_price: 2, total: 2 },
    ],
  }, {
    id: "ticket-b",
    date: "2026-07-01",
    total: 3,
    items: [{ name: "Quefir natural 4x125g", quantity: 1, unit_price: 3, total: 3 }],
  }, {
    id: "placeholder",
    date: "2026-07-02",
    total: 4,
    items: [{ name: "Various items", quantity: 1, total: 4 }],
  }];
  const insights = buildInsights(offlineEvents(tickets), {
    now: new Date("2026-07-17T00:00:00Z"),
  });

  assert.equal(insights.prediction.removed_lines, 3);
  assert.equal(insights.prediction.exact_duplicate_purchases_removed, 1);
  assert.equal(insights.prediction.purchase_days, 1);
  assert.equal(insights.summary.purchases, 2);
  assert.deepEqual(insights.top_products.map((item) => item.name).sort(), [
    "Poma Gala",
    "Quefir natural 4x125g",
  ]);
});

test("multi-scale recency includes one-time repeats, merges exact online/offline names, and excludes cart names", () => {
  const orders = [{
    orderNo: "online-old",
    creationDate: "2026-01-01T10:00:00Z",
    orderTotal: 2,
    productItems: [{ productId: "apple", productName: "Poma Gala", quantity: 1, price: 2 }],
  }];
  const tickets = [{
    id: "offline-recent",
    date: "2026-07-16",
    total: 2,
    items: [{ name: "Poma Gala", quantity: 1, unit_price: 2, total: 2 }],
  }, {
    id: "offline-kefir",
    date: "2026-07-15",
    total: 3,
    items: [{ name: "Quefir natural 4x125g", quantity: 1, unit_price: 3, total: 3 }],
  }];
  const events = [...onlineEvents(orders), ...offlineEvents(tickets)];
  const insights = buildInsights(events, { now: new Date("2026-07-17T00:00:00Z") });

  assert.equal(insights.top_products.length, 2);
  assert.equal(insights.top_products.find((item) => item.name === "Poma Gala").purchase_count, 2);
  assert.equal(insights.suggestions[0].name, "Poma Gala");
  assert.equal(insights.suggestions[0].product_id, "apple");
  assert.equal(insights.suggestions.some((item) => item.name === "Quefir natural 4x125g"), true);

  const excluded = buildInsights(events, {
    cart: { lines: [{ name: "Poma Gala", quantity: 1 }] },
    now: new Date("2026-07-17T00:00:00Z"),
  });
  assert.equal(excluded.suggestions.some((item) => item.name === "Poma Gala"), false);
});

test("protein rotation is explicit and never replaces the exact default", () => {
  const events = offlineEvents([
    { id: "a", date: "2026-07-01", total: 4, items: [{ name: "Pollastre", quantity: 1, total: 4 }] },
    { id: "b", date: "2026-07-10", total: 5, items: [{ name: "Salmó", quantity: 1, total: 5 }] },
  ]);
  const exact = buildInsights(events, { now: new Date("2026-07-17T00:00:00Z") });
  const rotation = buildInsights(events, {
    now: new Date("2026-07-17T00:00:00Z"),
    suggestionMode: "protein-rotation",
  });
  assert.equal(exact.prediction.model, "multi-scale-recency-30");
  assert.equal(rotation.prediction.model, "experimental-protein-rotation-30");
  assert.equal(rotation.suggestions.every((item) => item.model === "experimental-protein-rotation-30"), true);
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

test("catalog resolution cannot reintroduce a product already in the API cart", async () => {
  const client = {
    async search() {
      return { hits: [{ productId: "in-cart", productName: "Quefir natural 4x125g", price: 3 }] };
    },
  };
  const suggestions = await enrichSuggestions(client, [{
    name: "Quefir natural 4x125g",
    expected_price: 3,
    quantity: 1,
  }], { excludeProductIds: ["in-cart"] });
  assert.deepEqual(suggestions, []);
});
