const $ = (id) => document.getElementById(id);
const tr = (name, detail) => { try { window.track && window.track(name, detail); } catch {} };
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
                del: (k) => { try { localStorage.removeItem(k); } catch {} } };
// A #t= sign-in link. If this device is already signed in with a different token, don't replace a
// working session with an unchecked one: linkToken is verified below and only then switched to.
let linkToken = null;
{ const m = location.hash.match(/^#t=([\w-]+)/); if (m) { history.replaceState(null, "", location.pathname + location.search);
  const cur = store.get("stash_token"); if (!cur || cur === m[1]) store.set("stash_token", m[1]); else linkToken = m[1]; } }
const joinCodeFromLink = (location.hash.match(/^#code=([\w-]+)/) || [])[1];
if (joinCodeFromLink) history.replaceState(null, "", location.pathname + location.search);
// A copy of the library on this device, so an outage shows your saves instead of an error.
// Tagged with the token's tail so a different account on this device never sees it.
const cacheGet = (k) => { try { const c = JSON.parse(store.get(k) || "null"); return c && c.tok === (token || "").slice(-8) ? c : null; } catch { return null; } };
const cacheSet = (k, v) => { try { localStorage.setItem(k, JSON.stringify({ ...v, tok: (token || "").slice(-8), at: Date.now() })); } catch {} };
const ago2 = (t) => { const m = Math.round((Date.now() - t) / 60000); return m < 1 ? "just now" : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`; };
let token = store.get("stash_token"), notes = [], filter = "all", current = null, timer;

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---- banners: one at a time, keyed so each condition can clear itself ----
let bannerKey = null;
function setBanner(key, kind, text, label, fn) {
  const b = $("banner"); bannerKey = key; b.className = "banner " + kind; b.hidden = false;
  b.innerHTML = `<span>${esc(text)}</span>` + (label ? `<button type="button">${esc(label)}</button>` : "");
  if (label) b.querySelector("button").onclick = fn;
}
function clearBanner(key) { if (!key || bannerKey === key) { $("banner").hidden = true; bannerKey = null; } }

async function api(path, opts = {}) {
  let r; const sentWith = token;
  try {
    r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + token, "content-type": "application/json" } });
  } catch {
    if ($("lib").style.display === "none") toast("Can't reach Skwirl. Check your connection and try again.");
    setBanner("net", "warn", "Can't reach Skwirl. You're offline, or it's having a moment. What you see may be out of date.", "Try again", () => load());
    throw new Error("offline");
  }
  // The account changed while this was in flight: drop it, so it can't show the old account's
  // notes or sign the new one out.
  if (token !== sentWith) throw new Error("stale");
  if (r.status === 401) { signOut("You were signed out (your token changed or was reset). Paste it again to get back in."); throw new Error("unauthorized"); }
  if (r.status >= 500) { if ($("lib").style.display === "none") toast("Skwirl hit a problem. Try again in a minute."); setBanner("net", "err", "Skwirl hit a problem on our end. Nothing is lost. Try again in a minute.", "Try again", () => load()); }
  else if (bannerKey === "net") clearBanner("net");
  return r;
}
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600); }
let activeView = null, viewVersion = 0, historyPosition = 0;
let navigationId = Math.random().toString(36).slice(2), viewScroll = {};
function viewState(which) { return { skwirlView: which, position: historyPosition, navigationId, noteId: which === "note" ? current?.id : null, from: which === "note" ? returnTo : null }; }
function show(which, record = true) {
  const changed = activeView !== which;
  if (changed) {
    if (activeView) viewScroll[activeView] = scrollY;
    if (which === "auth") { navigationId = Math.random().toString(36).slice(2); historyPosition = 0; viewScroll = {}; }
    if (record) {
      if (activeView && activeView !== "auth" && which !== "auth") { ++historyPosition; history.pushState(viewState(which), ""); }
      else { historyPosition = 0; history.replaceState(viewState(which), ""); }
    }
    activeView = which; ++viewVersion;
  }
  tr("view", which);
  for (const id of ["auth", "lib", "note", "setup", "admin", "mentions", "me"]) $(id).style.display = id === which ? "block" : "none";
  $("fab").style.display = which === "lib" ? "" : "none";
  if (changed) scrollTo(0, viewScroll[which] || 0);  // re-showing the current view must not jump the scroll
}
function backTo(which) {
  if (history.state?.navigationId === navigationId && history.state.position > 0) history.back();
  else { show(which, false); historyPosition = 0; history.replaceState(viewState(which), ""); }
}
window.addEventListener("popstate", (e) => {
  if (activeView === "auth") return;
  ++openVersion;
  const state = e.state;
  if (state?.navigationId !== navigationId || !["lib", "note", "setup", "admin", "mentions", "me"].includes(state.skwirlView)) {
    show("lib", false); historyPosition = 0; history.replaceState(viewState("lib"), ""); return;
  }
  historyPosition = state.position;
  if (state.skwirlView === "note" && state.noteId !== current?.id) open(state.noteId, state.from, false);
  else show(state.skwirlView, false);
});
function signOut(msg) {
  // A forced sign-out (expired or reset token) keeps saves still waiting to send, so they go
  // through once you're back in. Only signing out on purpose clears them (after a warning).
  const forced = typeof msg === "string";
  for (const k of ["stash_token", "stash_cache", "stash_notes", ...(forced ? [] : ["stash_outbox"])]) store.del(k);
  token = null; show("auth");
  const m = typeof msg === "string" ? msg : ""; $("authErr").textContent = m; if (m) $("signin").open = true;
}

// ---- markdown: escape FIRST, then add structure. Notes contain third-party captions. ----
function md(src) {
  src = src.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\s*# .*\n/, "");
  const out = []; let list = false, olist = false;
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  for (const line of src.split("\n")) {
    const li = line.match(/^\s*[-*] (.*)/), oli = line.match(/^\s*\d+\. (.*)/);
    if (list && !li) { out.push("</ul>"); list = false; }
    if (olist && !oli) { out.push("</ol>"); olist = false; }
    if (li) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + inline(li[1]) + "</li>"); }
    else if (oli) { if (!olist) { out.push("<ol>"); olist = true; } out.push("<li>" + inline(oli[1]) + "</li>"); }
    else if (/^## /.test(line)) out.push("<h2>" + inline(line.slice(3)) + "</h2>");
    else if (/^> ?/.test(line)) out.push("<blockquote>" + inline(line.replace(/^> ?/, "")) + "</blockquote>");
    else if (line.startsWith("<sub>") || !line.trim()) continue;
    else out.push("<p>" + inline(line) + "</p>");
  }
  if (list) out.push("</ul>");
  if (olist) out.push("</ol>");
  return out.join("");
}

const TINTS = { design: "--lavender", tooling: "--mint", business: "--sky", prompting: "--sky", other: "--butter", food: "--butter",
  travel: "--sky", fitness: "--mint", money: "--mint", learning: "--lavender", style: "--sky",
  automation: "--mint", "agent-building": "--lavender", rag: "--sky", research: "--butter", inspiration: "--peach", infrastructure: "--sky" };
const tintOf = (t) => `var(${TINTS[t] || "--lavender"})`;
function card(n, i) {
  const initial = esc((n.title || "?").trim().charAt(0).toUpperCase());
  // Only the positive state gets a tag: an "Unused" badge on every new card read as a scolding.
  return `<button class="card" data-id="${esc(n.id)}" style="--i:${Math.min(i, 12)}">
    <div class="tint" style="background:${tintOf(n.topic)}">${n.status === "used" ? '<span class="tag">Tried ✓</span>' : ""}<b aria-hidden="true">${initial}</b>${n.thumb_id ? `<img class="thumb" src="/t/${esc(n.thumb_id)}" alt="" loading="lazy">` : ""}</div>
    <div class="cbody"><h2>${esc(n.title)}</h2><small>${esc(n.topic || "")}</small></div></button>`;
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "link"; } };
function capCard(c) {
  if (c.state === "failed") {
    return `<div class="card wait"><div class="tint" style="background:#ffe9e5"><span class="tag err">Couldn't read</span><b aria-hidden="true">!</b></div>
      <div class="cbody"><h2>${esc(c.url ? hostOf(c.url) : "Saved link")}</h2><p class="why">${esc(c.reason)}</p>
      <div class="acts"><button data-retry="${esc(c.id)}">Retry</button><button class="soft" data-del="${esc(c.id)}">Remove</button></div></div></div>`;
  }
  return `<div class="card wait" aria-busy="true"><div class="tint shimmer"><span class="tag">Reading…</span></div>
    <div class="cbody"><h2>${esc(hostOf(c.url))}</h2><small>${esc(ago(c.at))}</small></div></div>`;
}
function skeleton() { return Array.from({ length: 4 }, () => '<div class="skel shimmer" aria-hidden="true"></div>').join(""); }

// Your own categories (names you chose; the AI files notes into them). Filters use "cat:<name>".
let myCats = [];
const cats = (n) => { try { return Array.isArray(n.categories) ? n.categories : JSON.parse(n.categories || "[]"); } catch { return []; } };
function render() {
  const unused = notes.filter((n) => n.status === "unused").length;
  // A built-in topic with the same name as one of their categories would be a confusing twin chip.
  const mine = new Set(myCats.map((c) => c.toLowerCase()));
  const topics = [...new Set([...notes.map((n) => n.topic).filter(Boolean), ...(!["all", "unused"].includes(filter) && !filter.startsWith("cat:") ? [filter] : [])])]
    .filter((t) => !mine.has(t.toLowerCase())).sort();
  const num = { all: notes.length, unused };
  for (const c of myCats) num["cat:" + c] = notes.filter((n) => cats(n).includes(c)).length;
  if (filter.startsWith("cat:") && !myCats.includes(filter.slice(4))) filter = "all";
  $("chips").innerHTML = ["all", "unused", ...myCats.map((c) => "cat:" + c), ...topics].map((c) => `<button class="chip" aria-pressed="${c === filter}" data-f="${esc(c)}">${esc(c === "unused" ? "to try" : c.startsWith("cat:") ? c.slice(4) : c)}${num[c] ? ` <span class="n">${num[c]}</span>` : ""}</button>`).join("")
    + (!myCats.length && notes.length >= 3 && setupState && !setupState.owner ? `<button class="chip addcats" type="button" data-addcats>+ Your categories</button>` : "");
  const shown = notes.filter((n) => filter === "all" || (filter === "unused" ? n.status === "unused" : filter.startsWith("cat:") ? cats(n).includes(filter.slice(4)) : n.topic === filter));
  const caps = filter === "all" && !$("q").value.trim() ? captures.map(capCard).join("") : "";
  const first = !notes.length && filter === "all" && !$("q").value.trim();
  if (first && !welcomeSeen) { welcomeSeen = true; tr("card_shown", "welcome"); }
  $("list").innerHTML = first ? welcomeCard(captures.length > 0) + caps : (caps || shown.length) ? caps + shown.map(card).join("") : `<div class="empty"><b>${$("q").value ? "Nothing matches" : "Nothing saved yet"}</b>${$("q").value ? "Try a different word." : "Tap + to paste a link, or share a reel straight from Instagram.<br><button class=\"btn soft\" type=\"button\" data-howto>How do I share from Instagram?</button>"}</div>`;
  const query = $("q").value.trim();
  if ((!query && notes.length >= 200) || (query && notes.length >= 20))
    $("list").insertAdjacentHTML("beforeend", `<p class="result-limit" role="status">${query ? "Showing the top 20 matches. Add another word to narrow your search." : "Browsing shows up to 200 newest saves. Search to find older saves."}</p>`);
}
// First run: one card that gets you to a saved reel in 30 seconds, instead of a setup page.
// Instagram/Facebook in-app browsers keep their own storage, so we steer people out of them.
const inApp = /Instagram|FBAN|FBAV|FB_IAB/.test(navigator.userAgent);
let welcomeSeen = false;
function welcomeCard(saved) {
  const name = setupState && setupState.name && !setupState.owner ? " " + esc(setupState.name) : "";
  const step = (done, text) => `<li${done ? ' class="done"' : ""}>${text}</li>`;
  return `<div class="welcome">
    <b>${saved ? "Nice, it's reading your reel" : `Hi${name}, let's save your first reel`}</b>
    <p>${saved ? "Takes a minute or two. Next time, skip the copy-paste: share reels straight from Instagram into Skwirl."
      : "In Instagram, tap Share on a reel, then <em>Copy link</em>. Paste it here. A minute later it's a note you can search."}</p>
    ${saved ? "" : `<form class="field" data-wform><input name="u" type="url" inputmode="url" autocomplete="off" placeholder="Paste a reel link" aria-label="Reel link" required><button class="btn sm" type="submit">Save</button></form>`}
    <ol class="wsteps">${step(true, "Account made")}${step(saved, "Save your first reel")}${step(false, "Share straight from Instagram <button class=\"btn sm soft\" type=\"button\" data-howto>Set it up, 1 min</button>")}</ol>
    ${inApp ? `<div class="note-box" style="text-align:left"><b>You're inside Instagram's browser.</b> It can forget you. Save your sign-in link now, then open it in ${/Android/.test(navigator.userAgent) ? "Chrome" : "Safari"}. <button class="btn sm" type="button" data-savelink>Save my sign-in link</button></div>` : ""}
  </div>`;
}
let captures = [], loaded = false, known = null, pollTimer = null, importInfo = null;
let loadVersion = 0;
async function load() {
  const version = ++loadVersion;
  if (!loaded) $("list").innerHTML = skeleton();
  const q = $("q").value.trim();
  let nr, cr;
  try { [nr, cr] = await Promise.all([api(q ? "/v1/search?q=" + encodeURIComponent(q) : "/v1/notes?limit=200"), api("/v1/captures")]); } catch (e) { if (e.message === "stale") return; if (e.message !== "offline") throw e; }
  if (version !== loadVersion || q !== $("q").value.trim()) return;
  if (!nr || nr.status >= 500) return showCopy(q);
  if (!nr.ok) { toast("Couldn't load your saves. Try again."); return; }
  const [nj, cj] = await Promise.all([nr.json(), cr.ok ? cr.json() : {}]);
  if (version !== loadVersion || q !== $("q").value.trim()) return;
  notes = nj.notes; captures = cj.captures || []; importInfo = cj.import || null; loaded = true; showFeedback(); showImport();
  if (!q) cacheSet("stash_cache", { notes });
  flushOutbox();
  // A note we hadn't seen before means something just finished processing.
  const ids = new Set(notes.map((n) => n.id));
  if (known && !q) { const fresh = notes.find((n) => !known.has(n.id)); if (fresh) toast("Ready: " + fresh.title); }
  if (!q) known = ids;
  // Slow queue? Say so, and point at the fix.
  const slow = captures.some((c) => c.state === "processing" && Date.now() - Date.parse(c.at) > 15 * 60000);
  if (slow && bannerKey !== "owner") setBanner("busy", "info", "Saves are taking longer than usual. Yours are queued, not lost.", ...(setupState?.has_groq_key ? [] : ["Add my own Groq key", () => openSetup(false)]));
  else clearBanner("busy");
  if (!bannerKey && !store.get("stash_link_saved") && !(setupState && setupState.owner))
    setBanner("savelink", "warn", "No password here: your sign-in link is how you get back in. Save it somewhere safe.", "Save my link", saveLink);
  render(); schedulePoll();
}
// Polling reads only the small captures list; the notes reload only when that list changes.
// Nothing in flight means no timer at all (coming back to the tab still refreshes).
const pollSig = () => JSON.stringify([captures.map((c) => c.id + c.state), importInfo && importInfo.done]);
let lastSig = null;
function schedulePoll() {
  clearTimeout(pollTimer); lastSig = pollSig();
  const waiting = captures.some((c) => c.state === "processing");
  const importing = importInfo && importInfo.done + importInfo.failed < importInfo.total;
  if (!waiting && !importing) return;
  pollTimer = setTimeout(async () => {
    if (document.visibilityState !== "visible" || $("lib").style.display === "none") return schedulePoll();
    const cr = await api("/v1/captures").catch(() => null);
    const cj = cr && cr.ok ? await cr.json().catch(() => null) : null;
    if (!cj) return schedulePoll();
    captures = cj.captures || []; importInfo = cj.import || null;
    if (pollSig() !== lastSig) load().catch(() => schedulePoll()); else schedulePoll();
  }, waiting ? 8000 : 120000);
}
// Server down: show the copy from this device, search it locally, and check back in a minute.
let retryTimer = null;
function showCopy(q) {
  tr("offline_copy");
  const c = cacheGet("stash_cache");
  clearTimeout(retryTimer); retryTimer = setTimeout(() => load().catch(() => {}), 60000);
  if (!c) { if (!loaded) $("list").innerHTML = ""; setBanner("net", "err", "Skwirl's server is having a moment. Nothing is lost. We'll keep trying.", "Try again", () => load()); return; }
  const words = (q || "").toLowerCase().split(/\s+/).filter(Boolean);
  notes = words.length ? c.notes.filter((n) => words.every((w) => `${n.title} ${n.summary} ${n.topic}`.toLowerCase().includes(w))) : c.notes;
  loaded = true; render();
  setBanner("net", "warn", `Skwirl's server is having a moment, so this is your copy (saved ${ago2(c.at)}). New saves wait here and go through when it's back.`, "Try again", () => load());
}
// Links saved while the server is down wait on this device, then go through on the next good load.
const outbox = () => { try { return JSON.parse(store.get("stash_outbox") || "[]"); } catch { return []; } };
async function flushOutbox() {
  const waiting = outbox(); if (!waiting.length) return;
  store.del("stash_outbox");
  for (const u of waiting) await ingest(u);
}
async function ingest(url, source) {
  let r;
  try { r = await api("/v1/ingest", { method: "POST", body: JSON.stringify({ url, source: source || (matchMedia("(display-mode: standalone)").matches ? "pwa" : "web") }) }); }
  catch (e) { if (e.message !== "offline") return; }
  if (!r || r.status >= 500) {
    const q = outbox(); if (!q.includes(url)) q.push(url); store.set("stash_outbox", JSON.stringify(q.slice(-50)));
    toast("Skwirl's server is busy. It's kept on this device and saves when it's back."); return;
  }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { toast(body.error || "Couldn't save that link. Try again."); return; }
  tr("save", body.created ? "new" : "duplicate");
  toast(body.created ? "Saved. Takes a minute or two." : "You already saved that one.");
  load().catch(() => {});
}
let returnTo = "lib";
const USED_LABEL = { food: "I made this" };
let openVersion = 0;
async function open(id, from, record = true) {
  const version = ++openVersion, view = viewVersion;
  returnTo = from || "lib";
  const r = await api("/v1/notes/" + encodeURIComponent(id)).catch(() => null);
  if (version !== openVersion || view !== viewVersion) return;
  const kept = cacheGet("stash_notes") || { byId: {} };
  if (r && r.ok) {
    const opened = await r.json();
    if (version !== openVersion || view !== viewVersion) return;
    current = opened; tr("open_note", current.topic || "other");
    kept.byId[id] = current; const ids = Object.keys(kept.byId); for (const k of ids.slice(0, Math.max(0, ids.length - 40))) delete kept.byId[k];
    cacheSet("stash_notes", { byId: kept.byId });
  } else if ((!r || r.status >= 500) && kept.byId[id]) current = kept.byId[id];
  else { toast(r && r.status < 500 ? "That note isn't there anymore." : "Can't open that one while the server is down."); if (r && r.status < 500) load().catch(() => {}); return; }
  $("nTitle").textContent = current.title;
  $("nHero").style.background = tintOf(current.topic);
  $("nMeta").innerHTML = `${current.status === "used" ? '<span class="tag">Tried ✓</span>' : ""}<span class="tag">${esc(current.topic || "other")}</span>`;
  $("nBody").innerHTML = md(current.markdown);
  enhanceRecipe(current.id);
  const th = $("nThumb"); th.hidden = !current.thumb_id; if (current.thumb_id) th.src = "/t/" + current.thumb_id;
  $("nUsed").textContent = USED_LABEL[current.topic] || "I tried this";
  const o = $("nOpen"); o.hidden = !current.permalink; if (current.permalink) o.href = current.permalink;
  $("nUsed").hidden = current.status === "used";
  $("nUnshare").hidden = !current.share_id;
  renderNoteCats();
  show("note", record); scrollTo(0, 0);
}

// Landing: sections fade up as they scroll in. Skipped entirely under reduced motion.
if (!matchMedia("(prefers-reduced-motion: reduce)").matches && "IntersectionObserver" in window) {
  document.documentElement.classList.add("js-reveal");
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return; e.target.classList.add("in"); io.unobserve(e.target);
  }), { threshold: 0.15 });
  document.querySelectorAll("#auth .reveal, #auth .chat").forEach((el) => io.observe(el));
}
$("demoToggle").addEventListener("click", () => {
  const paused = $("productDemo").classList.toggle("demo-paused");
  $("demoToggle").setAttribute("aria-pressed", String(paused));
  $("demoToggle").textContent = paused ? "Play demo" : "Pause demo";
});
// Landing: ask for an invite code only when joining isn't open (or a #code= link brought one).
async function joinMode() {
  const code = $("joinCode");
  if (joinCodeFromLink) code.value = joinCodeFromLink;
  let mode = { open: true };
  try { mode = await (await fetch("/join")).json(); } catch {}
  const needCode = !mode.open || joinCodeFromLink;
  code.hidden = !needCode; code.required = !mode.open;
  if (!mode.open && !mode.invite) {
    $("joinForm").querySelectorAll("input,button").forEach((el) => (el.disabled = true));
    $("joinFine").textContent = "Skwirl is full for now. If someone sent you an invite link, open that instead.";
  } else if (!mode.open) $("joinFine").textContent = "Invite-only right now. Your invite has the code.";
  $("lostMail").hidden = $("lostForm").hidden = !mode.email_login;
}
// Signing up inside Instagram's browser strands the account there. Offer the real browser first.
if (inApp) {
  const and = /Android/.test(navigator.userAgent);
  $("inAppNote").innerHTML = and
    ? `You're in Instagram's browser, which can forget you. <a href="intent://${location.host}/#Intent;scheme=https;package=com.android.chrome;end">Open Skwirl in Chrome</a> instead.`
    : "You're in Instagram's browser, which can forget you. Tap <b>•••</b> at the top, then <b>Open in external browser</b>.";
  $("inAppNote").hidden = false; tr("card_shown", "inapp");
}
$("lostForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await fetch("/login/email", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email: $("lostEmail").value }) }).catch(() => null);
  const b = r ? await r.json().catch(() => ({})) : {};
  $("lostMsg").textContent = r && r.ok ? "If that email is on a Skwirl account, a sign-in link is on its way. Check spam too." : b.error || "Couldn't send. Try again.";
});
$("toTop").addEventListener("click", (e) => { e.preventDefault(); scrollTo({ top: 0, behavior: "smooth" }); setTimeout(() => $("joinName").focus(), 400); });
document.querySelector(".lsign").addEventListener("click", () => { $("signin").open = true; });
// The optional email shows up once someone starts on the name field, and goes away again if they
// leave both fields without typing an email.
{ const fields = [$("joinName"), $("joinEmail")];
  $("joinName").addEventListener("focus", () => { $("joinMail").hidden = false; });
  for (const el of fields) el.addEventListener("blur", () => setTimeout(() => {
    if (!fields.includes(document.activeElement) && !$("joinEmail").value.trim()) $("joinMail").hidden = true; }, 150)); }
$("joinForm").addEventListener("submit", async (e) => {
  tr("join_submit");
  e.preventDefault(); const err = $("joinErr"), button = e.currentTarget.querySelector("button[type=submit]");
  if (button.disabled) return;
  button.disabled = true; err.textContent = "";
  let r;
  try { r = await fetch("/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("joinName").value, code: $("joinCode").value, email: $("joinEmail").value }) }); }
  catch { button.disabled = false; err.textContent = "Can't reach Skwirl. Check your connection and try again."; return; }
  const body = await r.json().catch(() => ({})); button.disabled = false;
  if (!r.ok) { tr("join_err", r.status); err.textContent = body.error || "Couldn’t join. Try again."; return; }
  tr("join_ok", $("joinEmail").value ? "with_email" : "no_email");
  token = body.token; store.set("stash_token", token); store.del("stash_link_saved"); start();
});
// A pasted sign-in link works as well as a bare token.
const tokenFrom = (text) => ((text || "").match(/(stk_[0-9a-f]{20,}|[\w-]{24,})/) || [])[1] || (text || "").trim();
async function signInWith(t) {
  token = t;
  let r;
  try { r = await fetch("/v1/notes?limit=1", { headers: { Authorization: "Bearer " + token } }); }
  catch { token = null; return "Can't reach Skwirl. Check your connection and try again."; }
  tr("signin", r.ok ? "ok" : r.status);
  if (r.ok) { store.set("stash_token", token); start(); return ""; }
  token = null;
  return r.status === 401 ? "That didn't work. Copy the whole sign-in link (or the token, starting stk_) and try again." : "Skwirl had a problem. Try again in a minute.";
}
const standalone = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
if (standalone && !token) {
  $("pwaIn").hidden = false;
  $("pwaPaste").addEventListener("click", async () => {
    let text = ""; try { text = await navigator.clipboard.readText(); } catch {}
    if (!text) { $("signin").open = true; $("token").focus(); $("pwaErr").textContent = "Couldn't read the clipboard. Paste the link in the box at the bottom."; return; }
    $("pwaErr").textContent = await signInWith(tokenFrom(text));
  });
}
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault(); $("authErr").textContent = await signInWith(tokenFrom($("token").value));
});
// There's no email or password, so losing the link means losing the stash. Push it somewhere safe.
const signInLink = () => `${location.origin}/#t=${token}`;
async function saveLink() {
  const text = "My Skwirl sign-in link. Keep it private, it opens my saves:";
  if (navigator.share && onPhone) {
    try { await navigator.share({ title: "Skwirl sign-in link", text, url: signInLink() }); } catch { return; }
  } else {
    await copy(signInLink(), "Sign-in link");
    toast("Copied. Paste it into your notes or email it to yourself.");
  }
  store.set("stash_link_saved", "1"); clearBanner("savelink");
}
let sheetFocus = null, sheetTimer;
const sheet = (open) => {
  clearTimeout(sheetTimer);
  if (open && !document.body.classList.contains("sheet-open")) sheetFocus = document.activeElement;
  document.body.classList.toggle("sheet-open", open);
  document.querySelector("main").inert = open; $("fab").inert = open;
  if (open) sheetTimer = setTimeout(() => $("link").focus(), 250);
  else if (sheetFocus?.isConnected && sheetFocus.getClientRects().length) sheetFocus.focus();
};
$("fab").addEventListener("click", () => sheet(true));
$("scrim").addEventListener("click", () => sheet(false));
$("cancel").addEventListener("click", () => sheet(false));
document.addEventListener("keydown", (e) => {
  if (!document.body.classList.contains("sheet-open")) return;
  if (e.key === "Escape") { e.preventDefault(); sheet(false); }
  if (e.key === "Tab") {
    const controls = [...$("saveForm").querySelectorAll("input:not([disabled]), button:not([disabled]), a[href]")].filter(el => el.getClientRects().length);
    const first = controls[0], last = controls[controls.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }
});
$("saveForm").addEventListener("submit", async (e) => { e.preventDefault(); const u = $("link").value.trim(); if (u) { $("link").value = ""; sheet(false); await ingest(u); } });
let searchTimer;
$("q").addEventListener("input", () => {
  ++loadVersion; clearTimeout(timer); timer = setTimeout(load, 200);
  // One "search" per pause in typing, with how many results it found (never the words).
  clearTimeout(searchTimer); searchTimer = setTimeout(() => $("q").value.trim() && tr("search", notes.length ? (notes.length > 5 ? "6+" : notes.length) : "0 results"), 1500);
});
$("chips").addEventListener("click", (e) => {
  if (e.target.closest("[data-addcats]")) { tr("click", "addcats_chip"); openSetup(false); $("gCats").open = true; $("gCats").scrollIntoView({ behavior: "smooth" }); setTimeout(() => $("catIn").focus(), 400); return; }
  const f = e.target.dataset.f; if (f) { filter = f; tr("filter", f.startsWith("cat:") ? "category" : f); render(); }
});
$("list").addEventListener("click", async (e) => {
  const retry = e.target.closest("[data-retry]"), del = e.target.closest("[data-del]");
  if (retry) { const r = await api("/v1/captures/" + retry.dataset.retry + "/retry", { method: "POST" }); toast(r.ok ? "Trying again." : "Couldn't retry that one."); return load(); }
  if (del) { const r = await api("/v1/captures/" + del.dataset.del, { method: "DELETE" }); toast(r.ok ? "Removed." : "Couldn't remove that one."); return load(); }
  const c = e.target.closest(".card[data-id]"); if (c) open(c.dataset.id);
});
function renderNoteCats() {
  $("nCats").hidden = !myCats.length || !current;
  if ($("nCats").hidden) return;
  const on = cats(current);
  $("nCatList").innerHTML = myCats.map((c) => `<button class="chip" type="button" aria-pressed="${on.includes(c)}" data-ncat="${esc(c)}">${esc(c)}</button>`).join("");
}
$("nCatList").addEventListener("click", async (e) => {
  const b = e.target.closest("[data-ncat]"); if (!b || !current) return;
  const name = b.dataset.ncat, before = cats(current), turnOn = !before.includes(name), noteId = current.id;
  const after = turnOn ? [...before, name] : before.filter((c) => c !== name);
  const setOn = (list) => { current.categories = list; const n = notes.find((x) => x.id === noteId); if (n) n.categories = list; renderNoteCats(); };
  setOn(after); tr("click", turnOn ? "category_on" : "category_off");
  const r = await api(`/v1/notes/${encodeURIComponent(noteId)}/categories`, { method: "POST", body: JSON.stringify({ name, on: turnOn }) }).catch(() => null);
  if (!r || !r.ok) { if (current?.id === noteId) setOn(before); toast("Couldn't save that. Try again."); }
});
function renderCatEditor() {
  $("catList").innerHTML = myCats.map((c, i) => `<span class="catitem">${esc(c)}<button type="button" data-rmcat="${i}" aria-label="Remove ${esc(c)}">×</button></span>`).join("");
  $("bCats").textContent = myCats.length ? `${myCats.length} set` : "Optional";
  $("bCats").className = "badge " + (myCats.length ? "done" : "opt");
}
async function saveCats(next, msg) {
  const before = myCats; myCats = next; renderCatEditor(); render();
  const r = await api("/v1/categories", { method: "PUT", body: JSON.stringify({ categories: next }) }).catch(() => null);
  const b = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { myCats = before; renderCatEditor(); render(); $("catMsg").className = "msg err"; $("catMsg").textContent = b.error || "Couldn't save that. Try again."; return; }
  myCats = b.names || next; renderCatEditor(); render();
  $("catMsg").className = "msg ok"; $("catMsg").textContent = msg;
}
$("catForm").addEventListener("submit", (e) => {
  e.preventDefault(); const name = $("catIn").value.replace(/\s+/g, " ").trim(); if (!name) return;
  if (myCats.some((c) => c.toLowerCase() === name.toLowerCase())) { $("catMsg").className = "msg"; $("catMsg").textContent = "You already have that one."; return; }
  if (myCats.length >= 20) { $("catMsg").className = "msg err"; $("catMsg").textContent = "Up to 20 categories."; return; }
  $("catIn").value = ""; tr("click", "category_add");
  saveCats([...myCats, name], "Added. Skwirl is sorting your saves into it now, old ones too. It takes a few minutes.");
});
$("catList").addEventListener("click", (e) => {
  const b = e.target.closest("[data-rmcat]"); if (!b) return;
  const gone = myCats[Number(b.dataset.rmcat)];
  if (!confirm(`Remove "${gone}"? Notes won't be filed under it any more.`)) return;
  tr("click", "category_remove"); saveCats(myCats.filter((c) => c !== gone), `Removed "${gone}".`);
});
$("back").addEventListener("click", () => { backTo(returnTo); if (returnTo === "lib") load(); });
$("nShare").addEventListener("click", async () => {
  const r = await api("/v1/notes/" + current.id + "/share", { method: "POST" }).catch(() => null);
  if (!r || !r.ok) return toast("Couldn't make a share link. Try again.");
  current.share_id = (await r.json()).share_id;
  const url = `${location.origin}/n/${current.share_id}`;
  if (navigator.share && onPhone) { try { await navigator.share({ title: current.title, url }); } catch {} }
  else copy(url, "Share link");
  $("nUnshare").hidden = false;
});
$("nUnshare").addEventListener("click", async () => {
  const r = await api("/v1/notes/" + current.id + "/share", { method: "DELETE" }).catch(() => null);
  if (!r || !r.ok) return toast("Couldn't stop sharing. Try again.");
  current.share_id = null; $("nUnshare").hidden = true; toast("Stopped sharing. The old link no longer works.");
});
$("nUsed").addEventListener("click", async () => {
  const r = await api("/v1/notes/" + current.id + "/used", { method: "POST" }).catch(() => null);
  if (!r || !r.ok) return toast("Couldn't save that. Try again.");
  toast(current.topic === "food" ? "Nice. Marked as made." : "Nice. Marked as tried."); $("nUsed").hidden = true;
  current.status = "used"; $("nMeta").insertAdjacentHTML("afterbegin", '<span class="tag">Tried ✓</span>');
});
// Recipe notes: ingredients become a tap-to-tick shopping/cooking checklist,
// remembered per device (it's a cooking aid, not account data).
function enhanceRecipe(noteId) {
  const h = [...$("nBody").querySelectorAll("h2")].find((x) => x.textContent.trim().toLowerCase() === "ingredients");
  const list = h && h.nextElementSibling && h.nextElementSibling.tagName === "UL" ? h.nextElementSibling : null;
  if (!list) return;
  const key = "ing:" + noteId; let got = [];
  try { got = JSON.parse(store.get(key) || "[]"); } catch {}
  [...list.children].forEach((li, i) => {
    li.classList.add("ing");
    const label = document.createElement("label"), check = document.createElement("input"), text = document.createElement("span");
    label.className = "ing-check"; check.type = "checkbox";
    while (li.firstChild) text.appendChild(li.firstChild);
    label.append(check, text); li.appendChild(label);
    const set = (on) => { li.classList.toggle("got", on); check.checked = on; };
    set(got.includes(i));
    check.addEventListener("change", () => {
      const on = check.checked; set(on); got = on ? [...got, i] : got.filter((x) => x !== i); store.set(key, JSON.stringify(got));
    });
  });
}


// ---------------- setup / onboarding ----------------
let setupState = null;
const mcpUrl = () => `${location.origin}/mcp`;
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); } catch {
    const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove();
  }
  toast(label + " copied");
}
async function refreshSetup() {
  try { setupState = await (await api("/v1/setup")).json(); } catch { return; }
  const st = setupState, phone = ["shortcut", "pwa", "web"].some((k) => (st.saved_from || {})[k]);
  // A one-off note from the owner (user.owner_msg): shown until tapped, then cleared server-side.
  if (st.owner_msg && bannerKey !== "net") {  // beats every banner but a connection error
    // An optional leading "#gGroq " names the Set up section the button opens (default: Save from your phone).
    const [, target = "gSave", text] = st.owner_msg.match(/^(?:#(\w+) )?([\s\S]*)$/);
    if (bannerKey !== "owner") tr("card_shown", "owner_msg");
    setBanner("owner", "info", text, target === "gSave" ? "Show me how" : target === "gCats" ? "Set them up" : target === "gGroq" ? "See options" : "Fix it", () => {
      tr("click", "owner_msg"); clearBanner("owner"); api("/v1/owner-msg/seen", { method: "POST" }).catch(() => {});
      openSetup(false); const g = $(target) || $("gSave"); g.open = true; g.scrollIntoView({ behavior: "smooth" });
    });
  }
  const set = (id, done, todo = "To do") => { const b = $(id); b.textContent = done ? "Done ✓" : todo; b.className = "badge" + (done ? " done" : id === "bGroq" ? " opt" : ""); };
  set("bSave", phone); set("bClaude", st.claude_connected); set("bGroq", st.has_groq_key, "Optional");
  $("groqPaid").hidden = !st.has_groq_key;
  if (standalone || st.saved_from?.pwa) { $("bHome").textContent = "Done ✓"; $("bHome").className = "badge done"; }
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent), and = /Android/.test(navigator.userAgent);
  $("homeIos").hidden = !ios && and; $("homeAnd").hidden = !and; $("homeDesk").hidden = ios || and;
  $("setupDot").hidden = phone;   // Claude is recommended, not required: don't nag forever
  $("ccBox").hidden = !!st.owner;
  if (!st.owner) api("/v1/cc-key").then((r) => r.json()).then((k) => ccShow(k.created_at)).catch(() => {});
  $("mcpAddr").textContent = mcpUrl();
  $("gTelegram").hidden = !st.telegram;
  if (st.telegram) { set("bTelegram", st.telegram.connected, "Optional"); if (!st.telegram.connected) $("bTelegram").className = "badge opt"; $("tgOff").hidden = !st.telegram.connected; }
  $("adminBtn").hidden = !st.owner;
  showFeedback(); showImport(); refreshAvatar(); if (loaded && !notes.length) render();
  $("groqBody").hidden = !!st.owner; $("groqOwnerMsg").hidden = !st.owner;
  if (st.has_groq_key && !st.owner) $("groqMsg").textContent = "A key is saved and in use. Paste a new one to replace it.", $("groqMsg").className = "msg ok";
  $("groqOff").hidden = !st.has_groq_key || st.owner;
  const fresh = st.categories || [];
  if (JSON.stringify(fresh) !== JSON.stringify(myCats)) { myCats = fresh; renderCatEditor(); if (loaded) render(); }
}
// Desktop → phone handoff: a QR of the sign-in link (#t=), drawn locally, never sent anywhere.
const onPhone = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
document.body.classList.toggle("on-phone", onPhone);
function drawQr() {
  if (onPhone || !token) return;
  // Only computers show the QR, so phones never download the 57KB library.
  if (typeof qrcode !== "function") { const s = document.createElement("script"); s.src = "/qrcode.js"; s.onload = drawQr; document.head.appendChild(s); return; }
  const qr = qrcode(0, "M"); qr.addData(`${location.origin}/#t=${token}`); qr.make();
  const svg = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
  document.querySelectorAll("[data-qr]").forEach((el) => { el.innerHTML = svg; });
}
function openSetup(first) {
  show("setup"); $("setupTitle").textContent = first ? "Welcome to Skwirl" : "Set up Skwirl"; scrollTo(0, 0); refreshSetup(); drawQr();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); setTab(ios || !/Android/.test(navigator.userAgent) ? "ios" : "and");
}
function setTab(which) {
  $("tabIos").setAttribute("aria-selected", which === "ios"); $("tabAnd").setAttribute("aria-selected", which === "and");
  $("paneIos").hidden = which !== "ios"; $("paneAnd").hidden = which !== "and";
}
$("setupBtn").addEventListener("click", () => openSetup(false));
$("setupBack").addEventListener("click", () => { backTo("lib"); load(); refreshSetup(); });
$("tabIos").addEventListener("click", () => setTab("ios")); $("tabAnd").addEventListener("click", () => setTab("and"));
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const what = b.dataset.copy;
  if (what === "token") copy(token, "Token"); else if (what === "link") saveLink(); else if (what === "linkonly") copy(signInLink(), "Sign-in link"); else if (what === "mcp") copy(mcpUrl(), "Connector address"); else if (what === "prefs") copy($("claudePrefs").textContent, "Line");
});
// Claude Code plugin: each tap makes a new key (shown once, inside the command); the old one stops working.
function ccShow(at) {
  $("ccOff").hidden = !at;
  $("ccStatus").textContent = at ? `Installed with a key made ${new Date(at).toLocaleDateString()}. Copying again makes a new key and the old one stops working.` : "";
}
$("ccMake").addEventListener("click", async () => {
  try {
    const { key } = await (await api("/v1/cc-key", { method: "POST" })).json();
    const cmd = `claude plugin install skwirl --marketplace Parthuss/stash --config key=${key}`;
    $("cmdCode").textContent = cmd; $("cmdCode").hidden = false;
    copy(cmd, "Install command"); tr("click", "cc_install"); ccShow(new Date().toISOString());
  } catch {}
});
$("ccOff").addEventListener("click", async () => {
  if (!confirm("Turn off the Claude Code plugin? It stops checking your saves until you install it again.")) return;
  try { await api("/v1/cc-key", { method: "DELETE" }); $("cmdCode").hidden = true; ccShow(null); toast("Claude Code plugin turned off"); } catch {}
});
$("groqOff").addEventListener("click", async () => {
  if (!confirm("Remove your Groq key? Your saves go back to Skwirl's shared key, with its small daily limit.")) return;
  const r = await api("/v1/settings/groq", { method: "DELETE" }).catch(() => null);
  tr("click", "groq_remove");
  $("groqMsg").className = "msg"; $("groqMsg").textContent = r && r.ok ? "Removed. Your saves use Skwirl's shared key now." : "Couldn't remove it. Try again.";
  refreshSetup();
});
$("groqForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const m = $("groqMsg"); m.className = "msg"; m.textContent = "Checking with Groq…";
  const r = await api("/v1/settings/groq", { method: "PUT", body: JSON.stringify({ key: $("groqKey").value }) }).catch(() => null);
  if (!r) { m.className = "msg err"; m.textContent = "Couldn't check that key. Check your connection and try again."; return; }
  const body = await r.json().catch(() => ({}));
  if (r.ok) { $("groqKey").value = ""; m.className = "msg ok"; m.textContent = "Saved. Your saves now use your own key."; refreshSetup(); }
  else { m.className = "msg err"; m.textContent = body.error || "Couldn’t save that key."; }
});
$("exportBtn").addEventListener("click", async () => {
  const r = await api("/v1/export").catch(() => null);
  if (!r || !r.ok) return toast("Couldn't export right now. Try again.");
  const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a"); a.href = url; a.download = "skwirl-export.json"; a.click(); URL.revokeObjectURL(url);
});
$("signOutBtn").addEventListener("click", () => {
  if (!store.get("stash_link_saved") && !confirm("You haven't saved your sign-in link. Without it you can't get back in. Sign out anyway?")) return;
  const waiting = outbox().length;
  if (waiting && !confirm(`${waiting} save${waiting > 1 ? "s haven't" : " hasn't"} reached Skwirl yet (it was offline). Signing out deletes ${waiting > 1 ? "them" : "it"}. Sign out anyway?`)) return;
  signOut();
});

async function start() {
  show("lib");
  // Android share sheet lands here as /?url=…&text=… (manifest share_target).
  const p = new URLSearchParams(location.search);
  const shared = p.get("url") || (p.get("text") || "").match(/https?:\/\/\S+/)?.[0];
  let pending = null; try { pending = JSON.parse(sessionStorage.getItem("pending_share")); sessionStorage.removeItem("pending_share"); } catch {}
  const toSave = shared || pending?.url, src = shared ? p.get("src") : pending?.src;
  if (shared) history.replaceState(null, "", "/");
  if (toSave) await ingest(toSave, src === "shortcut" ? "shortcut" : null);
  await load();
  refreshSetup();
}
document.addEventListener("visibilitychange", () => token && document.visibilityState === "visible" && $("lib").style.display !== "none" && load().catch(() => {}));
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
// A share that arrives before sign-in must survive the sign-in screen.
{ const p = new URLSearchParams(location.search), u = p.get("url") || (p.get("text") || "").match(/https?:\/\/\S+/)?.[0];
  if (u && !token) { try { sessionStorage.setItem("pending_share", JSON.stringify({ url: u, src: p.get("src") })); } catch {} history.replaceState(null, "", "/"); } }
// A one-time #login= link (from the email or the Telegram bot): trade it for a token on this device.
const loginCode = (location.hash.match(/^#login=([0-9a-f]{32})/) || [])[1];
if (loginCode) {
  history.replaceState(null, "", location.pathname + location.search);
  fetch("/login/redeem", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ code: loginCode }) })
    .then(async (r) => { const b = await r.json().catch(() => ({})); tr("login_link", r.ok ? "ok" : "expired"); if (!r.ok) throw new Error(b.error); token = b.token; store.set("stash_token", token); store.del("stash_link_saved"); start(); })
    .catch((e) => { show("auth"); joinMode(); $("signin").open = true; $("authErr").textContent = e.message || "That link didn't work. Ask for a new one."; });
} else token ? start().catch(() => {}) : (show("auth"), joinMode());
// A different account's sign-in link opened on a signed-in device: switch only if it works.
if (linkToken) fetch("/v1/notes?limit=1", { headers: { Authorization: "Bearer " + linkToken } })
  .then((r) => { if (r.ok) { store.set("stash_token", linkToken); store.del("stash_link_saved"); location.reload(); }
    else if (r.status === 401) toast("That sign-in link has expired or was reset, so you're still signed in as before."); })
  .catch(() => toast("Couldn't check that sign-in link. You're still signed in as before."));

// ---- account safety: reset token, delete account ----
$("rotateBtn").addEventListener("click", async () => {
  if (!confirm("Reset your token? Your old one stops working, connected AI apps are disconnected.")) return;
  const r = await api("/v1/token/rotate", { method: "POST" }); const body = await r.json().catch(() => ({}));
  if (!r.ok) return toast(body.error || "Couldn't reset it.");
  token = body.token; store.set("stash_token", token); refreshSetup(); drawQr();
  toast("New token saved here. Sign in again on your other devices and reconnect your AI apps.");
});
$("deleteBtn").addEventListener("click", async () => {
  if (prompt("This erases everything you saved, for good. Type DELETE to confirm.") !== "DELETE") return;
  const r = await api("/v1/account", { method: "DELETE", body: JSON.stringify({ confirm: "delete" }) });
  if (r.ok) { store.del("stash_welcomed"); signOut(); toast("Account deleted."); } else toast("Couldn't delete it. Try again.");
});

// ---------------- admin (owner only) ----------------
const ago = (iso) => {
  if (!iso) return "never"; const m = Math.max(0, (Date.now() - Date.parse(iso)) / 60000);
  return m < 2 ? "just now" : m < 90 ? Math.round(m) + " min ago" : m < 2880 ? Math.round(m / 60) + " h ago" : Math.round(m / 1440) + " d ago";
};
async function openAdmin() {
  show("admin"); scrollTo(0, 0);
  $("adminHealth").textContent = "Loading…"; $("adminStats").innerHTML = ""; $("adminUsers").innerHTML = skeleton();
  const r = await api("/v1/admin/overview"); if (!r.ok) { $("adminHealth").textContent = "Couldn't load admin. Go back and try again."; $("adminUsers").innerHTML = ""; return; }
  const { overview: o, users } = await r.json();
  const stuck = o.oldest_waiting && Date.now() - Date.parse(o.oldest_waiting) > 3600000;
  const bits = [stuck ? "Queue looks stuck" : "", o.failed ? `${o.failed} failed` : ""].filter(Boolean);
  $("adminHealth").innerHTML = bits.length ? `<span class="badge bad">${esc(bits.join(" · "))}</span>` : `<span class="badge done">Healthy</span>`;
  const stat = (n, label) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
  $("adminStats").innerHTML = stat(o.users, "people") + stat(o.saves_24h, "saves, last 24h")
    + stat(`${o.notes_24h} / ~25`, "processed today (free Groq cap)") + stat(o.waiting, "waiting now")
    + stat(o.failed, "gave up") + stat(ago(o.last_note), "last note finished");
  $("adminUsers").innerHTML = users.map((u) => {
    const active = u.saves_7d > 0 && u.last_seen && Date.now() - Date.parse(u.last_seen) < 3 * 864e5;
    const chip = u.name === "owner" ? ["you", "opt"] : !u.saves ? ["no saves yet", ""] : active ? ["active", "done"] : ["quiet", "opt"];
    const pct = u.notes ? Math.round((100 * u.opened) / u.notes) + "%" : "n/a";
    return `<div class="ucard"><header><h3>${esc(u.name === "owner" ? (setupState && setupState.name) || "You" : u.name)}</h3><span class="badge ${chip[1]}">${chip[0]}</span></header>
      <dl><div><dt>Joined</dt><dd>${esc(ago(u.created_at))}</dd></div><div><dt>Last active</dt><dd>${esc(ago(u.last_seen || u.last_save))}</dd></div>
      <div><dt>Saves (7d)</dt><dd>${u.saves_7d}</dd></div><div><dt>Notes</dt><dd>${u.notes}</dd></div>
      <div><dt>Reopened</dt><dd>${pct}</dd></div><div><dt>Used</dt><dd>${u.used}</dd></div>
      <div><dt>Claude</dt><dd>${u.mcp_calls ? "connected" : "no"}</dd></div><div><dt>Own key</dt><dd>${u.own_key ? "yes" : "no"}</dd></div>
      <div><dt>Waiting / failed</dt><dd>${u.waiting} / ${u.failed}</dd></div>
      ${u.feedback ? `<div style="grid-column:1/-1"><dt>Feedback</dt><dd>${esc(u.feedback)}</dd></div>` : ""}
      ${u.email ? `<div><dt>Email</dt><dd><a href="mailto:${esc(u.email)}">${esc(u.email)}</a></dd></div>` : ""}</dl></div>`;
  }).join("");
}
$("adminBtn").addEventListener("click", openAdmin);
$("adminBack").addEventListener("click", () => { backTo("lib"); load(); });

// Anything unhandled becomes a plain message, not a silent dead button.
window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason && e.reason.message; if (m === "offline" || m === "unauthorized") return;
  toast("Something went wrong. Try again.");
});

// ---------------- Lists (books, movies, places... across every post) ----------------
const MENTION_ICONS = { book: "📖", movie: "🎬", show: "📺", podcast: "🎙️", place: "📍", product: "🛍️", person: "🙂", other: "✦" };
const MENTION_TINTS = { book: "--lavender", movie: "--peach", show: "--sky", podcast: "--butter", place: "--mint", product: "--sky", person: "--lavender", other: "--butter" };
const DONE_VERB = { book: "Read", movie: "Watched", show: "Watched", podcast: "Heard", place: "Been", product: "Got it", person: "Done", other: "Done" };
const PLURAL = { person: "people" };
let mentionFilter = "all", allMentions = [];

function renderMentions() {
  const kinds = [...new Set(allMentions.map((m) => m.type))].sort();
  $("mentionChips").innerHTML = ["all", ...kinds].map((k) =>
    `<button class="chip" aria-pressed="${k === mentionFilter}" data-mk="${esc(k)}">${esc(k === "all" ? "all" : PLURAL[k] || k + "s")}</button>`).join("");
  const shown = (mentionFilter === "all" ? allMentions : allMentions.filter((m) => m.type === mentionFilter))
    .slice();
  $("mentionList").innerHTML = shown.length
    ? shown.map((m, i) => {
        const verb = DONE_VERB[m.type] || "Done";
        const where = m.count > 1 ? `in ${m.count} posts` : esc(m.note_title);
        const kind = m.type.charAt(0).toUpperCase() + m.type.slice(1);
        return `<div class="mcard ${m.done ? "done" : ""}">
        <span class="kind" style="background:var(${MENTION_TINTS[m.type] || "--butter"})">${m.thumb_id ? `<img src="/t/${esc(m.thumb_id)}" alt="" loading="lazy">` : MENTION_ICONS[m.type] || "✦"}</span>
        <button class="info" type="button" data-open="${esc(m.note_id)}" style="border:0;background:none;padding:0;text-align:left;cursor:pointer"><h3>${esc(m.name)}</h3><small>${esc(kind)} · ${where}</small></button>
        <button class="tick" type="button" data-done="${i}" aria-pressed="${m.done}" ${m.pending ? "disabled" : ""}>${m.done ? verb + " ✓" : verb + "?"}</button></div>`;
      }).join("")
    : `<div class="empty"><b>No lists yet</b>When a reel names a book, movie, show, place or podcast, it lands here automatically. Nothing to set up.</div>`;
  $("mentionList")._shown = shown;
}
async function openMentions() {
  show("mentions"); scrollTo(0, 0);
  $("mentionList").innerHTML = skeleton();
  const r = await api("/v1/mentions").catch(() => null);
  if (!r || !r.ok) { $("mentionList").innerHTML = `<div class="empty">Couldn't load this. Go back and try again.</div>`; return; }
  allMentions = (await r.json()).mentions.sort((a, b) => Number(a.done) - Number(b.done)); renderMentions();
}
$("mentionsBtn").addEventListener("click", () => { mentionFilter = "all"; openMentions(); });
$("mentionsBack").addEventListener("click", () => { backTo("lib"); load(); });
$("mentionChips").addEventListener("click", (e) => { const k = e.target.dataset.mk; if (k) { mentionFilter = k; renderMentions(); } });
$("mentionList").addEventListener("click", async (e) => {
  const d = e.target.closest("[data-done]");
  if (d) {
    const m = $("mentionList")._shown[Number(d.dataset.done)]; if (!m || m.pending) return;
    const wasDone = m.done; m.pending = true; m.done = !m.done; renderMentions();
    const r = await api("/v1/mentions/done", { method: "POST", body: JSON.stringify({ type: m.type, name: m.name, done: m.done }) }).catch(() => null);
    m.pending = false;
    if (!r || !r.ok) { m.done = wasDone; toast("Couldn't save that. Try again."); }
    renderMentions();
    return;
  }
  const c = e.target.closest("[data-open]"); if (c) open(c.dataset.open, "mentions");
});
$("list").addEventListener("click", (e) => { if (e.target.closest("[data-howto]")) openSetup(false); if (e.target.closest("[data-savelink]")) saveLink(); });
$("list").addEventListener("submit", async (e) => {
  const f = e.target.closest("[data-wform]"); if (!f) return;
  e.preventDefault(); tr("click", "welcome_save");
  const url = (f.u.value.match(/https?:\/\/\S+/) || [f.u.value])[0].trim(); f.querySelector("button").disabled = true;
  await ingest(url); f.querySelector("button").disabled = false;
});
// A broken cover image falls back to the card's serif initial underneath it.
document.addEventListener("error", (e) => { if (e.target && e.target.tagName === "IMG" && (e.target.classList.contains("thumb") || e.target.closest(".kind"))) e.target.remove(); }, true);

// ---- Import old Instagram saves from Meta's data export --------------------
// The export is a ZIP (often huge, with media), so read it in place: find saved_* files through the
// central directory and inflate just those with the browser's own DecompressionStream.
const POST_RE = /https?:\/\/(?:www\.)?instagram\.com\/(?:p|reel|reels|tv)\/[\w-]+/gi;
async function zipTexts(file, want) {
  const u32 = (v, o) => v.getUint32(o, true), u16 = (v, o) => v.getUint16(o, true);
  const u64 = (v, o) => u32(v, o) + u32(v, o + 4) * 2 ** 32;
  const view = async (start, len) => new DataView(await file.slice(start, start + len).arrayBuffer());
  const tailLen = Math.min(file.size, 65557), tail = await view(file.size - tailLen, tailLen);
  let e = -1;
  for (let i = tailLen - 22; i >= 0; i--) if (u32(tail, i) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error("not a zip");
  let count = u16(tail, e + 10), cdLen = u32(tail, e + 12), cdOff = u32(tail, e + 16);
  if (cdOff === 0xffffffff || count === 0xffff) {  // zip64
    const loc = await view(file.size - tailLen + e - 20, 20);
    const z = await view(u64(loc, 8), 56);
    count = u64(z, 32); cdLen = u64(z, 40); cdOff = u64(z, 48);
  }
  const cd = await view(cdOff, cdLen), out = [];
  for (let p = 0, n = 0; n < count && u32(cd, p) === 0x02014b50; n++) {
    const method = u16(cd, p + 10), nameLen = u16(cd, p + 28), extraLen = u16(cd, p + 30), commentLen = u16(cd, p + 32);
    let csize = u32(cd, p + 20), usize = u32(cd, p + 24), off = u32(cd, p + 42);
    const name = new TextDecoder().decode(new Uint8Array(cd.buffer, cd.byteOffset + p + 46, nameLen));
    for (let x = p + 46 + nameLen; x < p + 46 + nameLen + extraLen; ) {  // zip64 sizes/offset live in extra field 0x0001
      const id = u16(cd, x), len = u16(cd, x + 2); let y = x + 4;
      if (id === 1) { if (usize === 0xffffffff) { usize = u64(cd, y); y += 8; } if (csize === 0xffffffff) { csize = u64(cd, y); y += 8; } if (off === 0xffffffff) off = u64(cd, y); }
      x += 4 + len;
    }
    p += 46 + nameLen + extraLen + commentLen;
    if (!want(name)) continue;
    const lh = await view(off, 30), start = off + 30 + u16(lh, 26) + u16(lh, 28);
    const raw = file.slice(start, start + csize);
    const data = method === 0 ? raw : method === 8 ? await new Response(raw.stream().pipeThrough(new DecompressionStream("deflate-raw"))).blob() : null;
    if (data) out.push(await data.text());
  }
  return out;
}
async function importFile(file) {
  const msg = $("impMsg"); msg.textContent = "Reading the file…";
  let texts;
  try {
    texts = /\.zip$/i.test(file.name) || file.type.includes("zip")
      ? await zipTexts(file, (n) => /saved[^/]*\.(json|html)$/i.test(n))
      : [await file.text()];
  } catch { msg.textContent = "Couldn't read that file. Pick the ZIP Instagram sent you, or the saved_posts file inside it."; return; }
  const urls = [...new Set(texts.join("\n").replace(/\\\//g, "/").match(POST_RE) || [])];
  if (!urls.length) { msg.textContent = "No saved posts in that file. When you export, pick Saved under Customize information."; return; }
  msg.textContent = `Found ${urls.length} saved posts. Adding them…`;
  const r = await api("/v1/import", { method: "POST", body: JSON.stringify({ urls }) }).catch(() => null);
  const b = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { msg.textContent = b.error || "Couldn't add them right now. Try again."; return; }
  tr("import", `${b.added} added of ${b.found}`);
  msg.textContent = `Added ${b.added} old saves${b.skipped_over_cap ? `. ${b.skipped_over_cap} more are over your ${b.cap} limit` : ""}. They'll arrive in daily batches after new saves, within the available AI allowance.`;
  load();
}
function showImport() {
  const i = importInfo;
  $("bImport").textContent = i ? (i.done >= i.total - i.failed ? "Done" : `${i.done} / ${i.total}`) : "Optional";
  $("bImport").className = "badge " + (i && i.done >= i.total - i.failed ? "done" : "opt");
  const left = i ? i.total - i.done - i.failed : 0;
  // Out of today's Groq tokens: say whose, when reading resumes, and how to go faster.
  const own = setupState?.has_groq_key, at = i?.resumes_at && left > 0 ? new Date(i.resumes_at) : null;
  const hrs = at ? Math.max(1, Math.round((at - Date.now()) / 3600e3)) : 0;
  const paused = at && `${own ? "Your Groq key's free daily limit is used up" : "Skwirl's free daily allowance is used up"}. Reading resumes at ${at.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} (in about ${hrs} hour${hrs > 1 ? "s" : ""}).`;
  const faster = own ? "A paid Groq key can raise your allowance. Skwirl Plus is coming soon; Notify me joins its waitlist." : "Your own Groq key provides a separate allowance. Skwirl Plus is coming soon; Notify me joins its waitlist.";
  // Not paused: still say why it's slow, so a trickle reads as a limit with a fix, not as broken.
  const why = own ? "Old saves arrive in daily batches within your Groq key's allowance." : "The shared key reads up to 5 old saves a day, depending on its remaining allowance.";
  if (i && !$("impMsg").textContent.startsWith("Added")) $("impMsg").textContent = `${i.done} of ${i.total} old saves read so far${i.failed ? `, ${i.failed} couldn't be read (private or deleted)` : ""}.${left > 0 ? ` ${paused || why} ${faster} New saves always go first.` : ""}`;
  // Big import in progress: say so on the library, with the one button that speeds it up.
  if (i && left > 0 && $("fb").hidden) {
    if (!bannerKey || bannerKey === "import")
      setBanner("import", "info", `${i.done} of ${i.total} old saves read. ${paused || why}`, own ? "Go faster" : "Add a key",
        // Both lead to the Groq section, where Skwirl Plus is the first option (Groq's paid tier sits under it).
        () => { tr("click", own ? "groq_upgrade" : "groq_add"); openSetup(false); $("gGroq").open = true; $("gGroq").scrollIntoView({ behavior: "smooth" }); });
  } else clearBanner("import");
}
$("impFile").addEventListener("change", (e) => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ""; });

// ---- Telegram: a one-time link opens the bot with a /start code that ties the chat to this account.
$("tgConnect").addEventListener("click", async () => {
  const w = window.open("", "_blank");  // open now, inside the tap, so Safari doesn't block it
  const r = await api("/v1/telegram/link", { method: "POST" }).catch(() => null);
  const b = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { if (w) w.close(); $("tgMsg").textContent = b.error || "Couldn't make a link. Try again."; return; }
  if (w) w.location.href = b.url; else location.href = b.url;
  $("tgMsg").textContent = "Tap Start in Telegram. Then send the bot any reel link.";
});
$("tgOff").addEventListener("click", async () => {
  const r = await api("/v1/telegram", { method: "DELETE" }).catch(() => null);
  toast(r && r.ok ? "Telegram disconnected." : "Couldn't disconnect. Try again.");
  refreshSetup();
});

// ---- Feedback: one gentle card for people who've used it a bit. Email only with a ticked box.
// Opened from a personal notification (/?reply=<question>): the feedback form becomes a reply to Parth.
const replyTo = new URLSearchParams(location.search).get("reply");
if (replyTo) history.replaceState(null, "", location.pathname);
function showFeedback() {
  if (replyTo && !showFeedback.replied) {
    $("fb").hidden = false;
    if (!showFeedback.seen) { showFeedback.seen = true; tr("card_shown", "reply"); $("fbMsg").focus(); $("fb").scrollIntoView({ block: "center" }); }
    $("fbHead").textContent = "Reply to Parth";
    $("fbBody").textContent = replyTo;
    $("fbMsg").placeholder = "Type your answer…";
    return;
  }
  showPushCard(); showSourceCard();
  let dismissed = false; try { dismissed = localStorage.getItem("skwirl_fb") === "1"; } catch {}
  $("fb").hidden = dismissed || !setupState || setupState.owner || setupState.has_email || (notes || []).length < 3 || !$("pushCard").hidden || !$("srcCard").hidden || !promptSlot("fb");
  if ($("fb").hidden) return;
  if (!showFeedback.seen) { showFeedback.seen = true; tr("card_shown", "welcome"); }
  const i = importInfo, left = i ? i.total - i.done - i.failed : 0;
  $("fbHead").textContent = `Hi${setupState.name ? " " + setupState.name : ""}, I'm Parth. I made Skwirl.`;
  $("fbBody").textContent = "Thanks for trying it. "
    + (left > 0 ? `Your ${i.total} old saves are coming in daily batches within the available allowance. Anything new you save jumps the queue. ` : "")
    + "If something feels broken, confusing or missing, tell me here. I read every message.";
}
const fbDone = () => { showFeedback.replied = true; try { localStorage.setItem("skwirl_fb", "1"); } catch {} $("fb").hidden = true; showImport(); };
$("fbNo").addEventListener("click", () => { tr("feedback_dismissed", replyTo ? "reply" : null); showFeedback.replied = true; fbDone(); });
$("fb").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api("/v1/feedback", { method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ message: $("fbMsg").value, email: $("fbEmail").value, consent: $("fbOk").checked }) }).catch(() => null);
  const b = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { $("fbErr").textContent = b.error || "Couldn't send. Try again."; return; }
  tr("feedback_sent", $("fbEmail").value ? "with_email" : "no_email");
  fbDone(); toast("Thanks! Parth reads every one.");
});

// ---- Skwirl Plus (coming soon): local early price, and a "notify me" that records interest.
// No checkout exists yet. Prices live here; change them in one place.
const EU = "AT BE BG HR CY CZ DK EE FI FR DE GR HU IE IT LV LT LU MT NL PL PT RO SK SI ES SE".split(" ");
// [currency symbol, Plus per month, Plus per year]. Base $4.99 / $39 (Nov 2026 pricing); India is set
// for local purchasing power. Keep in step with the checkout when payments go live.
const PRICES = { US: ["$", "4.99", "39"], IN: ["₹", "299", "2,499"], GB: ["£", "3.99", "31"], CA: ["C$", "6.99", "54"],
  AU: ["A$", "7.99", "59"], NZ: ["NZ$", "8.99", "65"], EU: ["€", "4.99", "39"] };
const priceFor = (cc) => PRICES[cc] || (EU.includes(cc) ? PRICES.EU : PRICES.US);
const plusPrice = (cc) => { const [c, m] = priceFor(cc); return c + m; };
let plusCountry = null;
fetch("/join").then((r) => r.json()).then((m) => {
  plusCountry = m.country; const [c, , y] = priceFor(m.country);
  document.querySelectorAll(".plusPrice").forEach((el) => (el.textContent = plusPrice(m.country)));
  document.querySelectorAll(".plusYear").forEach((el) => (el.textContent = c + y));
  document.querySelectorAll(".zeroPrice").forEach((el) => (el.textContent = c + "0"));
}).catch(() => {});
document.querySelectorAll("[data-plus]").forEach((box) => {
  const place = box.dataset.plus;
  box.insertAdjacentHTML("beforeend", `<button class="btn sm plusBtn" type="button" id="plus_${place}" style="margin-top:10px;justify-self:start;align-self:flex-start">Notify me</button>
    <form class="plusform" hidden><input type="email" maxlength="120" placeholder="Your email" aria-label="Your email" autocomplete="email">
    <label><input type="checkbox"> Email me when Plus is ready. Nothing else, never shared.</label>
    <button class="btn sm" type="submit">Notify me</button></form><p class="msg" role="status"></p>`);
  const btn = box.querySelector(".plusBtn"), form = box.querySelector("form"), msg = box.querySelector(".msg");
  const send = async (email, consent) => {
    const price = plusPrice(plusCountry);
    const r = await fetch("/waitlist", { method: "POST", headers: { "content-type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) },
      body: JSON.stringify({ email, consent, price, place, visitor: store.get("sk_vid") }) }).catch(() => null);
    const b = r ? await r.json().catch(() => ({})) : {};
    if (!r || !r.ok) { msg.textContent = b.error || "Couldn't save that. Try again."; return; }
    tr("plus_waitlist", `${place} ${price}`);
    btn.hidden = form.hidden = true; msg.className = "msg ok";
    msg.textContent = "You're on the list. You'll hear first, at this early price.";
  };
  btn.addEventListener("click", () => {
    tr("plus_interest", place);
    // Signed in with an email already on file: one tap is enough.
    if (token && setupState && !setupState.owner && setupState.has_email) return send("", false);
    btn.hidden = true; form.hidden = false; form.querySelector("input[type=email]").focus();
  });
  form.addEventListener("submit", (e) => { e.preventDefault(); send(form.querySelector("input[type=email]").value, form.querySelector("input[type=checkbox]").checked); });
});

// ---- Notifications (Web Push). iPhone only allows them in the home-screen app, and the prompt
// must come from a tap, so this is a card with a button. Server side: src/push.ts.
const pushReady = () => "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
function showPushCard() {
  let no = false; try { no = localStorage.getItem("skwirl_push_no") === "1"; } catch {}
  const show = pushReady() && setupState && setupState.push_key && Notification.permission === "default" && !no
    && ((notes || []).length > 0 || (importInfo && importInfo.done < importInfo.total));
  const on = show && promptSlot("push");
  if (on && $("pushCard").hidden) tr("card_shown", "push");
  $("pushCard").hidden = !on;
}
const b64uBytes = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4)), (c) => c.charCodeAt(0));
async function enablePush(msg, after) {
  try {
    const perm = await Notification.requestPermission();
    tr("push_permission", perm);
    if (perm !== "granted") { msg.textContent = "No problem. You can turn them on later in your phone's settings."; return false; }
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64uBytes(setupState.push_key) });
    const r = await api("/v1/push", { method: "POST", body: JSON.stringify(sub.toJSON()) });
    if (!r.ok) throw new Error("save");
    toast("Notifications on. You should get a test one now."); if (after) after();
    return true;
  } catch (e) { tr("push_error", String(e && e.message || e).slice(0, 60)); msg.textContent = "Couldn't turn them on. Try again in a minute."; return false; }
}
$("pushOn").addEventListener("click", async () => { if (!(await enablePush($("pushMsg")))) $("pushOn").hidden = true; else $("pushCard").hidden = true; });
$("pushNo").addEventListener("click", () => { try { localStorage.setItem("skwirl_push_no", "1"); } catch {} tr("push_dismissed"); $("pushCard").hidden = true; showFeedback(); });

// One prompt card per visit (a fresh app open), so nobody gets a stack of asks at once.
function promptSlot(name) {
  try { const cur = sessionStorage.getItem("sk_prompt"); if (cur && cur !== name) return false; sessionStorage.setItem("sk_prompt", name); } catch {}
  return true;
}
// ---- "How did you find Skwirl?": asked once, one tap.
function showSourceCard() {
  let done = false; try { done = localStorage.getItem("skwirl_src") === "1"; } catch {}
  const on = !!setupState && !setupState.asked_source && !done && (notes || []).length > 0 && $("pushCard").hidden && promptSlot("src");
  if (on && $("srcCard").hidden) tr("card_shown", "source");
  $("srcCard").hidden = !on;
}
async function sendSource(source, other) {
  try { localStorage.setItem("skwirl_src", "1"); } catch {}
  $("srcCard").hidden = true; tr("found_via", source);
  await api("/v1/source", { method: "POST", body: JSON.stringify({ source, other }) }).catch(() => null);
  if (source !== "skip") toast("Thanks, that really helps.");
}
$("srcChips").addEventListener("click", (e) => {
  const s = e.target.dataset && e.target.dataset.s; if (!s) return;
  if (s === "other") { $("srcChips").hidden = true; $("srcOther").hidden = false; $("srcOtherText").focus(); return; }
  sendSource(s);
});
$("srcOther").addEventListener("submit", (e) => { e.preventDefault(); sendSource("other", $("srcOtherText").value.trim()); });

// ---- Profile: name, email, notifications, contact, account. The round button in the top bar.
const initial = (n) => ((n || "").trim()[0] || "·").toUpperCase();
async function refreshAvatar() { if (setupState) $("meBtn").textContent = initial(setupState.name); }
async function openMe() {
  show("me"); scrollTo(0, 0);
  const r = await api("/v1/me").catch(() => null); if (!r || !r.ok) return;
  const me = await r.json();
  $("meAvatar").textContent = initial(me.name); $("meName").textContent = me.name;
  $("meSub").textContent = me.owner ? "Admin" : me.joined ? `Joined ${new Date(me.joined).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" })}` : "";
  const stat = (n, label) => `<div class="stat"><b>${esc(n)}</b><span>${esc(label)}</span></div>`;
  $("meStats").innerHTML = stat(me.saves, "saved") + stat(me.notes, "notes ready") + stat(me.used, "put to use");
  $("gProfile").hidden = me.owner;
  $("meNameIn").value = me.name; $("meEmailIn").value = me.email || ""; $("meEmailIn").dataset.was = me.email || "";
  $("meConsentRow").hidden = true; $("meMsg").textContent = "";
  // Notifications on this device
  const can = pushReady() && setupState && setupState.push_key;
  const perm = can ? Notification.permission : "unsupported";
  $("meNotifyText").textContent = perm === "granted" ? "On for this device. At most one a day, only when new notes are waiting."
    : perm === "denied" ? "Blocked on this device. Turn them on in your phone's or browser's settings for Skwirl."
    : perm === "default" ? "Get a heads-up when new notes are ready. At most one a day."
    : /iPhone|iPad/.test(navigator.userAgent) ? "On iPhone, add Skwirl to your Home Screen first (Share → Add to Home Screen), then open it from there."
    : "This browser can't show notifications.";
  $("meNotifySmall").textContent = perm === "granted" ? "On for this device" : "A heads-up when new notes are ready";
  $("mePushOn").hidden = perm !== "default"; $("mePushMsg").textContent = "";
  renderHub(me, perm);
  $("contactNote").textContent = me.email ? `We'll reply to ${me.email}.` : "Add your email under Profile if you'd like a reply.";
  $("contactNote").className = "msg";
}
$("meBtn").addEventListener("click", openMe);
$("meBack").addEventListener("click", () => { backTo("lib"); });
$("meEmailIn").addEventListener("input", () => { const e = $("meEmailIn"); $("meConsentRow").hidden = !e.value.trim() || e.value.trim() === e.dataset.was; });
$("meForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api("/v1/me", { method: "PUT", body: JSON.stringify({ name: $("meNameIn").value, email: $("meEmailIn").value, consent: $("meConsent").checked }) }).catch(() => null);
  const b = r ? await r.json().catch(() => ({})) : {};
  if (!r || !r.ok) { $("meMsg").className = "msg err"; $("meMsg").textContent = b.error || "Couldn't save. Try again."; return; }
  tr("profile_saved"); $("meMsg").className = "msg ok"; $("meMsg").textContent = "Saved.";
  await refreshSetup(); openMe();
});
$("mePushOn").addEventListener("click", () => enablePush($("mePushMsg"), openMe));
$("contactForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const r = await api("/v1/feedback", { method: "POST", body: JSON.stringify({ message: $("contactMsg").value }) }).catch(() => null);
  if (!r || !r.ok) { $("contactNote").className = "msg err"; $("contactNote").textContent = "Couldn't send. Try again."; return; }
  tr("contact_sent"); $("contactMsg").value = ""; $("contactNote").className = "msg ok"; $("contactNote").textContent = "Sent. Thank you!";
});

// "Your setup": every optional thing with its state and one button, so nothing depends on
// having said yes the first time it was offered.
function renderHub(me, perm) {
  const st = setupState || {}, i = importInfo;
  const go = (group) => `data-hub="${group}"`;
  const rows = [
    ["Save from your phone", "Share a reel straight to Skwirl", (st.saved_from || {}).shortcut || (st.saved_from || {}).pwa ? "On" : null, `<button class="btn sm soft" ${go("gSave")}>Set up</button>`],
    ["Notifications", "A heads-up when new notes are ready", perm === "granted" ? "On" : null,
      perm === "default" ? `<button class="btn sm soft" data-hub="push">Turn on</button>` : `<small>${perm === "denied" ? "Blocked in settings" : "Home-screen app only"}</small>`],
    ["ChatGPT or Claude", "Let your AI search your saves", st.claude_connected ? "Connected" : null, `<button class="btn sm soft" ${go("gClaude")}>Connect</button>`],
    ["Old Instagram saves", i ? `${i.done} of ${i.total} read${i.failed ? `, ${i.failed} couldn't be` : ""}` : "Bring in your whole Saved folder", i && i.done + i.failed >= i.total ? "Done" : null, `<button class="btn sm soft" ${go("gImport")}>${i ? "Details" : "Import"}</button>`],
    ["Your categories", "Sort every save your way", myCats.length ? `${myCats.length} set` : null, `<button class="btn sm soft" ${go("gCats")}>${myCats.length ? "Edit" : "Set up"}</button>`],
    ["Your own Groq key", "Uses your own AI allowance", st.has_groq_key ? "Added" : null, `<button class="btn sm soft" ${go("gGroq")}>Add</button>`],
    ...(st.telegram ? [["Telegram", "Save by sending links to a bot", st.telegram.connected ? "Connected" : null, `<button class="btn sm soft" ${go("gTelegram")}>Connect</button>`]] : []),
    ["Skwirl Plus", "No keys, saves read first (coming soon)", null, `<button class="btn sm soft" ${go("gGroq")}>Notify me</button>`],
  ];
  $("hub").innerHTML = rows.filter((r) => !(me.owner && r[0] === "Skwirl Plus")).map(([t, sub, done, act]) =>
    `<div class="hubrow"><div class="t"><b>${esc(t)}</b><small>${esc(sub)}</small></div>${done ? `<span class="ok">${esc(done)} ✓</span>` : act}</div>`).join("");
}
$("hub").addEventListener("click", (e) => {
  const b = e.target.closest("[data-hub]"); if (!b) return;
  const g = b.dataset.hub; tr("hub", g);
  if (g === "push") return enablePush($("mePushMsg"), openMe);
  openSetup(false);
  const el = $(g); if (el) { el.hidden = false; el.open = true; setTimeout(() => el.scrollIntoView({ behavior: "smooth", block: "start" }), 50); }
});
