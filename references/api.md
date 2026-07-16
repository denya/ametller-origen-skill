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

`orders` represents e-commerce orders. It does not expose the in-store POS tickets delivered by email. Use the Gmail workflow for offline purchases.

The public client identifiers in `src/auth/slas.mjs` are storefront configuration, not customer secrets.
