# API map

Ametller Origen's online store uses Salesforce Commerce Cloud PWA Kit.

Public storefront configuration:

- Site: `ametller`
- Organization: `f_ecom_blzv_prd`
- Short code: `4jppt37a`
- API base: `https://4jppt37a.api.commercecloud.salesforce.com`

Implemented shopper APIs:

| Purpose | Salesforce API |
|---|---|
| Guest and registered auth | SLAS `/shopper/auth/.../oauth2` |
| Catalog search | Shopper Search `product-search` |
| Product details | Shopper Products `products/{id}` |
| Active basket | Shopper Customers `customers/{id}/baskets` |
| Basket lines | Shopper Baskets `baskets/{id}/items` |
| Online orders | Shopper Customers `customers/{id}/orders` |
| Online order details | Shopper Orders `orders/{orderNo}` |

Product output also surfaces official image variants, category id, unit/minimum/step quantities, and orderable/backorder/preorder flags already present in storefront responses. Deliberately do not present the deployment's placeholder stock count as real inventory.

`orders` represents e-commerce orders. It does not expose the in-store POS tickets delivered by email. Use the Gmail workflow for offline purchases.

Useful Salesforce shopper capabilities not yet implemented include category/refinement browsing, dedicated search suggestions and promotions, product lists/wishlists, coupons, shipping methods, and delivery-slot/checkout flows. The first four are reasonable future read/preparation features after live storefront validation. Shipping, delivery, payment, and order placement stay outside this checkout-free project.

The public client identifiers in `src/auth/slas.mjs` are storefront configuration, not customer secrets.
