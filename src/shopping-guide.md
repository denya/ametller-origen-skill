---
name: ametller-origen
description: Shop at Ametller Origen and ALWAYS show products as an HTML artifact. Use whenever the user searches, browses, compares, or asks about any Ametller Origen grocery products ("options", "show me…"), or wants to fill, review, or reorder their cart. Presents product results as an HTML artifact photo grid (photo, name, price, link) with images embedded as base64 — downloaded and converted via a script, because remote image URLs don't render in the artifact sandbox. Uses the ametller tools.
---

# Ametller Origen shopping

When the user asks about ANY Ametller Origen products (search, browse, compare, "options",
a past order), **ALWAYS present them as an HTML artifact** — a photo grid where each card has the
product photo, name, price, and a link to the product `url`.

For purchase analytics, call `ametller_purchase_insights`. In clients that support MCP Apps it already renders the official interactive charts and suggestion picker, so do not wrap it in a second artifact.

**Photos must be base64-embedded.** Get the products from the ametller tools, then with your code
tool: download each product's `image` URL, convert it to base64 in a script, and embed it as
`<img src="data:image/jpeg;base64,...">`. A remote `http(s)` image URL will NOT render inside the
artifact — only embedded base64 does. Keep to ~12 products. Doing the base64 inside the script keeps
it out of the conversation and renders reliably on the first try.

## Shopping

- You operate the user's REAL Ametller Origen cart. The user reviews and pays on the Ametller Origen
  site/app — you never check out (there is no checkout tool, by design).
- To add an item you first need its `product_id`: call `search_products` (a short Catalan term works
  best, e.g. "llet", "pa", "ous", "tomàquet"; Spanish/English may also match), pick the best match,
  then `add_to_cart`. Ametller Origen is a fresh-food grocer with many own-label products — pick the
  best match for the request, preferring the own brand when the user wants the store's own product.
- Repeat a past shop: call `preview_reorder` first. Show every freshly validated and rejected line,
  ask the user to approve an exact subset, then call `reorder_order` with only that subset. It adds to
  the basket and never checks out. `get_order_items` is an unvalidated historical view.
- `get_cart` to review and report the running total. Only call `add_to_cart` / `set_quantity` /
  `remove_from_cart` when the user explicitly asks to change the real cart.
- Smart suggestions are read-only until the user checks products and presses **Add selected to real basket**. Never preselect or auto-add a suggestion.
- Match name, brand, package size, and price. Never silently replace an unavailable product with a
  same-price product, different pack, or different brand.
- Prices are euros. If a delivery minimum applies it is enforced on the site at checkout; if the cart
  looks small, you can mention it (don't refuse).
- To sign in — or if a tool reports the session expired (a tool says "not signed in") — call the `login`
  tool: a browser window opens, the user signs in (handling any 2FA), and the session is saved. Then retry.
