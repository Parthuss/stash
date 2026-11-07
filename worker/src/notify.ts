/**
 * Pings for the owner (new user, someone wants Plus, a Contact us message, the site is down),
 * by email to the owner's own inbox. Uses an Email Routing send binding locked to one verified
 * address, which is free on every plan. Without the OWNER_MAIL binding this does nothing.
 * Setup: docs/OWNER_TODO.md ("Owner alerts by email").
 */
// @ts-ignore: provided by the Workers runtime
import { EmailMessage } from "cloudflare:email";
import type { Env } from "./index";

const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

export async function notifyOwner(env: Env, subject: string, body: string): Promise<void> {
  if (!env.OWNER_MAIL || !env.OWNER_MAIL_TO || !env.OWNER_MAIL_FROM) return;
  const raw = [
    `From: Skwirl <${env.OWNER_MAIL_FROM}>`, `To: <${env.OWNER_MAIL_TO}>`,
    `Subject: =?UTF-8?B?${b64("Skwirl: " + subject)}?=`,
    `Message-ID: <${crypto.randomUUID()}@${env.OWNER_MAIL_FROM.split("@")[1]}>`, `Date: ${new Date().toUTCString()}`,
    "MIME-Version: 1.0", "Content-Type: text/plain; charset=utf-8", "Content-Transfer-Encoding: base64", "",
    (b64(body).match(/.{1,76}/g) ?? []).join("\r\n"),
  ].join("\r\n");
  await env.OWNER_MAIL.send(new EmailMessage(env.OWNER_MAIL_FROM, env.OWNER_MAIL_TO, raw)).catch((e: unknown) => console.log("owner mail failed", String(e)));
}
