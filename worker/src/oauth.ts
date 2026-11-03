/**
 * OAuth 2.1 authorization server for the MCP connector (MCP spec 2025-06-18):
 * protected-resource + server metadata, dynamic client registration, the
 * authorization-code flow with PKCE (S256 only), and refresh tokens.
 *
 * The consent step reuses the web app's sign-in: /oauth/authorize redirects to
 * the static /authorize.html, whose script reads the saved sign-in token from
 * localStorage and posts it to /oauth/approve with the request. No passwords,
 * no second session system.
 *
 * Codes and tokens are random 32-byte values; only their SHA-256 is stored.
 */
import type { Env } from "./index";
import { sha256, userFromBearer } from "./v1";

const OWNER = "__owner__";
const ACCESS_TTL = 3600, REFRESH_TTL = 90 * 86400, CODE_TTL = 300;
const cors = { "access-control-allow-origin": "*", "access-control-allow-headers": "authorization, content-type, mcp-protocol-version", "access-control-allow-methods": "GET, POST, OPTIONS" };
const json = (body: unknown, status = 200, extra: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors, ...extra } });
const oauthError = (error: string, description: string, status = 400) => json({ error, error_description: description }, status);
const rand = () => [...crypto.getRandomValues(new Uint8Array(32))].map((b) => b.toString(16).padStart(2, "0")).join("");
const inSecs = (s: number) => new Date(Date.now() + s * 1000).toISOString();

async function s256(verifier: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier)));
  return btoa(String.fromCharCode(...d)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Redirect targets: https anywhere, or http only back to this machine (desktop clients). */
function okRedirect(u: string): boolean {
  try {
    const x = new URL(u);
    if (x.hash) return false;
    return x.protocol === "https:" || (x.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(x.hostname));
  } catch { return false; }
}

async function getClient(env: Env, id: string) {
  const row = await env.DB.prepare("SELECT id, name, redirect_uris, secret_hash FROM oauth_client WHERE id = ?").bind(id).first<any>();
  return row ? { ...row, redirect_uris: JSON.parse(row.redirect_uris) as string[] } : null;
}

async function issue(env: Env, clientId: string, userKey: string) {
  const access = rand(), refresh = rand();
  await env.DB.batch([
    env.DB.prepare("INSERT INTO oauth_token (token_hash, kind, client_id, user_key, expires_at) VALUES (?, 'access', ?, ?, ?)").bind(await sha256(access), clientId, userKey, inSecs(ACCESS_TTL)),
    env.DB.prepare("INSERT INTO oauth_token (token_hash, kind, client_id, user_key, expires_at) VALUES (?, 'refresh', ?, ?, ?)").bind(await sha256(refresh), clientId, userKey, inSecs(REFRESH_TTL)),
  ]);
  return json({ access_token: access, token_type: "Bearer", expires_in: ACCESS_TTL, refresh_token: refresh, scope: "skwirl" });
}

/** The MCP endpoint's caller: a user id, null for the owner, undefined for nobody. */
export async function userFromOAuth(request: Request, env: Env): Promise<string | null | undefined> {
  const h = request.headers.get("Authorization") ?? "";
  if (!h.startsWith("Bearer ")) return undefined;
  const row = await env.DB.prepare("SELECT user_key FROM oauth_token WHERE token_hash = ? AND kind = 'access' AND expires_at > ?")
    .bind(await sha256(h.slice(7)), new Date().toISOString()).first<{ user_key: string }>();
  if (!row) return undefined;
  return row.user_key === OWNER ? null : row.user_key;
}

/** Revoke every connector a user has granted (account reset or deletion). */
export const revokeOAuth = (env: Env, userId: string | null) =>
  env.DB.prepare("DELETE FROM oauth_token WHERE user_key = ?").bind(userId ?? OWNER).run();

export const challengeHeader = (origin: string) =>
  ({ "www-authenticate": `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource"`, ...cors });

/** Returns a Response for OAuth routes, or null when the path isn't one. */
export async function handleOAuth(request: Request, env: Env, path: string, url: URL): Promise<Response | null> {
  const origin = url.origin;
  if (request.method === "OPTIONS" && (path.startsWith("/.well-known/oauth") || path.startsWith("/oauth/") || path === "/mcp")) {
    return new Response(null, { status: 204, headers: cors });
  }

  if (path.startsWith("/.well-known/oauth-protected-resource")) {
    return json({ resource: `${origin}/mcp`, authorization_servers: [origin], bearer_methods_supported: ["header"], resource_name: "Skwirl" });
  }
  if (path.startsWith("/.well-known/oauth-authorization-server") || path.startsWith("/.well-known/openid-configuration")) {
    return json({
      issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`,
      token_endpoint: `${origin}/oauth/token`,
      registration_endpoint: `${origin}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
      scopes_supported: ["skwirl"],
    });
  }

  if (path === "/oauth/register" && request.method === "POST") {
    const b = (await request.json().catch(() => null)) as any;
    const uris: unknown = b?.redirect_uris;
    if (!Array.isArray(uris) || !uris.length || uris.length > 5 || !uris.every((u) => typeof u === "string" && u.length < 500 && okRedirect(u))) {
      return oauthError("invalid_redirect_uri", "redirect_uris must be 1-5 https (or localhost) URLs.");
    }
    // ponytail: open registration, no per-IP cap; rows are tiny. Add a cap or a cleanup if it gets abused.
    const id = "c_" + rand().slice(0, 24);
    const confidential = b?.token_endpoint_auth_method && b.token_endpoint_auth_method !== "none";
    const secret = confidential ? rand() : null;
    const name = String(b?.client_name ?? "An AI app").slice(0, 60);
    await env.DB.prepare("INSERT INTO oauth_client (id, name, redirect_uris, secret_hash, created_at) VALUES (?, ?, ?, ?, ?)")
      .bind(id, name, JSON.stringify(uris), secret ? await sha256(secret) : null, new Date().toISOString()).run();
    return json({
      client_id: id, client_name: name, redirect_uris: uris, client_id_issued_at: Math.floor(Date.now() / 1000),
      grant_types: ["authorization_code", "refresh_token"], response_types: ["code"],
      token_endpoint_auth_method: confidential ? b.token_endpoint_auth_method : "none",
      ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
    }, 201);
  }

  // Validate before showing a consent page, so a bad redirect never gets a code or a pretty page.
  if (path === "/oauth/authorize" && request.method === "GET") {
    const p = url.searchParams;
    const client = await getClient(env, p.get("client_id") ?? "");
    const redirect = p.get("redirect_uri") ?? "";
    if (!client || !client.redirect_uris.includes(redirect)) {
      return new Response("This connection link isn't valid. Start again from your AI app.", { status: 400, headers: { "content-type": "text/plain; charset=utf-8" } });
    }
    if (p.get("response_type") !== "code" || p.get("code_challenge_method") !== "S256" || !p.get("code_challenge")) {
      const back = new URL(redirect);
      back.searchParams.set("error", "invalid_request");
      back.searchParams.set("error_description", "Skwirl needs response_type=code with an S256 code_challenge.");
      if (p.get("state")) back.searchParams.set("state", p.get("state")!);
      return Response.redirect(back.toString(), 302);
    }
    return Response.redirect(`${origin}/authorize.html?${p.toString()}`, 302);
  }

  if (path === "/oauth/client" && request.method === "GET") {
    const client = await getClient(env, url.searchParams.get("client_id") ?? "");
    if (!client) return json({ error: "unknown client" }, 404);
    return json({ name: client.name });
  }

  if (path === "/oauth/approve" && request.method === "POST") {
    const userId = await userFromBearer(request, env);
    if (userId === undefined) return json({ error: "Sign in to Skwirl first." }, 401);
    const b = (await request.json().catch(() => null)) as any;
    const client = await getClient(env, String(b?.client_id ?? ""));
    const redirect = String(b?.redirect_uri ?? "");
    if (!client || !client.redirect_uris.includes(redirect)) return json({ error: "This connection link isn't valid. Start again from your AI app." }, 400);
    const back = new URL(redirect);
    if (b?.state) back.searchParams.set("state", String(b.state));
    if (!b?.allow) {
      back.searchParams.set("error", "access_denied");
      return json({ redirect: back.toString() });
    }
    const challenge = String(b?.code_challenge ?? "");
    if (!/^[A-Za-z0-9_-]{43,128}$/.test(challenge)) return json({ error: "Missing code challenge. Start again from your AI app." }, 400);
    const code = rand();
    await env.DB.prepare("INSERT INTO oauth_code (code_hash, client_id, user_key, redirect_uri, challenge, expires_at) VALUES (?, ?, ?, ?, ?, ?)")
      .bind(await sha256(code), client.id, userId ?? OWNER, redirect, challenge, inSecs(CODE_TTL)).run();
    back.searchParams.set("code", code);
    back.searchParams.set("iss", origin);
    return json({ redirect: back.toString() });
  }

  if (path === "/oauth/token" && request.method === "POST") {
    const type = request.headers.get("content-type") ?? "";
    const f = type.includes("json")
      ? new URLSearchParams((await request.json().catch(() => ({}))) as Record<string, string>)
      : new URLSearchParams(await request.text());
    let clientId = f.get("client_id") ?? "", secret = f.get("client_secret") ?? "";
    const basic = request.headers.get("Authorization") ?? "";
    if (basic.startsWith("Basic ")) {
      try { [clientId, secret] = atob(basic.slice(6)).split(":").map(decodeURIComponent); } catch {}
    }
    const client = await getClient(env, clientId);
    if (!client) return oauthError("invalid_client", "Unknown client.", 401);
    if (client.secret_hash && (await sha256(secret)) !== client.secret_hash) return oauthError("invalid_client", "Bad client secret.", 401);

    if (f.get("grant_type") === "authorization_code") {
      const hash = await sha256(f.get("code") ?? "");
      const row = await env.DB.prepare("SELECT * FROM oauth_code WHERE code_hash = ?").bind(hash).first<any>();
      await env.DB.prepare("DELETE FROM oauth_code WHERE code_hash = ?").bind(hash).run(); // single use, even on failure
      if (!row || row.client_id !== client.id || row.expires_at < new Date().toISOString()) return oauthError("invalid_grant", "Code is invalid or expired.");
      if (f.get("redirect_uri") && f.get("redirect_uri") !== row.redirect_uri) return oauthError("invalid_grant", "redirect_uri doesn't match.");
      if ((await s256(f.get("code_verifier") ?? "")) !== row.challenge) return oauthError("invalid_grant", "PKCE check failed.");
      return issue(env, client.id, row.user_key);
    }
    if (f.get("grant_type") === "refresh_token") {
      const hash = await sha256(f.get("refresh_token") ?? "");
      const row = await env.DB.prepare("SELECT * FROM oauth_token WHERE token_hash = ? AND kind = 'refresh'").bind(hash).first<any>();
      if (!row || row.client_id !== client.id || row.expires_at < new Date().toISOString()) return oauthError("invalid_grant", "Refresh token is invalid or expired.");
      await env.DB.prepare("DELETE FROM oauth_token WHERE token_hash = ?").bind(hash).run(); // rotate
      return issue(env, client.id, row.user_key);
    }
    return oauthError("unsupported_grant_type", "Use authorization_code or refresh_token.");
  }
  return null;
}

/** Cron: drop expired codes and tokens. */
export const pruneOAuth = (env: Env) => {
  const now = new Date().toISOString();
  return env.DB.batch([
    env.DB.prepare("DELETE FROM oauth_code WHERE expires_at < ?").bind(now),
    env.DB.prepare("DELETE FROM oauth_token WHERE expires_at < ?").bind(now),
  ]);
};
