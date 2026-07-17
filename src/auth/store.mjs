// Loads and saves the registered SLAS session harvested by login.mjs.
import { chmodSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { dirname } from "node:path";

function validateSession(session) {
  if (!session || typeof session !== "object" || Array.isArray(session)) {
    throw new Error("Invalid session — run the login first.");
  }
  if (typeof session.access_token !== "string" && typeof session.refresh_token !== "string") {
    throw new Error("No token in session — run the login first.");
  }
  return session;
}

export function saveSession(sessionPath, session) {
  const directory = dirname(sessionPath);
  mkdirSync(directory, { recursive: true, mode: 0o700 });
  const serializable = Object.fromEntries(Object.entries(validateSession(session)));
  const temporary = `${sessionPath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  try {
    writeFileSync(temporary, `${JSON.stringify(serializable, null, 2)}\n`, { mode: 0o600, flag: "wx" });
    renameSync(temporary, sessionPath);
    chmodSync(sessionPath, 0o600);
  } finally {
    try {
      unlinkSync(temporary);
    } catch (error) {
      if (error?.code !== "ENOENT") throw error;
    }
  }
}

export function loadSession(sessionPath) {
  const s = validateSession(JSON.parse(readFileSync(sessionPath, "utf8")));
  // Repair permissive files left by older releases before using their tokens.
  chmodSync(sessionPath, 0o600);
  Object.defineProperty(s, "persist", {
    value: () => saveSession(sessionPath, s),
  });
  return s;
}
