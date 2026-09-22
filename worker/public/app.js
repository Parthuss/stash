const $ = (id) => document.getElementById(id);
const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
                set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
                del: (k) => { try { localStorage.removeItem(k); } catch {} } };
{ const m = location.hash.match(/^#t=([\w-]+)/); if (m) { store.set("stash_token", m[1]); history.replaceState(null, "", location.pathname + location.search); } }
const joinCodeFromLink = (location.hash.match(/^#code=([\w-]+)/) || [])[1];
if (joinCodeFromLink) history.replaceState(null, "", location.pathname + location.search);
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
  let r;
  try {
    r = await fetch(path, { ...opts, headers: { ...(opts.headers || {}), Authorization: "Bearer " + token, "content-type": "application/json" } });
  } catch {
    setBanner("net", "warn", "Can't reach Stash. You're offline, or it's having a moment. What you see may be out of date.", "Try again", () => load());
    throw new Error("offline");
  }
  if (r.status === 401) { signOut("You were signed out (your token changed or was reset). Paste it again to get back in."); throw new Error("unauthorized"); }
  if (r.status >= 500) { setBanner("net", "err", "Stash hit a problem on our end. Nothing is lost. Try again in a minute.", "Try again", () => load()); }
  else if (bannerKey === "net") clearBanner("net");
  return r;
}
function toast(msg) { const t = $("toast"); t.textContent = msg; t.hidden = false; clearTimeout(t._h); t._h = setTimeout(() => (t.hidden = true), 2600); }
function show(which) { for (const id of ["auth", "lib", "note", "setup", "admin", "mentions"]) $(id).style.display = id === which ? "block" : "none"; $("fab").style.display = which === "lib" ? "" : "none"; }
function signOut(msg) { store.del("stash_token"); token = null; show("auth"); $("authErr").textContent = typeof msg === "string" ? msg : ""; }

// ---- markdown: escape FIRST, then add structure. Notes contain third-party captions. ----
function md(src) {
  src = src.replace(/^---\n[\s\S]*?\n---\n/, "").replace(/^\s*# .*\n/, "");
  const out = []; let list = false;
  const inline = (t) => esc(t)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(https?:\/\/[^\s<)]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>');
  for (const line of src.split("\n")) {
    const li = line.match(/^\s*[-*] (.*)/);
    if (list && !li) { out.push("</ul>"); list = false; }
    if (li) { if (!list) { out.push("<ul>"); list = true; } out.push("<li>" + inline(li[1]) + "</li>"); }
    else if (/^## /.test(line)) out.push("<h2>" + inline(line.slice(3)) + "</h2>");
    else if (/^> ?/.test(line)) out.push("<blockquote>" + inline(line.replace(/^> ?/, "")) + "</blockquote>");
    else if (line.startsWith("<sub>") || !line.trim()) continue;
    else out.push("<p>" + inline(line) + "</p>");
  }
  if (list) out.push("</ul>");
  return out.join("");
}

const TINTS = { design: "--lavender", tooling: "--mint", business: "--peach", prompting: "--sky", other: "--butter", food: "--peach",
  automation: "--mint", "agent-building": "--lavender", rag: "--sky", research: "--butter", inspiration: "--peach", infrastructure: "--sky" };
const tintOf = (t) => `var(${TINTS[t] || "--lavender"})`;
function card(n, i) {
  const initial = esc((n.title || "?").trim().charAt(0).toUpperCase());
  const unused = n.status === "unused";
  return `<button class="card" data-id="${esc(n.id)}" style="--i:${Math.min(i, 12)}">
    <div class="tint" style="background:${tintOf(n.topic)}"><span class="tag ${unused ? "unused" : ""}">${unused ? "Unused" : "Used ✓"}</span><b aria-hidden="true">${initial}</b></div>
    <div class="cbody"><h2>${esc(n.title)}</h2><small>${esc(n.topic || "")}</small></div></button>`;
}
const hostOf = (u) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return "link"; } };
function capCard(c) {
  if (c.state === "failed") {
    return `<div class="card wait"><div class="tint" style="background:#ffe9e5"><span class="tag err">Couldn't read</span><b aria-hidden="true">!</b></div>
      <div class="cbody"><h2>${esc(hostOf(c.url))}</h2><p class="why">${esc(c.reason)}</p>
      <div class="acts"><button data-retry="${esc(c.id)}">Retry</button><button class="soft" data-del="${esc(c.id)}">Remove</button></div></div></div>`;
  }
  return `<div class="card wait" aria-busy="true"><div class="tint shimmer"><span class="tag">Reading…</span></div>
    <div class="cbody"><h2>${esc(hostOf(c.url))}</h2><small>${esc(ago(c.at))}</small></div></div>`;
}
function skeleton() { return Array.from({ length: 4 }, () => '<div class="skel shimmer" aria-hidden="true"></div>').join(""); }

function render() {
  const unused = notes.filter((n) => n.status === "unused").length;
  $("count").textContent = `${unused} unused`;
  $("sub").textContent = notes.length ? `${notes.length} saved. ${unused ? "Pick one and put it to use." : "You've used everything."}` : "Your saves, all in one place.";
  const topics = [...new Set(notes.map((n) => n.topic).filter(Boolean))].sort();
  $("chips").innerHTML = ["all", "unused", ...topics].map((c) => `<button class="chip" aria-pressed="${c === filter}" data-f="${esc(c)}">${esc(c)}</button>`).join("");
  const shown = notes.filter((n) => filter === "all" || (filter === "unused" ? n.status === "unused" : n.topic === filter));
  const caps = filter === "all" && !$("q").value.trim() ? captures.map(capCard).join("") : "";
  $("list").innerHTML = (caps || shown.length) ? caps + shown.map(card).join("") : `<div class="empty"><b>${$("q").value ? "Nothing matches" : "Your stash is empty"}</b>${$("q").value ? "Try a different word." : "Tap + to save a link, or share a reel to Stash."}</div>`;
}
let captures = [], loaded = false, known = null, pollTimer = null;
async function load() {
  if (!loaded) $("list").innerHTML = skeleton();
  const q = $("q").value.trim();
  const [nr, cr] = await Promise.all([api(q ? "/v1/search?q=" + encodeURIComponent(q) : "/v1/notes?limit=200"), api("/v1/captures")]);
  if (!nr.ok) { toast("Couldn't load your saves. Try again."); return; }
  notes = (await nr.json()).notes; captures = cr.ok ? (await cr.json()).captures : []; loaded = true;
  // A note we hadn't seen before means something just finished processing.
  const ids = new Set(notes.map((n) => n.id));
  if (known && !q) { const fresh = notes.find((n) => !known.has(n.id)); if (fresh) toast("Ready: " + fresh.title); }
  if (!q) known = ids;
  // Slow queue? Say so, and point at the fix.
  const slow = captures.some((c) => c.state === "processing" && Date.now() - Date.parse(c.at) > 15 * 60000);
  if (slow) setBanner("busy", "info", "Saves are taking longer than usual. Yours are queued, not lost.", "Add my own Groq key", () => openSetup(false));
  else clearBanner("busy");
  render(); schedulePoll();
}
function schedulePoll() {
  clearTimeout(pollTimer);
  const waiting = captures.some((c) => c.state === "processing");
  pollTimer = setTimeout(() => document.visibilityState === "visible" && $("lib").style.display !== "none" ? load().catch(() => schedulePoll()) : schedulePoll(), waiting ? 8000 : 30000);
}
async function ingest(url) {
  let r;
  try { r = await api("/v1/ingest", { method: "POST", body: JSON.stringify({ url, source: matchMedia("(display-mode: standalone)").matches ? "pwa" : "web" }) }); }
  catch (e) { if (e.message === "offline") toast("You're offline. That link wasn't saved."); return; }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { toast(body.error || "Couldn't save that link. Try again."); return; }
  toast(body.created ? "Saved. Takes a minute or two." : "You already saved that one.");
  load().catch(() => {});
}
async function open(id) {
  const r = await api("/v1/notes/" + encodeURIComponent(id));
  if (!r.ok) { toast("That note isn't there anymore."); load().catch(() => {}); return; }
  current = await r.json();
  $("nTitle").textContent = current.title;
  $("nHero").style.background = tintOf(current.topic);
  const unused = current.status === "unused";
  $("nMeta").innerHTML = `<span class="tag ${unused ? "unused" : ""}">${unused ? "Unused" : "Used ✓"}</span><span class="tag">${esc(current.topic || "other")}</span>`;
  $("nBody").innerHTML = md(current.markdown);
  const o = $("nOpen"); o.hidden = !current.permalink; if (current.permalink) o.href = current.permalink;
  $("nUsed").hidden = current.status === "used";
  show("note"); scrollTo(0, 0);
}

if (joinCodeFromLink) $("joinCode").value = joinCodeFromLink;
$("joinForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const err = $("joinErr"); err.textContent = "";
  let r;
  try { r = await fetch("/join", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: $("joinName").value, code: $("joinCode").value }) }); }
  catch { err.textContent = "Can't reach Stash. Check your connection and try again."; return; }
  const body = await r.json().catch(() => ({}));
  if (!r.ok) { err.textContent = body.error || "Couldn’t join. Try again."; return; }
  token = body.token; store.set("stash_token", token); start();
});
$("authForm").addEventListener("submit", async (e) => {
  e.preventDefault(); token = $("token").value.trim();
  let r;
  try { r = await fetch("/v1/notes?limit=1", { headers: { Authorization: "Bearer " + token } }); }
  catch { $("authErr").textContent = "Can't reach Stash. Check your connection and try again."; token = null; return; }
  if (r.ok) { store.set("stash_token", token); $("authErr").textContent = ""; start(); }
  else { $("authErr").textContent = r.status === 401 ? "That token didn't work. Check you copied all of it (it starts with stk_)." : "Stash had a problem. Try again in a minute."; token = null; }
});
const sheet = (open) => { document.body.classList.toggle("sheet-open", open); if (open) setTimeout(() => $("link").focus(), 250); };
$("fab").addEventListener("click", () => sheet(true));
$("scrim").addEventListener("click", () => sheet(false));
$("cancel").addEventListener("click", () => sheet(false));
$("saveForm").addEventListener("submit", async (e) => { e.preventDefault(); const u = $("link").value.trim(); if (u) { $("link").value = ""; sheet(false); await ingest(u); } });
$("q").addEventListener("input", () => { clearTimeout(timer); timer = setTimeout(load, 200); });
$("chips").addEventListener("click", (e) => { const f = e.target.dataset.f; if (f) { filter = f; render(); } });
$("list").addEventListener("click", async (e) => {
  const retry = e.target.closest("[data-retry]"), del = e.target.closest("[data-del]");
  if (retry) { const r = await api("/v1/captures/" + retry.dataset.retry + "/retry", { method: "POST" }); toast(r.ok ? "Trying again." : "Couldn't retry that one."); return load(); }
  if (del) { const r = await api("/v1/captures/" + del.dataset.del, { method: "DELETE" }); toast(r.ok ? "Removed." : "Couldn't remove that one."); return load(); }
  const c = e.target.closest(".card[data-id]"); if (c) open(c.dataset.id);
});
$("back").addEventListener("click", () => { show("lib"); load(); });
$("nUsed").addEventListener("click", async () => { await api("/v1/notes/" + current.id + "/used", { method: "POST" }); toast("Marked as used"); $("nUsed").hidden = true; });


// ---------------- setup / onboarding ----------------
let setupState = null;
const mcpUrl = () => `${location.origin}/mcp/${token}`;
async function copy(text, label) {
  try { await navigator.clipboard.writeText(text); } catch {
    const t = document.createElement("textarea"); t.value = text; document.body.appendChild(t); t.select(); try { document.execCommand("copy"); } catch {} t.remove();
  }
  toast(label + " copied");
}
async function refreshSetup() {
  try { setupState = await (await api("/v1/setup")).json(); } catch { return; }
  const st = setupState, phone = ["shortcut", "pwa", "web"].some((k) => (st.saved_from || {})[k]);
  const set = (id, done, todo = "To do") => { const b = $(id); b.textContent = done ? "Done ✓" : todo; b.className = "badge" + (done ? " done" : id === "bGroq" ? " opt" : ""); };
  set("bSave", phone); set("bClaude", st.claude_connected); set("bGroq", st.has_groq_key, "Optional");
  $("setupDot").hidden = phone && st.claude_connected;
  $("cmdCode").textContent = `claude mcp add --transport http stash ${mcpUrl()}`;
  $("adminBtn").hidden = !st.owner;
  if (st.owner) $("groqBody").innerHTML = `<div class="note-box" style="margin:0">You're the owner. Your Mac uses the Groq key in its <code>.env</code>, so there's nothing to set here.</div>`;
  if (st.has_groq_key && !st.owner) $("groqMsg").textContent = "A key is saved and in use. Paste a new one to replace it.", $("groqMsg").className = "msg ok";
}
function openSetup(first) {
  show("setup"); $("setupTitle").textContent = first ? "Welcome to Stash" : "Set up Stash"; scrollTo(0, 0); refreshSetup();
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent); setTab(ios || !/Android/.test(navigator.userAgent) ? "ios" : "and");
}
function setTab(which) {
  $("tabIos").setAttribute("aria-selected", which === "ios"); $("tabAnd").setAttribute("aria-selected", which === "and");
  $("paneIos").hidden = which !== "ios"; $("paneAnd").hidden = which !== "and";
}
$("setupBtn").addEventListener("click", () => openSetup(false));
$("setupBack").addEventListener("click", () => { show("lib"); load(); refreshSetup(); });
$("tabIos").addEventListener("click", () => setTab("ios")); $("tabAnd").addEventListener("click", () => setTab("and"));
document.addEventListener("click", (e) => {
  const b = e.target.closest("[data-copy]"); if (!b) return;
  const what = b.dataset.copy;
  if (what === "token") copy(token, "Token"); else if (what === "mcp") copy(mcpUrl(), "Connector link"); else if (what === "cc") copy($("cmdCode").textContent, "Command");
});
$("groqForm").addEventListener("submit", async (e) => {
  e.preventDefault(); const m = $("groqMsg"); m.className = "msg"; m.textContent = "Checking with Groq…";
  const r = await api("/v1/settings/groq", { method: "PUT", body: JSON.stringify({ key: $("groqKey").value }) });
  const body = await r.json().catch(() => ({}));
  if (r.ok) { $("groqKey").value = ""; m.className = "msg ok"; m.textContent = "Saved. Your saves now use your own key."; refreshSetup(); }
  else { m.className = "msg err"; m.textContent = body.error || "Couldn’t save that key."; }
});
$("exportBtn").addEventListener("click", async () => {
  const r = await api("/v1/export"); const url = URL.createObjectURL(await r.blob());
  const a = document.createElement("a"); a.href = url; a.download = "stash-export.json"; a.click(); URL.revokeObjectURL(url);
});
$("signOutBtn").addEventListener("click", signOut);

async function start() {
  show("lib");
  // Android share sheet lands here as /?url=…&text=… (manifest share_target).
  const p = new URLSearchParams(location.search);
  const shared = p.get("url") || (p.get("text") || "").match(/https?:\/\/\S+/)?.[0];
  let pending = null; try { pending = sessionStorage.getItem("pending_share"); sessionStorage.removeItem("pending_share"); } catch {}
  const toSave = shared || pending;
  if (shared) history.replaceState(null, "", "/");
  if (toSave) await ingest(toSave);
  await load();
  refreshSetup();
  if (!store.get("stash_welcomed") && !toSave) { store.set("stash_welcomed", "1"); openSetup(true); }
  document.addEventListener("visibilitychange", () => document.visibilityState === "visible" && $("lib").style.display !== "none" && load().catch(() => {}));
}
if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js").catch(() => {});
// A share that arrives before sign-in must survive the sign-in screen.
{ const p = new URLSearchParams(location.search), u = p.get("url") || (p.get("text") || "").match(/https?:\/\/\S+/)?.[0];
  if (u && !token) { try { sessionStorage.setItem("pending_share", u); } catch {} history.replaceState(null, "", "/"); } }
token ? start().catch(() => {}) : show("auth");

// ---- account safety: reset token, delete account ----
$("rotateBtn").addEventListener("click", async () => {
  if (!confirm("Reset your token? Your old one, and any Claude connector link or Shortcut using it, stops working.")) return;
  const r = await api("/v1/token/rotate", { method: "POST" }); const body = await r.json().catch(() => ({}));
  if (!r.ok) return toast(body.error || "Couldn't reset it.");
  token = body.token; store.set("stash_token", token); refreshSetup();
  toast("New token saved here. Update your connector and Shortcut.");
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
    return `<div class="ucard"><header><h3>${esc(u.name)}</h3><span class="badge ${chip[1]}">${chip[0]}</span></header>
      <dl><div><dt>Joined</dt><dd>${esc(ago(u.created_at))}</dd></div><div><dt>Last active</dt><dd>${esc(ago(u.last_seen || u.last_save))}</dd></div>
      <div><dt>Saves (7d)</dt><dd>${u.saves_7d}</dd></div><div><dt>Notes</dt><dd>${u.notes}</dd></div>
      <div><dt>Reopened</dt><dd>${pct}</dd></div><div><dt>Used</dt><dd>${u.used}</dd></div>
      <div><dt>Claude</dt><dd>${u.mcp_calls ? "connected" : "no"}</dd></div><div><dt>Own key</dt><dd>${u.own_key ? "yes" : "no"}</dd></div>
      <div><dt>Waiting / failed</dt><dd>${u.waiting} / ${u.failed}</dd></div></dl></div>`;
  }).join("");
}
$("adminBtn").addEventListener("click", openAdmin);
$("adminBack").addEventListener("click", () => { show("lib"); load(); });

// Anything unhandled becomes a plain message, not a silent dead button.
window.addEventListener("unhandledrejection", (e) => {
  const m = e.reason && e.reason.message; if (m === "offline" || m === "unauthorized") return;
  toast("Something went wrong. Try again.");
});

// ---------------- Saved (mentions across every post) ----------------
const MENTION_ICONS = { book: "📖", movie: "🎬", show: "📺", podcast: "🎙️", place: "📍", product: "🛍️", person: "🙂", other: "✦" };
const MENTION_TINTS = { book: "--lavender", movie: "--peach", show: "--sky", podcast: "--butter", place: "--mint", product: "--sky", person: "--lavender", other: "--butter" };
let mentionFilter = "all", allMentions = [];

function renderMentions() {
  const kinds = [...new Set(allMentions.map((m) => m.type))].sort();
  $("mentionChips").innerHTML = ["all", ...kinds].map((k) =>
    `<button class="chip" aria-pressed="${k === mentionFilter}" data-mk="${esc(k)}">${esc(k === "all" ? "all" : k + "s")}</button>`).join("");
  const shown = mentionFilter === "all" ? allMentions : allMentions.filter((m) => m.type === mentionFilter);
  $("mentionList").innerHTML = shown.length
    ? shown.map((m) => `<button class="mcard" data-open="${esc(m.note_id)}">
        <span class="kind" style="background:var(${MENTION_TINTS[m.type] || "--butter"})">${MENTION_ICONS[m.type] || "✦"}</span>
        <span class="info"><h3>${esc(m.name)}</h3><small>${esc(m.type)} · saved in "${esc(m.note_title)}"</small></span></button>`).join("")
    : `<div class="empty"><b>Nothing saved yet</b>Books, movies, and other things people name in a post show up here.</div>`;
}
async function openMentions() {
  show("mentions"); scrollTo(0, 0);
  $("mentionList").innerHTML = skeleton();
  const r = await api("/v1/mentions");
  if (!r.ok) { $("mentionList").innerHTML = `<div class="empty">Couldn't load this. Go back and try again.</div>`; return; }
  allMentions = (await r.json()).mentions; mentionFilter = "all"; renderMentions();
}
$("mentionsBtn").addEventListener("click", openMentions);
$("mentionsBack").addEventListener("click", () => { show("lib"); load(); });
$("mentionChips").addEventListener("click", (e) => { const k = e.target.dataset.mk; if (k) { mentionFilter = k; renderMentions(); } });
$("mentionList").addEventListener("click", (e) => { const c = e.target.closest("[data-open]"); if (c) open(c.dataset.open); });
