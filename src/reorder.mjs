import assert from "node:assert/strict";
import { AuthError } from "./ametller/api.mjs";
import { canonicalCart, encodeCart, quantities, restoreCart } from "./cart-e2e.mjs";

export class SafeReorderError extends Error {
  constructor(message, { restored = false, cause } = {}) {
    super(message, { cause });
    this.name = "SafeReorderError";
    this.restored = restored;
  }
}

function rejectedLine(line, reason) {
  const productId = line?.productId == null ? undefined : String(line.productId);
  return {
    ...(productId ? { product_id: productId } : {}),
    name: line?.productName || line?.name || "Unknown historical line",
    quantity: Number(line?.quantity) || 0,
    reason,
  };
}

function isPromotionalLine(line) {
  return Boolean(
    line?.bonusProductLineItem
    || line?.bonusProductLineItemUUID
    || line?.c_bonusProductLineItem
    || line?.c_isBonusProduct,
  ) || (line?.price != null && Number(line.price) === 0);
}

function quantityFitsProduct(quantity, product) {
  if (!Number.isInteger(quantity) || quantity < 1) return false;
  const minimum = Number(product?.minOrderQuantity ?? 1);
  const step = Number(product?.stepQuantity ?? 1);
  if (!Number.isFinite(minimum) || !Number.isFinite(step) || minimum <= 0 || step <= 0) return false;
  if (quantity < minimum) return false;
  return Math.abs((quantity - minimum) / step - Math.round((quantity - minimum) / step)) < 1e-9;
}

export async function previewReorder(client, orderId) {
  const id = orderId ?? (await client.getLatestOrderId());
  if (!id) throw new SafeReorderError("No orders found on this account.");
  const lines = await client.getOrderLines(id);
  const validated = [];
  const rejected = [];

  for (const line of lines) {
    const productId = line?.productId == null ? "" : String(line.productId);
    const quantity = Number(line?.quantity);
    if (!productId) {
      rejected.push(rejectedLine(line, "unresolved_product"));
      continue;
    }
    if (isPromotionalLine(line)) {
      rejected.push(rejectedLine(line, "promotion_or_bonus_line"));
      continue;
    }
    if (!Number.isInteger(quantity) || quantity < 1) {
      rejected.push(rejectedLine(line, "unsupported_quantity"));
      continue;
    }

    let product;
    try {
      product = await client.getProduct(productId);
    } catch (error) {
      if (error instanceof AuthError) throw error;
      rejected.push(rejectedLine(line, "not_found_in_current_catalog"));
      continue;
    }
    const currentId = product?.productId ?? product?.id;
    if (currentId == null || String(currentId) !== productId) {
      rejected.push(rejectedLine(line, "catalog_id_mismatch"));
      continue;
    }
    if ((product?.inventory?.orderable ?? product?.orderable) === false) {
      rejected.push(rejectedLine(line, "currently_unavailable"));
      continue;
    }
    if (!quantityFitsProduct(quantity, product)) {
      rejected.push(rejectedLine(line, "current_pack_or_quantity_incompatible"));
      continue;
    }
    validated.push({
      product_id: productId,
      name: product.productName ?? product.name ?? line.productName,
      quantity,
      ...(product.price != null ? { current_price: Number(product.price) } : {}),
      min_quantity: Number(product.minOrderQuantity ?? 1),
      step_quantity: Number(product.stepQuantity ?? 1),
    });
  }

  return {
    order_id: String(id),
    approval_required: true,
    can_apply: validated.length > 0,
    validated,
    rejected,
    approved_items_template: validated.map(({ product_id, quantity }) => ({ product_id, quantity })),
  };
}

function approvedSubset(preview, approvedItems) {
  if (!Array.isArray(approvedItems) || approvedItems.length === 0) {
    throw new SafeReorderError("No reorder items were explicitly approved.");
  }
  const available = new Map(preview.validated.map((item) => [item.product_id, item]));
  const seen = new Set();
  return approvedItems.map((item) => {
    const productId = String(item.product_id);
    if (seen.has(productId)) throw new SafeReorderError("The approved reorder list contains a duplicate product.");
    seen.add(productId);
    const current = available.get(productId);
    if (!current || item.quantity !== current.quantity) {
      throw new SafeReorderError("The approved reorder list no longer matches the fresh preview. Preview again.");
    }
    return current;
  });
}

function assertExpectedItems(cart, expected) {
  const actual = quantities(cart);
  assert.equal(actual.size, expected.size, "reorder verification found an unexpected cart line");
  for (const [productId, quantity] of expected) {
    assert.equal(actual.get(productId), quantity, `reorder verification failed for ${productId}`);
  }
}

export async function applyApprovedReorder(client, { orderId, approvedItems, restoreAttempts = 3 }) {
  if (orderId == null || String(orderId).length === 0) {
    throw new SafeReorderError("A reorder preview order_id is required.");
  }
  const preview = await previewReorder(client, orderId);
  const approved = approvedSubset(preview, approvedItems);
  let original;
  try {
    original = canonicalCart(await client.getCart());
  } catch (error) {
    throw new SafeReorderError(
      "Reorder refused: the current basket contains a complex or unsupported line and cannot be losslessly restored.",
      { cause: error },
    );
  }
  if (!original.exists) {
    throw new SafeReorderError("Reorder refused: no existing basket can be losslessly restored on failure.");
  }
  const expected = quantities(original);
  for (const item of approved) {
    expected.set(item.product_id, (expected.get(item.product_id) || 0) + item.quantity);
  }

  let writeAttempted = false;
  try {
    for (const item of approved) {
      writeAttempted = true;
      await client.addToCart(item.product_id, item.quantity);
    }
    const rawCart = await client.getCart();
    assertExpectedItems(canonicalCart(rawCart), expected);
    return {
      reordered_from: preview.order_id,
      added_lines: approved.length,
      added_quantity: approved.reduce((sum, item) => sum + item.quantity, 0),
      cart: rawCart,
    };
  } catch (error) {
    if (!writeAttempted) throw error;
    let restored;
    try {
      restored = await restoreCart(client, original, { attempts: restoreAttempts });
      assert.equal(encodeCart(restored), encodeCart(original));
    } catch (restoreError) {
      throw new SafeReorderError(
        "Reorder failed and exact cart restoration could not be verified. Stop cart writes and inspect the basket.",
        { cause: restoreError },
      );
    }
    throw new SafeReorderError("Reorder failed; the original cart was restored exactly.", {
      restored: true,
      cause: error,
    });
  }
}
