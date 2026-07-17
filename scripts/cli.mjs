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
import { buildInsights, enrichSuggestions, offlineEvents, onlineEvents } from "../src/analytics.mjs";
import { readTickets } from "../src/tickets.mjs";

process.on("uncaughtException", (error) => {
  const safe = /^(?:Usage:|Page must|Ticket limit|Insight limit|No online order|Not signed in\.)/.test(error?.message);
  console.error(safe ? error.message : "Ametller command failed. Retry once; if it persists, run npm run login.");
  process.exit(1);
});

const sessionPath = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");
const ticketDir = process.env.AMETLLER_TICKET_DIR || path.join(os.homedir(), ".ametller", "tickets");
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
  case "tickets": {
    const limit = Number(args[0] || 100);
    if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw new Error("Ticket limit must be 1-500");
    const data = await readTickets(ticketDir, { limit, includeItems: true });
    result = { count: data.tickets.length, ...data };
    break;
  }
  case "insights":
  case "suggestions": {
    const limit = Number(args[0] || 12);
    if (!Number.isInteger(limit) || limit < 1 || limit > 20) throw new Error("Insight limit must be 1-20");
    const client = registeredClient();
    // Keep registered token refresh/rotation sequential; concurrent first calls
    // could each try to rotate the same refresh token.
    const orders = await client.getAllOrders();
    const tickets = await readTickets(ticketDir, { limit: 500, includeItems: true });
    const cart = await client.getCart();
    const insights = buildInsights([
      ...onlineEvents(orders.data || []),
      ...offlineEvents(tickets.tickets),
    ], { cart, limit });
    insights.suggestions = await enrichSuggestions(client, insights.suggestions, { maxLookups: limit });
    result = command === "suggestions" ? insights.suggestions : insights;
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
    throw new Error("Usage: npm run cli -- <status|search|product|cart|orders|order|tickets|insights|suggestions|add|set|remove>");
}

console.log(JSON.stringify(result, null, 2));
