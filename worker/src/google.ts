/**
 * "Continue with Google" (Google Identity Services). The browser gets an ID token (a JWT signed by
 * Google) and posts it to /auth/google; we check it here against Google's published keys, never
 * trusting anything the browser says about who it is. Off unless GOOGLE_CLIENT_ID is set.
 * https://developers.google.com/identity/openid-connect/openid-connect#validatinganidtoken
 */
import type { Env } from "./index";

export const GOOGLE_JWKS = "https://www.googleapis.com/oauth2/v3/certs";
const ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);
const SKEW_S = 300;

export type GoogleUser = { sub: string; email: string; given_name: string | null; name: string | null };
type Jwk = JsonWebKey & { kid?: string };

// Google rotates its keys every few days and says how long to cache them (Cache-Control max-age).
let jwks: { keys: Jwk[]; until: number } | null = null;
export const resetJwksCache = () => { jwks = null; };

async function keysFor(kid: string, fetchImpl: typeof fetch, now: number): Promise<Jwk | undefined> {
  for (const fresh of [false, true]) {
    if (fresh || !jwks || jwks.until < now) {
      const r = await fetchImpl(GOOGLE_JWKS);
      if (!r.ok) throw new Error(`google jwks ${r.status}`);
      const maxAge = Number((r.headers.get("cache-control") ?? "").match(/max-age=(\d+)/)?.[1] ?? 3600);
      jwks = { keys: ((await r.json()) as { keys: Jwk[] }).keys ?? [], until: now + Math.min(maxAge, 86_400) * 1000 };
    }
    const k = jwks.keys.find((k) => k.kid === kid);
    if (k) return k;
    if (fresh) break;
  }
  return undefined;
}

const b64urlBytes = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const b64urlJson = (s: string) => JSON.parse(new TextDecoder().decode(b64urlBytes(s)));

/** The Google account behind a GIS credential, or null if it isn't a valid, unexpired token for
 *  our client with a verified email. */
export async function verifyGoogleIdToken(env: Env, credential: unknown, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<GoogleUser | null> {
  if (!env.GOOGLE_CLIENT_ID || typeof credential !== "string" || credential.length > 4096) return null;
  const parts = credential.split(".");
  if (parts.length !== 3) return null;
  let header: any, claims: any;
  try { header = b64urlJson(parts[0]); claims = b64urlJson(parts[1]); } catch { return null; }
  if (header?.alg !== "RS256" || typeof header.kid !== "string") return null;
  const jwk = await keysFor(header.kid, fetchImpl, now);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const ok = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64urlBytes(parts[2]), new TextEncoder().encode(parts[0] + "." + parts[1]));
  if (!ok) return null;
  const t = Math.floor(now / 1000);
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.has(claims.iss) || !aud.includes(env.GOOGLE_CLIENT_ID)) return null;
  if (typeof claims.exp !== "number" || claims.exp + SKEW_S < t) return null;
  if (typeof claims.iat === "number" && claims.iat - SKEW_S > t) return null;
  if (typeof claims.sub !== "string" || !claims.sub) return null;
  // Only a verified address can find (or link to) an existing account.
  if (claims.email_verified !== true && claims.email_verified !== "true") return null;
  if (typeof claims.email !== "string") return null;
  return {
    sub: claims.sub, email: claims.email.trim().toLowerCase(),
    given_name: typeof claims.given_name === "string" ? claims.given_name : null,
    name: typeof claims.name === "string" ? claims.name : null,
  };
}
