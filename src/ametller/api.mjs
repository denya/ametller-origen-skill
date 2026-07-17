// Authenticated Ametller Origen API client over Salesforce Commerce (SCAPI).
// Catalog reads (search / product) work with a self-minted guest token; the real
// basket and order history need a registered shopper token harvested from the
// user's logged-in browser session (see auth/login.mjs). No checkout, ever.
import { SCAPI_BASE, SLAS, getGuestToken, refreshToken, tokenStatus } from "../auth/slas.mjs";

export class AuthError extends Error {}

const ORG = SLAS.org;
const SITE = SLAS.siteId;
const qs = (o) => new URLSearchParams({ siteId: SITE, ...o }).toString();

export class AmetllerClient {
  // session: { access_token, refresh_token, customer_id } for a registered shopper,
  // or null to browse as a guest.
  constructor(session = null, { refresh = refreshToken } = {}) {
    this.session = session;
    this.refresh = refresh;
    this.guest = null; // { access_token, customer_id } cached guest token
    this.basketId = null;
  }

  get registered() {
    return Boolean(this.session?.access_token || this.session?.refresh_token);
  }

  get customerId() {
    return this.session?.customer_id ?? this.guest?.customer_id ?? null;
  }

  tokenStatus() {
    if (!this.session) return { valid: false, daysLeft: 0 };
    return tokenStatus(this.session.access_token);
  }

  // Signed in = we hold a refresh token (so access tokens can be minted), even if
  // the current 30-min access token has lapsed.
  async authStatus() {
    if (!this.registered) return { signed_in: false, access_token_valid: false };
    try {
      await this.#requireRegisteredCustomer();
      return { signed_in: true, access_token_valid: true };
    } catch (error) {
      if (!(error instanceof AuthError)) throw error;
      return { signed_in: false, access_token_valid: false, reauth_required: true };
    }
  }

  // Return a valid access token, refreshing or minting a guest token as needed.
  async #accessToken() {
    if (this.session) {
      if (tokenStatus(this.session.access_token).secondsLeft > 60) return this.session.access_token;
      if (this.session.refresh_token) {
        let t;
        try {
          t = await this.refresh(this.session.refresh_token);
        } catch {
          throw new AuthError("Ametller session expired. Run the `login` tool to sign in again.");
        }
        this.session.access_token = t.access_token;
        if (t.refresh_token) this.session.refresh_token = t.refresh_token;
        this.session.customer_id = t.customer_id ?? this.session.customer_id;
        this.session.usid = t.usid ?? this.session.usid;
        this.session.persist?.();
        return this.session.access_token;
      }
      throw new AuthError("Ametller session expired. Run the `login` tool to sign in again.");
    }
    if (!this.guest || tokenStatus(this.guest.access_token).secondsLeft <= 60) {
      const t = await getGuestToken();
      this.guest = { access_token: t.access_token, customer_id: t.customer_id };
    }
    return this.guest.access_token;
  }

  async #requireRegisteredCustomer() {
    if (!this.registered) throw new AuthError("Not signed in. Run the `login` tool first.");
    await this.#accessToken();
    if (!this.customerId) throw new AuthError("Ametller session has no customer identity. Run the `login` tool again.");
    return this.customerId;
  }

  async #call(path, { method = "GET", body, raw = false } = {}) {
    const token = await this.#accessToken();
    const res = await fetch(`${SCAPI_BASE}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        ...(body ? { "Content-Type": "application/json" } : {}),
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (res.status === 401) throw new AuthError("Ametller session expired (401). Run the `login` tool to sign in again.");
    if (!res.ok) throw new Error(`${method} ${path.split("?")[0]} failed (${res.status}).`);
    if (raw || res.status === 204) return null;
    return res.json();
  }

  // ---- catalog (guest or registered) ----
  search(query, { limit = 24 } = {}) {
    return this.#call(`/search/shopper-search/v1/organizations/${ORG}/product-search?${qs({ q: query, limit })}`);
  }

  getProduct(productId) {
    return this.#call(`/product/shopper-products/v1/organizations/${ORG}/products/${productId}?${qs({ allImages: "true" })}`);
  }

  // ---- basket / cart (registered) ----
  // Read the customer's active basket id without creating account state.
  async #findExistingBasket() {
    if (this.basketId) return this.basketId;
    const customerId = await this.#requireRegisteredCustomer();
    const data = await this.#call(
      `/customer/shopper-customers/v1/organizations/${ORG}/customers/${customerId}/baskets?${qs({})}`,
    );
    const existing = data?.baskets?.[0]?.basketId;
    if (existing) return (this.basketId = existing);
    return null;
  }

  // Creation is reserved for explicit cart-write methods.
  async #ensureBasketForWrite() {
    const existing = await this.#findExistingBasket();
    if (existing) return existing;
    const created = await this.#call(`/checkout/shopper-baskets/v1/organizations/${ORG}/baskets?${qs({})}`, {
      method: "POST",
      body: {},
    });
    return (this.basketId = created.basketId);
  }

  async getCart() {
    const id = await this.#findExistingBasket();
    if (!id) return null;
    return this.#call(`/checkout/shopper-baskets/v1/organizations/${ORG}/baskets/${id}?${qs({})}`);
  }

  async addToCart(productId, quantity = 1) {
    const id = await this.#ensureBasketForWrite();
    return this.#call(`/checkout/shopper-baskets/v1/organizations/${ORG}/baskets/${id}/items?${qs({})}`, {
      method: "POST",
      body: [{ productId: String(productId), quantity }],
    });
  }

  addManyToCart(items) {
    return this.#ensureBasketForWrite().then((id) =>
      this.#call(`/checkout/shopper-baskets/v1/organizations/${ORG}/baskets/${id}/items?${qs({})}`, {
        method: "POST",
        body: items.map(({ product_id, quantity }) => ({ productId: String(product_id), quantity })),
      }),
    );
  }

  // Find a basket line's itemId for a product (set_quantity / remove need it).
  async #findItem(productId) {
    const cart = await this.getCart();
    return (cart?.productItems || []).find((i) => String(i.productId) === String(productId));
  }

  async setQuantity(productId, quantity) {
    if (quantity <= 0) return this.removeFromCart(productId);
    const item = await this.#findItem(productId);
    if (!item) return this.addToCart(productId, quantity);
    return this.#call(
      `/checkout/shopper-baskets/v1/organizations/${ORG}/baskets/${this.basketId}/items/${item.itemId}?${qs({})}`,
      { method: "PATCH", body: { quantity } },
    );
  }

  async removeFromCart(productId) {
    const item = await this.#findItem(productId);
    if (!item) return this.getCart();
    // DELETE returns the updated basket (HTTP 200); fall back to a read if a
    // future API rev returns 204 instead.
    const basket = await this.#call(
      `/checkout/shopper-baskets/v1/organizations/${ORG}/baskets/${this.basketId}/items/${item.itemId}?${qs({})}`,
      { method: "DELETE" },
    );
    return basket ?? this.getCart();
  }

  // ---- orders (registered) ----
  async getOrders(page = 1, limit = 10) {
    const customerId = await this.#requireRegisteredCustomer();
    const offset = (page - 1) * limit;
    return this.#call(
      `/customer/shopper-customers/v1/organizations/${ORG}/customers/${customerId}/orders?${qs({ offset, limit })}`,
    );
  }

  getAllOrders(options = {}) {
    return collectOrderPages((page, limit) => this.getOrders(page, limit), options);
  }

  async getOrder(orderNo) {
    await this.#requireRegisteredCustomer();
    return this.#call(`/checkout/shopper-orders/v1/organizations/${ORG}/orders/${orderNo}?${qs({})}`);
  }

  async getLatestOrderId() {
    const data = await this.getOrders(1, 1);
    return data?.data?.[0]?.orderNo ?? null;
  }

  async getOrderLines(orderNo) {
    const order = await this.getOrder(orderNo);
    return order.productItems || [];
  }
}

// ---- compact mappers: keep tool output small + readable for the model ----

export function productImage(p) {
  // search hit: p.image.disBaseLink ; product detail: imageGroups[].images[].disBaseLink
  if (p?.image?.disBaseLink || p?.image?.link) return p.image.disBaseLink || p.image.link;
  const group = (p?.imageGroups || []).find((g) => g.viewType === "large") || p?.imageGroups?.[0];
  return group?.images?.[0]?.disBaseLink || group?.images?.[0]?.link;
}

const eur = (n) => (n == null ? undefined : `€${Number(n).toFixed(2)}`);

export function compactProduct(p, extra = {}) {
  if (!p) return null;
  const image = productImage(p);
  const id = p.productId ?? p.id;
  const url = p.slugUrl || (id ? `https://www.ametllerorigen.com/ca/product/${id}.html` : undefined);
  return {
    id,
    name: p.productName ?? p.name,
    ...(p.brand ? { brand: p.brand } : {}),
    ...(eur(p.price) ? { price: eur(p.price) } : {}),
    ...(p.pricePerUnit && p.unitMeasure ? { unit_price: `€${Number(p.pricePerUnit).toFixed(2)}/${p.unitMeasure}` } : {}),
    ...(image ? { image } : {}),
    ...(url ? { url } : {}),
    ...extra,
  };
}

export function compactCart(c) {
  if (!c) return { basket_exists: false, products_count: 0, total: null, lines: [] };
  return {
    basket_exists: true,
    products_count: (c.productItems || []).reduce((n, i) => n + (i.quantity || 0), 0),
    total: eur(c.orderTotal ?? c.productTotal ?? c.productSubTotal),
    lines: (c.productItems || []).map((i) => {
      const lineTotal = i.priceAfterOrderDiscount ?? i.priceAfterItemDiscount ?? i.price;
      return {
        product_id: i.productId,
        name: i.productName,
        quantity: i.quantity,
        ...(lineTotal != null && i.quantity ? { unit_price: eur(lineTotal / i.quantity) } : {}),
        ...(lineTotal != null ? { line_total: eur(lineTotal) } : {}),
      };
    }),
  };
}

export function compactOrder(o) {
  return {
    order_id: o.orderNo,
    date: o.creationDate,
    status: o.status,
    total: eur(o.orderTotal ?? o.productSubTotal),
    items: (o.productItems || []).reduce((n, i) => n + (i.quantity || 0), 0),
  };
}

export function compactOrderLine(l) {
  return {
    product_id: l.productId,
    name: l.productName,
    quantity: l.quantity,
    ...(eur(l.price) ? { price: eur(l.price) } : {}),
  };
}

export async function collectOrderPages(fetchPage, { limit = 50, maxPages = 100 } = {}) {
  const orders = [];
  const signatures = new Set();
  let reportedTotal;
  for (let page = 1; page <= maxPages; page += 1) {
    const response = await fetchPage(page, limit);
    const rows = response?.data || [];
    if (Number.isFinite(Number(response?.total))) reportedTotal = Number(response.total);
    const signature = rows.map((order) => order.orderNo).join("|");
    if (rows.length && signatures.has(signature)) throw new Error("Order pagination repeated a page; stopped safely.");
    if (rows.length) signatures.add(signature);
    orders.push(...rows);
    if (!rows.length || rows.length < limit || (reportedTotal != null && orders.length >= reportedTotal)) {
      return { data: orders, total: reportedTotal ?? orders.length, pages: page };
    }
  }
  throw new Error(`Order pagination exceeded the ${maxPages}-page safety limit.`);
}
