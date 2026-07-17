#!/usr/bin/env node
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AmetllerClient,
  compactCart,
  compactOrder,
  compactOrderLine,
  compactProduct,
} from "../src/ametller/api.mjs";
import { loadSession } from "../src/auth/store.mjs";

const sessionPath = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");
const [command, ...args] = process.argv.slice(2);

function registeredClient() {
  if (!fs.existsSync(sessionPath)) throw new Error("Not signed in. Run: npm run login");
  return new AmetllerClient(loadSession(sessionPath));
}

const guest = new AmetllerClient();
let result;

switch (command) {
  case "status":
    result = fs.existsSync(sessionPath) ? await registeredClient().authStatus() : { signed_in: false };
    break;
  case "search": {
    const query = args.join(" ").trim();
    if (!query) throw new Error("Usage: npm run cli -- search <query>");
    const data = await guest.search(query, { limit: 24 });
    result = (data.hits || []).map(compactProduct);
    break;
  }
  case "product":
    if (!args[0]) throw new Error("Usage: npm run cli -- product <product-id>");
    result = compactProduct(await guest.getProduct(args[0]));
    break;
  case "cart":
    result = compactCart(await registeredClient().getCart());
    break;
  case "orders": {
    if (args[0] === "all") {
      const data = await registeredClient().getAllOrders();
      result = { total: data.total, pages: data.pages, orders: data.data.map(compactOrder) };
      break;
    }
    const page = Number(args[0] || 1);
    if (!Number.isInteger(page) || page < 1) throw new Error("Page must be a positive integer");
    result = (await registeredClient().getOrders(page)).data?.map(compactOrder) || [];
    break;
  }
  case "order": {
    const client = registeredClient();
    const id = args[0] || (await client.getLatestOrderId());
    if (!id) throw new Error("No online order found");
    result = { order_id: id, items: (await client.getOrderLines(id)).map(compactOrderLine) };
    break;
  }
  case "add": {
    const [productId, rawQuantity = "1"] = args;
    const quantity = Number(rawQuantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 1) {
      throw new Error("Usage: npm run cli -- add <product-id> [quantity]");
    }
    result = compactCart(await registeredClient().addToCart(productId, quantity));
    break;
  }
  case "set": {
    const [productId, rawQuantity] = args;
    const quantity = Number(rawQuantity);
    if (!productId || !Number.isInteger(quantity) || quantity < 0) {
      throw new Error("Usage: npm run cli -- set <product-id> <quantity>");
    }
    result = compactCart(await registeredClient().setQuantity(productId, quantity));
    break;
  }
  case "remove":
    if (!args[0]) throw new Error("Usage: npm run cli -- remove <product-id>");
    result = compactCart(await registeredClient().removeFromCart(args[0]));
    break;
  default:
    throw new Error("Usage: npm run cli -- <status|search|product|cart|orders|order|add|set|remove>");
}

console.log(JSON.stringify(result, null, 2));
