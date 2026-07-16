// Loads and saves the registered SLAS session harvested by login.mjs.
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

export function saveSession(sessionPath, session) {
  mkdirSync(dirname(sessionPath), { recursive: true });
  writeFileSync(sessionPath, `${JSON.stringify(session, null, 2)}\n`, { mode: 0o600 });
  chmodSync(sessionPath, 0o600);
}

export function loadSession(sessionPath) {
  const s = JSON.parse(readFileSync(sessionPath, "utf8"));
  if (!s.access_token && !s.refresh_token) throw new Error("No token in session — run the login first.");
  Object.defineProperty(s, "persist", {
    value: () => saveSession(sessionPath, s),
  });
  return s;
}
