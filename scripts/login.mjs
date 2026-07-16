// Setup runner for the login: opens a browser, you sign in, and the session is
// saved to the persistent path the server reads by default (~/.ametller).
import os from "node:os";
import path from "node:path";
import { runLogin } from "../src/auth/login.mjs";

const dest = process.env.AMETLLER_SESSION_PATH || path.join(os.homedir(), ".ametller", "session.json");
console.error("Opening a browser — log in to Ametller Origen (handle any 2FA yourself). Waiting up to 5 min...");
runLogin(dest)
  .then((r) => console.error(`✓ Signed in. Saved to ${dest} — token valid ~${Math.round(r.daysLeft)} days.`))
  .catch((e) => {
    console.error("✗ Login failed:", e.message);
    process.exit(1);
  });
