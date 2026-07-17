import { compactProduct } from "./ametller/api.mjs";

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const day = (value) => String(value || "").slice(0, 10);

export function normalizeProductName(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\b(?:ametller|origen|ao)\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

// ponytail: Offline receipts do not carry catalog taxonomy. Keep this small,
// explicit heuristic until the storefront exposes a stable receipt-to-product id.
export function inferOfflineCategory(name) {
  const value = normalizeProductName(name);
  const groups = [
    ["Fruita i verdura", /\b(poma|pera|platan|taronja|mandarina|maduixa|fruita|tomac|tomaquet|patata|ceba|carbasso|alvocat|ruca|amanida|enciam|espinac|verdura)\b/],
    ["Lactis i ous", /\b(llet|quefir|kefir|iogurt|yogur|formatge|queso|nata|mantega|ou|ous)\b/],
    ["Carn i xarcuteria", /\b(pollastre|vedella|porc|pernil|salsitxa|botifarra|xori|fuet|salami|colbasa|carn|duroc)\b/],
    ["Peix", /\b(peix|salmo|tonyina|bacalla|gamba|lluc|sardina)\b/],
    ["Forn", /\b(pa|baguette|croissant|brioche|galeta|coca|pastis)\b/],
    ["Begudes", /\b(aigua|suc|cervesa|vi|cava|refresc|kombutxa|te)\b/],
    ["Rebost", /\b(arros|pasta|oli|vinagre|farina|cereal|llegum|salsa|conserva|xocolata|sucre|sal)\b/],
    ["Preparats", /\b(pizza|sopa|crema|hummus|truita|croqueta|pate|foie|preparat)\b/],
  ];
  return groups.find(([, pattern]) => pattern.test(value))?.[0] || "Altres";
}

export function onlineEvents(orders = []) {
  return orders.flatMap((order) => (order?.productItems || []).map((item) => ({
    source: "online",
    purchase_id: String(order.orderNo || order.orderId || order.creationDate || "unknown"),
    purchase_total: number(order.orderTotal ?? order.productSubTotal),
    date: day(order.creationDate),
    product_id: item.productId == null ? undefined : String(item.productId),
    name: item.productName || "Producte sense nom",
    quantity: number(item.quantity) || 1,
    spend: number(item.priceAfterOrderDiscount ?? item.priceAfterItemDiscount ?? item.price),
    unit_price: number(item.quantity)
      ? number(item.priceAfterOrderDiscount ?? item.priceAfterItemDiscount ?? item.price) / number(item.quantity)
      : undefined,
    category: item.c_VS_NameCategoryPrimary || "Altres",
    category_source: item.c_VS_NameCategoryPrimary ? "catalog" : "unknown",
    image: item.c_VS_imageURL || undefined,
  })));
}

export function offlineEvents(tickets = []) {
  return tickets.flatMap((ticket) => (ticket?.items || []).map((item) => ({
    source: "offline",
    purchase_id: String(ticket.id || ticket.invoiceNumber || ticket.date || "unknown"),
    purchase_total: number(ticket.totalAmount ?? ticket.total),
    date: day(ticket.date),
    name: item.name || "Producte sense nom",
    quantity: number(item.quantity) || 1,
    spend: number(item.totalPrice ?? item.total),
    unit_price: number(item.pricePerUnit ?? item.unit_price),
    category: inferOfflineCategory(item.name),
    category_source: "heuristic",
  })));
}

function uniquePurchases(events) {
  const purchases = new Map();
  for (const event of events) {
    const key = `${event.source}:${event.purchase_id}`;
    const current = purchases.get(key) || {
      source: event.source,
      date: event.date,
      total: number(event.purchase_total),
      line_total: 0,
    };
    current.line_total += number(event.spend);
    purchases.set(key, current);
  }
  return [...purchases.values()].map((purchase) => ({
    ...purchase,
    total: money(purchase.total || purchase.line_total),
  }));
}

const productGroupKey = (event) =>
  event.product_id ? `id:${event.product_id}` : `name:${normalizeProductName(event.name)}`;

function cadenceSuggestion(group, now) {
  const dates = [...new Set(group.dates)].filter(Boolean).sort();
  if (dates.length < 2) return null;
  const intervals = dates.slice(1).map((value, index) =>
    Math.max(1, Math.round((Date.parse(value) - Date.parse(dates[index])) / 86_400_000)),
  ).sort((a, b) => a - b);
  const cadenceDays = intervals[Math.floor(intervals.length / 2)];
  const lastDate = dates.at(-1);
  const daysSince = Math.max(0, Math.floor((now.getTime() - Date.parse(lastDate)) / 86_400_000));
  if (daysSince < Math.max(7, Math.floor(cadenceDays * 0.8))) return null;
  return {
    key: group.key,
    product_id: group.product_id,
    name: group.name,
    category: group.category,
    image: group.image,
    purchase_count: dates.length,
    last_bought: lastDate,
    cadence_days: cadenceDays,
    days_since: daysSince,
    quantity: Math.max(1, Math.min(12, Math.round(group.quantity / group.events))),
    expected_price: money(group.latest_unit_price),
    source: group.sources.size === 1 ? [...group.sources][0] : "online+offline",
    score: money((daysSince / Math.max(cadenceDays, 1)) * Math.log2(dates.length + 1)),
  };
}

export function buildInsights(events, { cart = null, limit = 12, now = new Date() } = {}) {
  const clean = events.filter((event) => event?.name && event?.date);
  const purchases = uniquePurchases(clean);
  const categoryMap = new Map();
  const productMap = new Map();
  const monthlyMap = new Map();
  const sourceMap = new Map();

  for (const purchase of purchases) {
    const month = purchase.date.slice(0, 7) || "unknown";
    monthlyMap.set(month, money((monthlyMap.get(month) || 0) + purchase.total));
    const source = sourceMap.get(purchase.source) || { source: purchase.source, purchases: 0, spend: 0 };
    source.purchases += 1;
    source.spend = money(source.spend + purchase.total);
    sourceMap.set(purchase.source, source);
  }

  for (const event of clean) {
    const category = event.category || "Altres";
    const cat = categoryMap.get(category) || { category, spend: 0, quantity: 0, heuristic: false };
    cat.spend = money(cat.spend + event.spend);
    cat.quantity = money(cat.quantity + event.quantity);
    cat.heuristic ||= event.category_source === "heuristic";
    categoryMap.set(category, cat);

    const key = productGroupKey(event);
    const group = productMap.get(key) || {
      key,
      product_id: event.product_id,
      name: event.name,
      category,
      image: event.image,
      quantity: 0,
      spend: 0,
      events: 0,
      dates: [],
      sources: new Set(),
      latest_unit_price: 0,
      latest_price_date: "",
    };
    group.quantity += event.quantity;
    group.spend += event.spend;
    group.events += 1;
    group.dates.push(event.date);
    group.sources.add(event.source);
    if (!group.product_id && event.product_id) group.product_id = event.product_id;
    if (!group.image && event.image) group.image = event.image;
    if (event.unit_price && event.date >= group.latest_price_date) {
      group.latest_unit_price = event.unit_price;
      group.latest_price_date = event.date;
    }
    productMap.set(key, group);
  }

  const lineSpend = [...categoryMap.values()].reduce((sum, item) => sum + item.spend, 0);
  const categories = [...categoryMap.values()]
    .map((item) => ({ ...item, share: lineSpend ? money((item.spend / lineSpend) * 100) : 0 }))
    .sort((a, b) => b.spend - a.spend);
  const products = [...productMap.values()];
  const topProducts = products
    .map((group) => ({
      key: group.key,
      product_id: group.product_id,
      name: group.name,
      category: group.category,
      image: group.image,
      purchase_count: new Set(group.dates).size,
      quantity: money(group.quantity),
      spend: money(group.spend),
      last_bought: [...group.dates].sort().at(-1),
      sources: [...group.sources].sort(),
    }))
    .sort((a, b) => b.purchase_count - a.purchase_count || b.quantity - a.quantity)
    .slice(0, limit);

  const cartIds = new Set((cart?.productItems || []).map((item) => String(item.productId)));
  const suggestions = products
    .map((group) => cadenceSuggestion(group, now))
    .filter(Boolean)
    .filter((suggestion) => !suggestion.product_id || !cartIds.has(String(suggestion.product_id)))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);

  const totalSpend = money(purchases.reduce((sum, purchase) => sum + purchase.total, 0));
  return {
    summary: {
      purchases: purchases.length,
      products: productMap.size,
      spend: totalSpend,
      average_basket: purchases.length ? money(totalSpend / purchases.length) : 0,
      sources: [...sourceMap.values()].sort((a, b) => a.source.localeCompare(b.source)),
    },
    monthly: [...monthlyMap.entries()]
      .map(([month, spend]) => ({ month, spend }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    categories,
    top_products: topProducts,
    suggestions,
    notes: [
      "Monthly and total spend use order/receipt totals.",
      "Category spend uses line totals; offline discounts are not allocated across categories.",
      "Offline categories are name-based estimates and are marked heuristic.",
    ],
  };
}

function tokenMetrics(left, right) {
  const a = new Set(normalizeProductName(left).split(" ").filter(Boolean));
  const b = new Set(normalizeProductName(right).split(" ").filter(Boolean));
  if (!a.size || !b.size) return { overlap: 0, jaccard: 0, coverage: 0 };
  const intersection = [...a].filter((token) => b.has(token)).length;
  return {
    overlap: intersection,
    jaccard: intersection / new Set([...a, ...b]).size,
    coverage: intersection / Math.min(a.size, b.size),
  };
}

export function chooseCatalogMatch(suggestion, hits = []) {
  const expected = number(suggestion.expected_price);
  const ranked = hits.map((hit) => {
    const name = hit.productName ?? hit.name;
    const normalizedSuggestion = normalizeProductName(suggestion.name);
    const normalizedHit = normalizeProductName(name);
    const exact = normalizedSuggestion === normalizedHit;
    const metrics = tokenMetrics(suggestion.name, name);
    const nameScore = exact ? 1 : Math.max(metrics.jaccard, metrics.coverage * 0.75);
    const price = number(hit.pricePerUnit ?? hit.price);
    const priceGap = expected && price ? Math.abs(expected - price) : 0;
    const priceOk = !expected || !price || priceGap <= Math.max(0.35, expected * 0.2);
    const nameOk = exact || (metrics.overlap >= 2 && (metrics.jaccard >= 0.6 || metrics.coverage >= 0.8));
    return { hit, nameScore, nameOk, priceOk, priceGap };
  }).sort((a, b) => b.nameScore - a.nameScore || a.priceGap - b.priceGap);
  return ranked.find((candidate) => candidate.nameOk && candidate.priceOk)?.hit || null;
}

export async function enrichSuggestions(client, suggestions, { maxLookups = 8 } = {}) {
  const output = [];
  const resolvedIds = new Set();
  for (const suggestion of suggestions.slice(0, maxLookups)) {
    try {
      let product;
      let match = suggestion.product_id ? "order-id" : "ticket-name-price";
      if (suggestion.product_id) {
        product = await client.getProduct(suggestion.product_id);
      } else {
        const search = await client.search(suggestion.name, { limit: 6 });
        product = chooseCatalogMatch(suggestion, search.hits || []);
      }
      if (!product) {
        output.push({ ...suggestion, selectable: false, match: "unresolved" });
        continue;
      }
      const compact = compactProduct(product);
      const id = String(compact.id);
      if (resolvedIds.has(id)) continue;
      resolvedIds.add(id);
      output.push({
        ...suggestion,
        product_id: id,
        name: compact.name ?? suggestion.name,
        price: money(product.price),
        image: compact.image || suggestion.image,
        url: compact.url,
        orderable: compact.availability?.orderable !== false,
        selectable: compact.availability?.orderable !== false,
        match,
      });
    } catch {
      output.push({ ...suggestion, selectable: false, match: "unavailable" });
    }
  }
  return output;
}
