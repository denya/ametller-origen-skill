import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

function validDate(value) {
  return /^\d{4}-\d{2}-\d{2}$/.test(String(value || ""));
}

function compactTicket(ticket, { includeItems = true } = {}) {
  const items = Array.isArray(ticket.items) ? ticket.items.filter((item) => item?.name) : [];
  return {
    id: String(ticket.id),
    date: ticket.date,
    store: typeof ticket.store === "string" ? ticket.store : "Ametller Origen",
    total: Number(ticket.totalAmount) || 0,
    item_count: items.length,
    ...(includeItems ? {
      items: items.map((item) => ({
        name: String(item.name),
        quantity: Number(item.quantity) || 0,
        unit: item.unit === "kg" ? "kg" : "ud",
        unit_price: Number(item.pricePerUnit) || 0,
        total: Number(item.totalPrice) || 0,
      })),
    } : {}),
  };
}

export async function ingestTickets(ticketDir, tickets, { overwrite = false } = {}) {
  await fs.mkdir(ticketDir, { recursive: true, mode: 0o700 });
  await fs.chmod(ticketDir, 0o700);
  let written = 0;
  let skippedExisting = 0;
  let failed = 0;
  for (const ticket of tickets) {
    const stored = {
      id: String(ticket.id),
      date: ticket.date,
      store: ticket.store || "Ametller Origen",
      ...(ticket.invoice_number ? { invoiceNumber: ticket.invoice_number } : {}),
      totalAmount: Number(ticket.total),
      items: ticket.items.map((item) => ({
        name: String(item.name),
        quantity: Number(item.quantity),
        unit: item.unit === "kg" ? "kg" : "ud",
        pricePerUnit: Number(item.unit_price) || 0,
        totalPrice: Number(item.total) || 0,
      })),
      source: "gmail-connector",
    };
    const digest = createHash("sha256").update(stored.id).digest("hex").slice(0, 24);
    const file = path.join(ticketDir, `gmail-${digest}.json`);
    try {
      await fs.writeFile(file, `${JSON.stringify(stored, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: overwrite ? "w" : "wx",
      });
      await fs.chmod(file, 0o600);
      written += 1;
    } catch (error) {
      if (error?.code === "EEXIST") skippedExisting += 1;
      else failed += 1;
    }
  }
  return {
    received: tickets.length,
    written,
    skipped_existing: skippedExisting,
    failed,
  };
}

export async function readTickets(ticketDir, {
  from,
  to,
  limit = 100,
  includeItems = true,
} = {}) {
  if (from && !validDate(from)) throw new Error("from must use YYYY-MM-DD");
  if (to && !validDate(to)) throw new Error("to must use YYYY-MM-DD");
  let names;
  try {
    names = await fs.readdir(ticketDir);
    await fs.chmod(ticketDir, 0o700);
  } catch (error) {
    if (error?.code === "ENOENT") return { tickets: [], invalid_files: 0 };
    throw error;
  }
  const tickets = [];
  let invalidFiles = 0;
  for (const name of names.filter((value) => value.endsWith(".json")).sort()) {
    try {
      const file = path.join(ticketDir, name);
      await fs.chmod(file, 0o600);
      const ticket = JSON.parse(await fs.readFile(file, "utf8"));
      if (!ticket?.id || !validDate(ticket?.date) || !Array.isArray(ticket?.items)) throw new Error("invalid ticket");
      if (from && ticket.date < from) continue;
      if (to && ticket.date > to) continue;
      tickets.push(compactTicket(ticket, { includeItems }));
    } catch {
      invalidFiles += 1;
    }
  }
  tickets.sort((a, b) => b.date.localeCompare(a.date));
  return { tickets: tickets.slice(0, Math.max(1, Math.min(500, limit))), invalid_files: invalidFiles };
}

function parseSummary(stdout) {
  try {
    const value = JSON.parse(stdout);
    return {
      matched_messages: Number(value.matched_messages) || 0,
      written: Number(value.written) || 0,
      skipped_existing: Number(value.skipped_existing) || 0,
      failed: Number(value.failed) || 0,
    };
  } catch {
    return null;
  }
}

export async function syncTickets({ scriptPath, ticketDir, overwrite = false, limit } = {}) {
  const args = [scriptPath, "--tickets-dir", ticketDir];
  if (overwrite) args.push("--overwrite");
  if (limit) args.push("--limit", String(limit));
  try {
    const { stdout } = await execFileAsync("python3", args, {
      encoding: "utf8",
      timeout: 5 * 60_000,
      maxBuffer: 1024 * 1024,
    });
    const summary = parseSummary(stdout);
    if (!summary) throw new Error("invalid sync output");
    return summary;
  } catch (error) {
    const partial = parseSummary(error?.stdout);
    if (partial) return { ...partial, incomplete: true };
    if (error?.code === "ENOENT") {
      throw new Error("Offline ticket sync requires Python 3 and the authenticated gws CLI on PATH.");
    }
    throw new Error("Offline ticket sync failed. Confirm gws is authenticated and network access is available.");
  }
}
