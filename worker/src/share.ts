/**
 * Public, read-only page for a note someone chose to share: GET /n/<share_id>.
 * Only the parts that are about the post go out (summary, next step, recipe,
 * mentions). "Why you saved this", the user's own note, the caption and the
 * transcript stay private. Every byte of note text is escaped before it lands
 * in the HTML.
 */
import type { Env } from "./index";

const PUBLIC_SECTIONS = new Set(["Next step", "Ingredients", "Steps", "Mentioned"]);

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
const inline = (s: string) => esc(s).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");

/** Keep the intro and the public sections; drop the H1 (rendered separately). */
export function publicMarkdown(markdown: string): string {
  const body = markdown.replace(/^---\n[\s\S]*?\n---\n/, "");
  const out: string[] = [];
  let keep = true;
  for (const line of body.split("\n")) {
    const h = line.match(/^## (.+)$/);
    if (h) keep = PUBLIC_SECTIONS.has(h[1].trim());
    if (keep && !/^# /.test(line) && !/^<sub>/.test(line)) out.push(line);
  }
  return out.join("\n").trim();
}

/** Just enough markdown for a note: headings, bullets, numbered steps, bold, paragraphs. */
export function renderMarkdown(md: string): string {
  const html: string[] = [];
  let list: "ul" | "ol" | null = null;
  const close = () => { if (list) { html.push(`</${list}>`); list = null; } };
  for (const raw of md.split("\n")) {
    const line = raw.trim();
    let m: RegExpMatchArray | null;
    if (!line) { close(); continue; }
    if ((m = line.match(/^## (.+)$/))) { close(); html.push(`<h2>${inline(m[1])}</h2>`); continue; }
    if ((m = line.match(/^[-*] (.+)$/)) || (m = line.match(/^\d+[.)] (.+)$/))) {
      const kind = /^\d/.test(line) ? "ol" : "ul";
      if (list !== kind) { close(); html.push(`<${kind}>`); list = kind; }
      html.push(`<li>${inline(m[1])}</li>`);
      continue;
    }
    close();
    html.push(`<p>${inline(line.replace(/^> ?/, ""))}</p>`);
  }
  close();
  return html.join("\n");
}

export async function sharePage(env: Env, shareId: string, origin: string): Promise<Response> {
  const note = await env.DB.prepare(
    "SELECT title, summary, topic, permalink, markdown, thumb_id FROM note WHERE share_id = ?",
  ).bind(shareId).first<{ title: string; summary: string | null; topic: string | null; permalink: string | null; markdown: string; thumb_id: string | null }>();
  if (!note) {
    return new Response(page("Not found", `<h1>This link doesn't work anymore</h1><p>Whoever shared it may have stopped sharing it.</p><p><a class="btn" href="/">What's Stash?</a></p>`, ""), {
      status: 404, headers: headers(),
    });
  }
  const desc = (note.summary ?? "").slice(0, 200);
  const img = note.thumb_id ? `${origin}/t/${note.thumb_id}` : `${origin}/og.png`;
  const meta = `
<meta name="description" content="${esc(desc)}">
<meta property="og:type" content="article">
<meta property="og:title" content="${esc(note.title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:image" content="${esc(img)}">
<meta name="twitter:card" content="summary_large_image">`;
  const body = `
${note.thumb_id ? `<img class="cover" src="/t/${esc(note.thumb_id)}" alt="">` : ""}
<span class="tag">${esc(note.topic || "saved")}</span>
<h1>${esc(note.title)}</h1>
<div class="note">${renderMarkdown(publicMarkdown(note.markdown))}</div>
${note.permalink?.startsWith("https://") ? `<p><a class="btn soft" href="${esc(note.permalink)}" rel="noopener nofollow">Watch the original ↗</a></p>` : ""}
<aside class="cta">
  <b>Made with Stash</b>
  <p>Share a reel to Stash and it comes back as a note like this one: recipes as ingredients and steps, books and movies in a list, all searchable. Free.</p>
  <a class="btn" href="/?ref=share">Start your own stash</a>
</aside>`;
  return new Response(page(note.title, body, meta), { headers: headers() });
}

const headers = () => ({
  "content-type": "text/html; charset=utf-8",
  "cache-control": "public, max-age=300",
  "content-security-policy": "default-src 'none'; style-src 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  "x-content-type-options": "nosniff",
  "referrer-policy": "no-referrer",
  "x-robots-tag": "noindex",
});

const page = (title: string, body: string, meta: string) => `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)} · Stash</title>${meta}
<link rel="icon" href="/icon-192.png">
<link href="https://fonts.googleapis.com/css2?family=Familjen+Grotesk:wght@400;500;600&family=Gloock&display=swap" rel="stylesheet">
<style>
:root { --bg:#f8f7ff; --ink:#1d1b2e; --muted:#6a6880; --lavender:#dcd8ff; --peach:#ffd8cb; }
* { box-sizing: border-box; }
body { margin:0; background:var(--bg); color:var(--ink); font:17px/1.55 "Familjen Grotesk", system-ui, sans-serif; padding:24px 18px 60px; }
main { max-width:640px; margin:0 auto; }
.top { display:block; font-family:Gloock, Georgia, serif; font-size:26px; color:inherit; text-decoration:none; }
.cover { display:block; width:100%; max-height:320px; object-fit:cover; border-radius:28px; margin:18px 0 16px; }
.tag { display:inline-block; margin-top:18px; padding:3px 12px; border-radius:999px; background:var(--lavender); font-size:13px; font-weight:500; text-transform:capitalize; }
h1 { font-family:Gloock, Georgia, serif; font-weight:400; font-size:clamp(30px,7vw,44px); line-height:1.1; margin:12px 0 14px; }
h2 { font-family:Gloock, Georgia, serif; font-weight:400; font-size:23px; margin:26px 0 6px; }
.note { background:#fff; border-radius:28px; padding:6px 22px 18px; box-shadow:0 6px 18px rgb(60 50 120 / .07); }
ol, ul { padding-left:22px; } li { margin-bottom:6px; }
.btn { display:inline-flex; align-items:center; height:48px; padding:0 22px; border-radius:999px; background:var(--ink); color:#fff; font-weight:600; text-decoration:none; }
.btn.soft { background:#fff; color:var(--ink); box-shadow:0 6px 18px rgb(60 50 120 / .07); }
.cta { margin-top:34px; background:var(--peach); border-radius:28px; padding:22px; }
.cta b { font-family:Gloock, Georgia, serif; font-weight:400; font-size:24px; }
.cta p { margin:6px 0 16px; }
</style></head>
<body><main><a class="top" href="/">Stash</a>${body}</main></body></html>`;
