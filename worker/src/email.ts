/**
 * Skwirl's email template: one branded layout for sign-in codes (transactional) and product updates
 * (marketing, opt-in only; src/broadcast.ts). Built for the clients people actually use: Gmail web +
 * iOS, Apple Mail, Outlook (Windows Word engine included).
 *
 * - Tables + inline CSS only; one <style> block adds dark mode and phone tweaks where it's honoured.
 * - Nothing needs images: the logo is decoration with alt text, the button is real text.
 * - Bulletproof button: VML roundrect for Outlook on Windows, a padded <a> everywhere else.
 * - Dark mode: Apple Mail / iOS Mail use the prefers-color-scheme block; Gmail and Outlook.com invert
 *   on their own, which this layout survives (the logo carries its own lavender tile, no
 *   transparent dark ink, the button is solid ink with white text).
 * - Every email has a plain-text twin.
 */

export const SITE = "https://skwirl.app";
export const LOGO_URL = SITE + "/email-logo.png";   // the app icon (lavender tile), a stable copy for old emails

// Brand (worker/public/index.html :root), with web-safe fallbacks: the brand fonts load in Apple Mail.
const C = { bg: "#f8f7ff", surface: "#ffffff", ink: "#1d1b2e", muted: "#6a6880", line: "#ebe8f7", lavender: "#dcd8ff", coral: "#ff7a59" };
const UI = "'Rethink Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
const DISPLAY = "'Recursive',ui-rounded,-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";

export const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Only http(s) links make it into an email (no javascript:, data:, mailto tricks). */
export function safeUrl(raw: string): string | null {
  try { const u = new URL(raw.trim()); return u.protocol === "https:" || u.protocol === "http:" ? u.href : null; } catch { return null; }
}

// ---- markdown-lite -------------------------------------------------------------------------------
// Paragraphs (blank line), line breaks, "- " bullets, **bold**, *italic*, [text](https://link).
// Everything else is text. Escaped first, so nothing typed can become markup.
const linkStyle = `color:${C.ink};text-decoration:underline;font-weight:600`;
function inlineHtml(s: string): string {
  return esc(s)
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, (_m, t, u) => {
      const href = safeUrl(u.replace(/&amp;/g, "&"));
      return href ? `<a href="${esc(href)}" style="${linkStyle}">${t}</a>` : t;
    })
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1<em>$2</em>");
}
function inlineText(s: string): string {
  return s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, "$1 ($2)").replace(/\*\*([^*]+)\*\*/g, "$1").replace(/(^|[^*])\*([^*\s][^*]*)\*/g, "$1$2");
}
type Block = { kind: "p"; lines: string[] } | { kind: "ul"; items: string[] };
function blocks(md: string): Block[] {
  const out: Block[] = [];
  for (const chunk of md.replace(/\r\n?/g, "\n").trim().split(/\n\s*\n/)) {
    const lines = chunk.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) continue;
    if (lines.every((l) => /^[-*•]\s+/.test(l))) out.push({ kind: "ul", items: lines.map((l) => l.replace(/^[-*•]\s+/, "")) });
    else out.push({ kind: "p", lines });
  }
  return out;
}
const P = `margin:0 0 16px;font-family:${UI};font-size:16px;line-height:1.6;color:${C.ink}`;
export function mdToHtml(md: string): string {
  return blocks(md).map((b) => b.kind === "p"
    ? `<p class="sk-ink" style="${P}">${b.lines.map(inlineHtml).join("<br>")}</p>`
    : `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 16px">${b.items.map((i) =>
        `<tr><td valign="top" class="sk-ink" style="padding:0 10px 8px 2px;font-family:${UI};font-size:16px;line-height:1.6;color:${C.coral}">&#8226;</td>` +
        `<td class="sk-ink" style="padding:0 0 8px;font-family:${UI};font-size:16px;line-height:1.6;color:${C.ink}">${inlineHtml(i)}</td></tr>`).join("")}</table>`).join("\n");
}
export function mdToText(md: string): string {
  return blocks(md).map((b) => b.kind === "p" ? b.lines.map(inlineText).join("\n") : b.items.map((i) => "- " + inlineText(i)).join("\n")).join("\n\n");
}

// ---- the layout ----------------------------------------------------------------------------------
export type Button = { text: string; url: string };
export type Layout = {
  subject: string;
  preheader?: string;       // inbox preview line
  hero: string;             // big headline
  bodyHtml: string;         // already-safe HTML (mdToHtml or hand-built)
  bodyText: string;
  button?: Button | null;
  /** A block shown big and selectable under the hero (the sign-in code). */
  code?: string;
  /** Marketing only: why you got it, the unsubscribe link, and the sender's contact line. */
  marketing?: { unsubscribeUrl: string; postal: string };
  /** Small print under the body for transactional mail ("Didn't ask for this? ..."). */
  note?: string;
};

function buttonHtml(b: Button): string {
  const href = esc(b.url), text = esc(b.text);
  const w = Math.min(440, Math.max(180, b.text.length * 10 + 64));
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 24px"><tr><td>
<!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${href}" style="height:50px;v-text-anchor:middle;width:${w}px" arcsize="50%" stroke="f" fillcolor="${C.ink}"><w:anchorlock/><center style="color:#ffffff;font-family:Segoe UI,Arial,sans-serif;font-size:16px;font-weight:bold">${text}</center></v:roundrect><![endif]-->
<!--[if !mso]><!-- --><a href="${href}" class="sk-btn" style="display:inline-block;background:${C.ink};color:#ffffff;font-family:${UI};font-size:16px;font-weight:600;line-height:50px;height:50px;padding:0 28px;border-radius:999px;text-decoration:none;mso-hide:all">${text}</a><!--<![endif]-->
</td></tr></table>`;
}

/** Light/dark CSS for clients that honour <style>. `forceDark` renders the dark variant everywhere
 *  (owner preview and screenshots only). */
function styleBlock(forceDark: boolean): string {
  const dark = `.sk-bg{background:#14131f !important}.sk-card{background:#1f1d2e !important;border-color:#2e2b42 !important}
.sk-ink,.sk-ink p,.sk-ink td{color:#f1effa !important}.sk-muted,.sk-muted a{color:#aaa6c2 !important}
.sk-code{background:#2a2740 !important;color:#ffffff !important;border-color:#3a3656 !important}
.sk-btn{background:#ffffff !important;color:#1d1b2e !important}.sk-ink a{color:#ffffff !important}.sk-rule{border-color:#2e2b42 !important}`;
  return `<style>
@font-face{font-family:'Rethink Sans';font-style:normal;font-weight:400 600;src:url(${SITE}/fonts/rethink-sans.woff2) format('woff2')}
@font-face{font-family:'Recursive';font-style:normal;font-weight:800;src:url(${SITE}/fonts/recursive-800-casual.woff2) format('woff2')}
:root{color-scheme:light dark;supported-color-schemes:light dark}
body{margin:0;padding:0;-webkit-text-size-adjust:100%}
a[x-apple-data-detectors]{color:inherit !important;text-decoration:none !important}
@media (max-width:620px){.sk-pad{padding-left:20px !important;padding-right:20px !important}.sk-hero{font-size:26px !important}.sk-outer{padding:12px 8px !important}}
${forceDark ? dark : `@media (prefers-color-scheme:dark){${dark}}`}
[data-ogsc] .sk-ink,[data-ogsc] .sk-ink p{color:#f1effa !important}[data-ogsb] .sk-card{background:#1f1d2e !important}
</style>`;
}

export function renderEmail(l: Layout, opts: { forceDark?: boolean } = {}): { html: string; text: string } {
  const pre = esc((l.preheader ?? "").slice(0, 140));
  const code = l.code ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:4px 0 22px"><tr><td class="sk-code" style="background:${C.bg};border:1px solid ${C.line};border-radius:14px;padding:14px 22px;font-family:ui-monospace,'SF Mono',Menlo,Consolas,'Courier New',monospace;font-size:34px;font-weight:700;letter-spacing:8px;color:${C.ink};-webkit-user-select:all;user-select:all">${esc(l.code)}</td></tr></table>` : "";
  const note = l.note ? `<p class="sk-muted" style="margin:0 0 4px;font-family:${UI};font-size:14px;line-height:1.5;color:${C.muted}">${esc(l.note)}</p>` : "";
  const muted = `font-family:${UI};font-size:13px;line-height:1.6;color:${C.muted}`;
  const footer = l.marketing
    ? `<p class="sk-muted" style="margin:0 0 8px;${muted}">You're getting this because you ticked <strong>Product updates</strong> in Skwirl. A couple of emails a month at most.</p>
<p class="sk-muted" style="margin:0 0 8px;${muted}"><a href="${esc(l.marketing.unsubscribeUrl)}" style="color:${C.muted};text-decoration:underline">Unsubscribe in one click</a> · <a href="${SITE}" style="color:${C.muted};text-decoration:underline">skwirl.app</a> · <a href="${SITE}/privacy" style="color:${C.muted};text-decoration:underline">Privacy</a></p>
<p class="sk-muted" style="margin:0;${muted}">${esc(l.marketing.postal)}</p>`
    : `<p class="sk-muted" style="margin:0;${muted}">Skwirl · <a href="${SITE}" style="color:${C.muted};text-decoration:underline">skwirl.app</a></p>`;

  const html = `<!doctype html>
<html lang="en" xmlns="http://www.w3.org/1999/xhtml" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="X-UA-Compatible" content="IE=edge">
<meta name="color-scheme" content="light dark"><meta name="supported-color-schemes" content="light dark"><meta name="format-detection" content="telephone=no,date=no,address=no,email=no">
<title>${esc(l.subject)}</title>
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
${styleBlock(Boolean(opts.forceDark))}
</head>
<body class="sk-bg" style="margin:0;padding:0;background:${C.bg};word-spacing:normal">
<div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${C.bg}">${pre}${"&#8199;&#65279;&#847; ".repeat(pre ? 40 : 0)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" class="sk-bg" style="background:${C.bg}"><tr><td align="center" class="sk-outer" style="padding:28px 12px">
<!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;margin:0 auto">
<tr><td style="padding:0 8px 18px"><a href="${SITE}" style="text-decoration:none"><img src="${LOGO_URL}" width="40" height="40" alt="Skwirl" style="display:inline-block;vertical-align:middle;border:0;border-radius:10px;width:40px;height:40px;font-family:${UI};font-size:15px;font-weight:700;color:${C.ink}"></a><span class="sk-ink" style="display:inline-block;vertical-align:middle;padding-left:10px;font-family:${DISPLAY};font-size:24px;font-weight:800;color:${C.ink};letter-spacing:-0.3px">Skwirl</span></td></tr>
<tr><td class="sk-card sk-pad" style="background:${C.surface};border:1px solid ${C.line};border-radius:24px;padding:34px 36px 26px">
<h1 class="sk-ink sk-hero" style="margin:0 0 18px;font-family:${DISPLAY};font-size:30px;line-height:1.2;font-weight:800;letter-spacing:-0.4px;color:${C.ink}">${esc(l.hero)}</h1>
${code}<div class="sk-ink">${l.bodyHtml}</div>
${l.button ? buttonHtml(l.button) : ""}${note}
</td></tr>
<tr><td class="sk-pad" style="padding:20px 28px 8px">${footer}</td></tr>
</table>
<!--[if mso]></td></tr></table><![endif]-->
</td></tr></table>
</body></html>`;

  const text = [
    l.hero, "",
    ...(l.code ? [l.code, ""] : []),
    l.bodyText.trim(), "",
    ...(l.button ? [`${l.button.text}: ${l.button.url}`, ""] : []),
    ...(l.note ? [l.note, ""] : []),
    "--",
    ...(l.marketing
      ? ["You're getting this because you ticked Product updates in Skwirl. A couple of emails a month at most.",
         `Unsubscribe in one click: ${l.marketing.unsubscribeUrl}`, `Skwirl · ${SITE}`, l.marketing.postal]
      : [`Skwirl · ${SITE}`]),
  ].join("\n");
  return { html, text };
}

// ---- the sign-in code (transactional: no unsubscribe, no marketing) --------------------------------
export function codeLayout(code: string, hi: string, why: string): Layout {
  return {
    subject: `${code} is your Skwirl code`,
    preheader: `Your code ${why}. It works once, for 10 minutes.`,
    hero: "Your Skwirl code",
    code,
    bodyHtml: `<p class="sk-ink" style="${P}">${esc(hi)} here's your code ${esc(why)}. It works once, for 10 minutes.</p>`,
    bodyText: `${hi} here's your code ${why}. It works once, for 10 minutes.`,
    note: "Didn't ask for this? Ignore this email, nothing changes.",
  };
}
