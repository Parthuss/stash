/**
 * Skwirl Plus, billed through Dodo Payments (merchant of record).
 *   POST /v1/plus/checkout {interval: "month"|"year"}   a hosted checkout link
 *   GET  /v1/plus/portal                                Dodo's manage-subscription link
 *   POST /webhooks/dodo                                 the only thing that ever grants or removes Plus
 *
 * Test mode unless DODO_API_BASE says otherwise, so a missing variable can never charge a real card.
 * PLUS_ACCESS decides who can buy: comma-separated user ids while testing, "*" for everyone.
 */
import type { Env } from "./index";
import { notifyOwner } from "./notify";

const SITE = "https://skwirl.app";
const TOLERANCE_S = 300;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });

export const isPlus = (u: { plan?: string | null; plan_until?: string | null } | null | undefined) =>
  u?.plan === "plus" && !!u.plan_until && u.plan_until > new Date().toISOString();

export const plusAvailable = (env: Env, userId: string | null) =>
  !!userId && (env.PLUS_ACCESS === "*" || (env.PLUS_ACCESS ?? "").split(",").map((s) => s.trim()).includes(userId));

async function dodo(env: Env, method: string, path: string, body?: unknown): Promise<any> {
  const r = await fetch((env.DODO_API_BASE ?? "https://test.dodopayments.com") + path, {
    method,
    headers: { Authorization: `Bearer ${env.DODO_API_KEY}`, "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!r.ok) throw new Error(`dodo ${method} ${path.split("?")[0]}: ${r.status}`);
  return r.json();
}

export const cancelSubscription = (env: Env, id: string) =>
  dodo(env, "PATCH", `/subscriptions/${encodeURIComponent(id)}`, { status: "cancelled" });

export async function plusRoute(request: Request, env: Env, path: string, userId: string | null): Promise<Response | null> {
  if (path === "/v1/plus/checkout" && request.method === "POST") {
    if (!plusAvailable(env, userId)) return json({ error: "Skwirl Plus isn't open yet." }, 403);
    const body = (await request.json().catch(() => null)) as { interval?: unknown } | null;
    const product = body?.interval === "month" ? env.DODO_PRODUCT_MONTHLY : body?.interval === "year" ? env.DODO_PRODUCT_YEARLY : undefined;
    if (body?.interval !== "month" && body?.interval !== "year") return json({ error: "Choose monthly or yearly." }, 400);
    if (!product || !env.DODO_API_KEY) return json({ error: "Checkout isn't set up yet." }, 503);
    const u = await env.DB.prepare("SELECT name, email, plan, plan_until FROM user WHERE id = ?").bind(userId).first<any>();
    if (isPlus(u)) return json({ error: "You already have Skwirl Plus." }, 409);
    const session = await dodo(env, "POST", "/checkouts", {
      product_cart: [{ product_id: product, quantity: 1 }],
      ...(u?.email ? { customer: { email: u.email, name: u.name ?? undefined } } : {}),
      metadata: { user_id: userId },
      return_url: `${SITE}/?plus=done`,
    }).catch((e) => { console.error(String(e)); return null; });
    if (!session?.checkout_url) return json({ error: "Couldn't open checkout. Try again in a minute." }, 502);
    return json({ checkout_url: session.checkout_url });
  }

  if (path === "/v1/plus/portal" && request.method === "GET") {
    if (!userId) return json({ error: "No subscription on this account." }, 404);
    const u = await env.DB.prepare("SELECT dodo_customer_id FROM user WHERE id = ?").bind(userId).first<{ dodo_customer_id: string | null }>();
    if (!u?.dodo_customer_id) return json({ error: "No subscription on this account." }, 404);
    const portal = await dodo(env, "POST", `/customers/${encodeURIComponent(u.dodo_customer_id)}/customer-portal/session?return_url=${encodeURIComponent(SITE)}`)
      .catch((e) => { console.error(String(e)); return null; });
    if (!portal?.link) return json({ error: "Couldn't open that. Try again in a minute." }, 502);
    return json({ link: portal.link });
  }
  return null;
}

const bytes = (b64: string) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));

/** Standard Webhooks: HMAC-SHA256 of `id.timestamp.rawBody`, keyed by the base64 part of whsec_... */
export async function verifySignature(secret: string, id: string, ts: string, raw: string, header: string, nowMs = Date.now()): Promise<boolean> {
  if (!/^\d+$/.test(ts) || Math.abs(nowMs / 1000 - Number(ts)) > TOLERANCE_S) return false;
  try {
    const key = await crypto.subtle.importKey("raw", bytes(secret.replace(/^whsec_/, "")), { name: "HMAC", hash: "SHA-256" }, false, ["verify"]);
    const signed = new TextEncoder().encode(`${id}.${ts}.${raw}`);
    for (const part of header.split(" ")) {
      const [version, sig] = part.split(",");
      if (version === "v1" && sig && await crypto.subtle.verify("HMAC", key, bytes(sig), signed)) return true;
    }
  } catch { /* malformed secret or signature: not verified */ }
  return false;
}

/** The writes for one event. Dodo delivers the latest state and doesn't guarantee order, so a grant
 *  keys off data.status, not the event name. Cancelled and on-hold write nothing: plan_until already
 *  holds the end of the paid period, so access runs out there unless a renewal extends it. */
function writes(env: Env, type: string, d: any): D1PreparedStatement[] | null {
  const sub = String(d?.subscription_id ?? "");
  if (["subscription.active", "subscription.renewed", "subscription.updated"].includes(type)) {
    if (d?.status !== "active" || !sub || Number.isNaN(Date.parse(d.next_billing_date))) return [];
    return [env.DB.prepare("UPDATE user SET plan='plus', plan_until=?, dodo_customer_id=?, dodo_subscription_id=? WHERE id=? OR dodo_subscription_id=?")
      .bind(new Date(d.next_billing_date).toISOString(), d.customer?.customer_id ?? null, sub, String(d.metadata?.user_id ?? ""), sub)];
  }
  if (type === "subscription.expired" || type === "subscription.failed") {
    return sub ? [env.DB.prepare("UPDATE user SET plan='free', plan_until=NULL WHERE dodo_subscription_id=?").bind(sub)] : [];
  }
  if (type === "refund.succeeded" && !d?.is_partial && d?.customer?.customer_id) {
    return [env.DB.prepare("UPDATE user SET plan='free', plan_until=NULL WHERE dodo_customer_id=?").bind(d.customer.customer_id)];
  }
  return null;
}

export async function dodoWebhook(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
  if (!env.DODO_WEBHOOK_SECRET) return json({ error: "not configured" }, 503);
  const raw = await request.text();
  const id = request.headers.get("webhook-id") ?? "", ts = request.headers.get("webhook-timestamp") ?? "", sig = request.headers.get("webhook-signature") ?? "";
  if (!id || !sig || !(await verifySignature(env.DODO_WEBHOOK_SECRET, id, ts, raw, sig))) return json({ error: "bad signature" }, 401);
  let event: any;
  try { event = JSON.parse(raw); } catch { return json({ error: "bad body" }, 400); }

  const stmts = writes(env, String(event.type), event.data);
  if (stmts === null) return json({ received: true });  // an event we don't act on
  // A refund must also stop the renewals, or the next charge would bring Plus straight back.
  const refunded = event.type === "refund.succeeded" && stmts.length
    ? await env.DB.prepare("SELECT dodo_subscription_id s FROM user WHERE dodo_customer_id = ?").bind(event.data.customer.customer_id).first<{ s: string | null }>()
    : null;
  try {
    // One transaction: a repeat trips the primary key and rolls everything back; a failure leaves
    // no claim behind, so Dodo's retry can still apply it.
    await env.DB.batch([env.DB.prepare("INSERT INTO webhook_seen (id, at) VALUES (?, ?)").bind(id, new Date().toISOString()), ...stmts]);
  } catch (e) {
    if (/UNIQUE|constraint/i.test(String(e))) return json({ received: true, duplicate: true });
    console.error("dodo webhook", String(e));
    return json({ error: "try again" }, 500);
  }
  if (refunded?.s) {
    const sub = refunded.s;
    ctx.waitUntil(cancelSubscription(env, sub).catch((e) => notifyOwner(env, "Refund: cancel failed", `Refunded, but couldn't cancel subscription ${sub} (${e}). Cancel it in Dodo.`)));
  }
  return json({ received: true });
}
