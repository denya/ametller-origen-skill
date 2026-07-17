import { compactProduct } from "./ametller/api.mjs";

const number = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value) => Math.round((number(value) + Number.EPSILON) * 100) / 100;
const day = (value) => String(value || "").slice(0, 10);
const DAY_MS = 86_400_000;
const atNoon = (value) => Date.parse(`${day(value)}T12:00:00Z`);
const daysBetween = (from, to) => Math.max(0, Math.round((atNoon(to) - atNoon(from)) / DAY_MS));
const median = (values) => {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
};

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

export function isProductLine(name) {
  const value = normalizeProductName(name);
  if (!value || /^(?:groceries|various items|producte sense nom|product without name)$/.test(value)) return false;
  return !/^parking\b/.test(value);
}

// ponytail: Offline receipts do not carry catalog taxonomy. Keep this small,
// explicit heuristic until the storefront exposes a stable receipt-to-product id.
export function inferOfflineCategory(name) {
  const value = normalizeProductName(name);
  const groups = [
    ["Begudes", /\b(aigua|suc|cervesa|vi|cava|refresc|kombutxa|te)\b/],
    ["Fruita i verdura", /\b(poma|pera|platan|taronja|mandarina|maduixa|fruita|tomac|tomaquet|patata|ceba|carbasso|alvocat|ruca|amanida|enciam|espinac|verdura|mor\w*|gerd\w*|nabiu\w*|cirer\w*|cogombre\w*|kiwi|pebrot\w*|esparrec\w*|sindria|raim|carxof\w*)\b/],
    ["Lactis i ous", /\b(llet|quefir|kefir|iogurt|yogur|formatge|queso|nata|mantega|ou|ous|skyr|mozzarella|burrata|stracciatella|parmigiano|parmesa\w*|actimel|auvergne)\b/],
    ["Carn i xarcuteria", /\b(pollastre|vedella|porc|pernil|salsitxa|botifarra|xori|fuet|salami|colbasa|carn|duroc|gall|indi|indiot|baco|bacon)\b/],
    ["Peix", /\b(peix|salmo\w*|tonyin\w*|bacall\w*|gamb\w*|lluc\w*|sardin\w*|anguila\w*)\b/],
    ["Forn", /\b(pa|baguette|croissant|brioche|galeta|coca|pastis)\b/],
    ["Rebost", /\b(arros|pasta|oli|vinagre|farina|cereal|llegum|salsa|conserva|xocolata|sucre|sal)\b/],
    ["Preparats", /\b(pizza|sopa|crema|hummus|truita|croqueta|pate|foie|preparat|sushi|dragon)\b/],
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

export function cleanPurchaseEvents(events = []) {
  const candidates = events.filter((event) => event?.date && isProductLine(event?.name));
  const purchases = new Map();
  for (const event of candidates) {
    const key = `${event.source || "unknown"}:${event.purchase_id || "unknown"}:${event.date}`;
    const purchase = purchases.get(key) || [];
    purchase.push(event);
    purchases.set(key, purchase);
  }

  const seen = new Set();
  const clean = [];
  let exactDuplicatesRemoved = 0;
  for (const purchase of purchases.values()) {
    const first = purchase[0];
    const fingerprint = JSON.stringify([
      first.source,
      first.date,
      money(first.purchase_total),
      purchase.map((event) => [
        event.product_id ? `id:${event.product_id}` : `name:${normalizeProductName(event.name)}`,
        number(event.quantity),
        money(event.spend),
      ]).sort((left, right) => JSON.stringify(left).localeCompare(JSON.stringify(right))),
    ]);
    if (seen.has(fingerprint)) {
      exactDuplicatesRemoved += 1;
      continue;
    }
    seen.add(fingerprint);
    clean.push(...purchase);
  }
  return {
    events: clean,
    audit: {
      input_lines: events.length,
      product_lines: clean.length,
      removed_lines: events.length - candidates.length,
      exact_duplicate_purchases_removed: exactDuplicatesRemoved,
    },
  };
}

function productKeyResolver(events) {
  const idsByName = new Map();
  for (const event of events) {
    if (!event.product_id) continue;
    const normalized = normalizeProductName(event.name);
    const ids = idsByName.get(normalized) || new Set();
    ids.add(String(event.product_id));
    idsByName.set(normalized, ids);
  }
  return (event) => {
    if (event.product_id) return `id:${event.product_id}`;
    const normalized = normalizeProductName(event.name);
    const ids = idsByName.get(normalized);
    return ids?.size === 1 ? `id:${[...ids][0]}` : `name:${normalized}`;
  };
}

function proteinFamily(name) {
  const value = ` ${normalizeProductName(name)} `;
  const patterns = [
    ["eggs", /\bous\b/],
    ["chicken", /\b(?:pollastre|gall dindi|indiot)\b/],
    ["beef", /\bvedella\b/],
    ["shellfish", /\b(?:gamba|llagosti|marisc|escamarla)\w*\b/],
    ["salmon", /\bsalmo\w*\b/],
    ["tuna", /\btonyina\b/],
    ["white-fish", /\b(?:bacalla|lluc|orada|llobarro|sardina|seito|rap)\w*\b/],
    ["pork", /\b(?:pernil|salsitxa|fuet|porc|llom|xoric|baco|bacon|botifarra)\w*\b/],
    ["other-meat", /\b(?:xai|corder|conill)\b/],
  ];
  return patterns.find(([, pattern]) => pattern.test(value))?.[0] || null;
}

function buildProductGroups(events, keyFor) {
  const groups = new Map();
  for (const event of events) {
    const key = keyFor(event);
    const category = event.category || "Altres";
    const group = groups.get(key) || {
      key,
      product_id: event.product_id,
      name: event.name,
      category,
      image: event.image,
      quantity: 0,
      spend: 0,
      events: 0,
      dates: [],
      quantities_by_day: new Map(),
      names: new Set(),
      sources: new Set(),
      latest_unit_price: 0,
      latest_price_date: "",
      latest_name_date: "",
    };
    group.quantity += event.quantity;
    group.spend += event.spend;
    group.events += 1;
    group.dates.push(event.date);
    group.quantities_by_day.set(event.date, (group.quantities_by_day.get(event.date) || 0) + event.quantity);
    group.names.add(normalizeProductName(event.name));
    group.sources.add(event.source);
    if (!group.product_id && event.product_id) group.product_id = event.product_id;
    if (!group.image && event.image) group.image = event.image;
    if (event.date >= group.latest_name_date) {
      group.name = event.name;
      group.category = category;
      group.latest_name_date = event.date;
    }
    if (event.unit_price && event.date >= group.latest_price_date) {
      group.latest_unit_price = event.unit_price;
      group.latest_price_date = event.date;
    }
    groups.set(key, group);
  }
  return groups;
}

function purchaseDayBaskets(events, keyFor) {
  const baskets = new Map();
  for (const event of events) {
    const basket = baskets.get(event.date) || new Map();
    const key = keyFor(event);
    basket.set(key, (basket.get(key) || 0) + event.quantity);
    baskets.set(event.date, basket);
  }
  return [...baskets.entries()]
    .map(([date, items]) => ({ date, items }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

function normalizedScores(values) {
  const maximum = Math.max(0, ...values.values());
  return new Map([...values].map(([key, value]) => [key, maximum ? value / maximum : 0]));
}

function recencyScores(groups, targetDate) {
  const raw = new Map();
  for (const group of groups.values()) {
    const dates = [...new Set(group.dates)];
    raw.set(group.key, dates.reduce((sum, purchaseDate) => {
      const age = daysBetween(purchaseDate, targetDate);
      return sum
        + 0.5 * Math.exp(-Math.LN2 * age / 10)
        + 0.3 * Math.exp(-Math.LN2 * age / 30)
        + 0.2 * Math.exp(-Math.LN2 * age / 120);
    }, 0));
  }
  return normalizedScores(raw);
}

function proteinRotationScores(groups, baskets, targetDate) {
  const datesByFamily = new Map();
  for (const basket of baskets) {
    const families = new Set([...basket.items.keys()]
      .map((key) => proteinFamily(groups.get(key)?.name))
      .filter(Boolean));
    for (const family of families) datesByFamily.set(family, [...(datesByFamily.get(family) || []), basket.date]);
  }
  const raw = new Map();
  for (const [family, dates] of datesByFamily) {
    const elapsed = daysBetween(dates.at(-1), targetDate);
    const longFrequency = dates.length / Math.max(1, baskets.length);
    raw.set(family, Math.sqrt(longFrequency) * (1 - Math.exp(-Math.LN2 * elapsed / 14)));
  }
  return normalizedScores(raw);
}

function recencySuggestion(group, score, targetDate, model) {
  const dates = [...new Set(group.dates)].filter(Boolean).sort();
  const gaps = dates.slice(1).map((value, index) => daysBetween(dates[index], value)).filter(Boolean);
  const recentQuantities = dates.slice(-5).map((dateValue) => group.quantities_by_day.get(dateValue) || 1);
  return {
    key: group.key,
    product_id: group.product_id,
    name: group.name,
    category: group.category,
    image: group.image,
    purchase_count: dates.length,
    last_bought: dates.at(-1),
    typical_gap_days: gaps.length ? Math.round(median(gaps)) : null,
    days_since: daysBetween(dates.at(-1), targetDate),
    quantity: Math.max(1, Math.min(12, Math.round(median(recentQuantities)))),
    expected_price: money(group.latest_unit_price),
    source: group.sources.size === 1 ? [...group.sources][0] : "online+offline",
    score: Math.round(score * 1000) / 1000,
    model,
  };
}

export function buildInsights(events, {
  cart = null,
  limit = 12,
  now = new Date(),
  suggestionMode = "repeat",
} = {}) {
  const cleaned = cleanPurchaseEvents(events);
  const clean = cleaned.events;
  const purchases = uniquePurchases(clean);
  const categoryMap = new Map();
  const monthlyMap = new Map();
  const sourceMap = new Map();
  const keyFor = productKeyResolver(clean);
  const productMap = buildProductGroups(clean, keyFor);
  const baskets = purchaseDayBaskets(clean, keyFor);

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

  }

  const lineSpend = [...categoryMap.values()].reduce((sum, item) => sum + item.spend, 0);
  const categories = [...categoryMap.values()]
    .map((item) => ({ ...item, share: lineSpend ? money((item.spend / lineSpend) * 100) : 0 }))
    .sort((a, b) => b.spend - a.spend);
  const products = [...productMap.values()];
  const byRegularity = (a, b) => b.purchase_count - a.purchase_count || b.quantity - a.quantity || b.spend - a.spend;
  const productStats = products.map((group) => ({
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
    }));
  const topProducts = [...productStats]
    .sort(byRegularity)
    .slice(0, limit);
  const categoryLeaders = categories.map(({ category, heuristic }) => ({
    ...productStats.filter((product) => product.category === category).sort(byRegularity)[0],
    heuristic,
  }));

  const targetDate = day(now.toISOString());
  const recency = recencyScores(productMap, targetDate);
  const rotation = suggestionMode === "protein-rotation"
    ? proteinRotationScores(productMap, baskets, targetDate)
    : new Map();
  const model = suggestionMode === "protein-rotation"
    ? "experimental-protein-rotation-30"
    : "multi-scale-recency-30";
  const cartLines = cart?.productItems || cart?.lines || [];
  const cartIds = new Set(cartLines
    .map((item) => item.productId ?? item.product_id)
    .filter((value) => value != null)
    .map(String));
  const cartNames = new Set(cartLines.map((item) => normalizeProductName(item.productName ?? item.name)).filter(Boolean));
  const suggestions = products
    .map((group) => {
      const family = proteinFamily(group.name);
      const score = (recency.get(group.key) || 0) + (family ? 0.2 * (rotation.get(family) || 0) : 0);
      return recencySuggestion(group, score, targetDate, model);
    })
    .filter((suggestion) => !suggestion.product_id || !cartIds.has(String(suggestion.product_id)))
    .filter((suggestion) => ![...cartNames].some((name) => productMap.get(suggestion.key)?.names.has(name)))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name))
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
    category_leaders: categoryLeaders,
    top_products: topProducts,
    suggestions,
    prediction: {
      model,
      purchase_days: baskets.length,
      ...cleaned.audit,
    },
    notes: [
      "Monthly and total spend use order/receipt totals.",
      "Category spend uses line totals; offline discounts are not allocated across categories.",
      "Offline categories are name-based estimates and are marked heuristic.",
      "Suggestions rank repeat purchases with 10/30/120-day recency; unseen products require a separate live-catalog exploration.",
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

export async function enrichSuggestions(client, suggestions, {
  maxLookups = 8,
  excludeProductIds = [],
} = {}) {
  const output = [];
  const resolvedIds = new Set();
  const excludedIds = new Set(excludeProductIds.map(String));
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
      if (excludedIds.has(id)) continue;
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
