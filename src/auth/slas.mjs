// SLAS (Shopper Login and API Access Service) helpers for Ametller Origen's
// headless Salesforce Commerce Cloud storefront.
//
// Two token kinds:
//  - guest: minted here on demand via a public-client PKCE flow (no credentials)
//    — enough to browse catalog (search / product) before the user signs in.
//  - registered: harvested from the user's logged-in browser session (see login.mjs);
//    required for the real basket and order history.
import { createHash, randomBytes } from "node:crypto";

export const SLAS = {
  shortCode: "4jppt37a",
  org: "f_ecom_blzv_prd",
  siteId: "ametller",
  clientId: "fd3c9db8-2a0d-4f4b-9e74-294e068f9ae4",
  redirectUri: "https://www.ametllerorigen.com/callback",
};

export const SCAPI_BASE = `https://${SLAS.shortCode}.api.commercecloud.salesforce.com`;
const AUTH_BASE = `${SCAPI_BASE}/shopper/auth/v1/organizations/${SLAS.org}/oauth2`;

const b64url = (buf) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export function decodeJwt(token) {
  return JSON.parse(Buffer.from(token.split(".")[1], "base64url").toString("utf8"));
}

export function tokenStatus(token) {
  if (!token) return { valid: false, secondsLeft: 0, daysLeft: 0 };
  const exp = decodeJwt(token).exp;
  const secondsLeft = exp - Math.floor(Date.now() / 1000);
  return { valid: secondsLeft > 0, secondsLeft, daysLeft: secondsLeft / 86400 };
}

// Public-client PKCE guest login: authorize (hint=guest) -> code -> token.
// Returns { access_token, refresh_token, customer_id, usid, expires_in }.
export async function getGuestToken() {
  const verifier = b64url(randomBytes(48));
  const challenge = b64url(createHash("sha256").update(verifier).digest());
  const authUrl =
    `${AUTH_BASE}/authorize?client_id=${SLAS.clientId}&response_type=code` +
    `&redirect_uri=${encodeURIComponent(SLAS.redirectUri)}&hint=guest&code_challenge=${challenge}`;

  const authRes = await fetch(authUrl, { redirect: "manual" });
  const location = authRes.headers.get("location");
  if (!location) throw new Error(`SLAS authorize failed (${authRes.status})`);
  const params = new URL(location).searchParams;
  const code = params.get("code");
  const usid = params.get("usid");
  if (!code) throw new Error("SLAS authorize returned no authorization code.");

  const body = new URLSearchParams({
    grant_type: "authorization_code_pkce",
    code,
    code_verifier: verifier,
    client_id: SLAS.clientId,
    redirect_uri: SLAS.redirectUri,
    usid,
    channel_id: SLAS.siteId,
  });
  const tokRes = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!tokRes.ok) throw new Error(`SLAS token exchange failed (${tokRes.status}).`);
  return tokRes.json();
}

// Mint a fresh access token from a stored refresh token (registered or guest).
// SLAS keeps the refresh token in the PWA Kit `cc-nx` / `cc-nx-g` cookie, so a
// harvested session can be renewed without re-opening the browser.
export async function refreshToken(refresh_token) {
  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token,
    client_id: SLAS.clientId,
    channel_id: SLAS.siteId,
  });
  const res = await fetch(`${AUTH_BASE}/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`SLAS refresh failed (${res.status}).`);
  return res.json();
}
