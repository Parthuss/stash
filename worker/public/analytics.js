// Owner-only analytics page. Reads /v1/admin/analytics and /v1/admin/journey with the owner's
// sign-in token (the same one the app keeps on this device).
const $ = (id) => document.getElementById(id);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
let token = null; try { token = localStorage.getItem("stash_token"); } catch {}
const api = (p) => fetch(p, { headers: { Authorization: "Bearer " + token } });

const dur = (ms) => { const s = Math.round((ms || 0) / 1000); return s < 60 ? `${s}s` : s < 3600 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${Math.floor(s / 3600)}h ${Math.round((s % 3600) / 60)}m`; };
const when = (t) => t ? new Date(t).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
const pct = (a, b) => (b ? Math.round((100 * a) / b) + "%" : "–");

// Horizontal bars, one hue: magnitude only. Value text stays in ink, not the bar colour.
function bars(title, rows, total) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return `<div class="card"><h3>${esc(title)}</h3><div class="bars">${rows.length ? rows.map((r) => `
    <div class="row" title="${esc(r.k)}: ${r.n}${total ? ` (${pct(r.n, total)})` : ""}"><span class="k">${esc(r.k)}</span>
    <span class="track"><span class="fill" style="width:${(100 * r.n) / max}%"></span></span><span class="n">${r.n}${total ? ` · ${pct(r.n, total)}` : ""}</span></div>`).join("")
    : `<small>Nothing yet</small>`}</div></div>`;
}

// One measure per chart (never two scales on one axis). Native tooltips on each bar.
function daily(title, days, byDay, fmt = (v) => v) {
  const vals = days.map((d) => byDay[d] || 0), max = Math.max(1, ...vals), w = 100 / days.length;
  const total = vals.reduce((a, b) => a + b, 0);
  return `<div class="card"><h3>${esc(title)} <span class="pill">${esc(fmt(total))} total</span></h3>
    <svg class="daily" viewBox="0 0 100 60" preserveAspectRatio="none" role="img" aria-label="${esc(title)} per day">
    ${vals.map((v, i) => `<rect class="b" x="${i * w + w * 0.15}" y="${56 - (52 * v) / max}" width="${w * 0.7}" height="${Math.max((52 * v) / max, v ? 0.8 : 0)}" rx="0.6"><title>${days[i]}: ${esc(fmt(v))}</title></rect>`).join("")}
    </svg><small>${days[0] || ""} → ${days[days.length - 1] || ""} · peak ${esc(fmt(max === 1 && !vals.some(Boolean) ? 0 : Math.max(...vals)))}</small></div>`;
}

const evs = (data, name) => data.events.filter((e) => e.name === name);
const group = (rows, key = (e) => e.detail, val = (e) => e.visitors) => {
  const m = new Map(); for (const e of rows) m.set(key(e), (m.get(key(e)) || 0) + val(e));
  return [...m].map(([k, n]) => ({ k: k || "(none)", n })).sort((a, b) => b.n - a.n);
};

async function load() {
  if (!token) { $("msg").textContent = "Open Skwirl with your owner link on this device first, then come back here."; return; }
  $("msg").textContent = "Loading…";
  const r = await api(`/v1/admin/analytics?days=${$("days").value}`).catch(() => null);
  if (!r || !r.ok) { $("msg").textContent = r && r.status === 404 ? "This page is for the owner. Sign in with your owner link on this device first." : "Couldn't load. Try Refresh."; return; }
  const d = await r.json(); $("msg").textContent = ""; $("out").hidden = false;
  const t = d.totals, joined = d.funnel[3][1];
  const med = d.durations.length ? d.durations[Math.floor(d.durations.length / 2)] : 0;
  const kpi = (v, l) => `<div class="card kpi"><b>${esc(v)}</b><span>${esc(l)}</span></div>`;
  $("kpis").innerHTML = kpi(t.visitors, "visitors") + kpi(t.visits, "visits") + kpi(joined, "joined")
    + kpi(pct(joined, t.visitors), "visitor → joined") + kpi(dur(t.visits ? t.active_ms / t.visits : 0), "avg active time / visit")
    + kpi(dur(med), "median visit") + kpi(pct(t.bounces, t.visits), "bounced (<10s, no action)") + kpi(dur(t.active_ms), "total time on site")
    + kpi(t.users, "signed-in people active");

  // every day in range, so empty days show as gaps
  const days = []; for (let x = new Date(d.since); x <= new Date(); x = new Date(x.getTime() + 864e5)) days.push(x.toISOString().slice(0, 10));
  const by = (rows, f) => Object.fromEntries(rows.map((r) => [r.day, f(r)]));
  $("daily").innerHTML = daily("Visitors", days, by(d.daily, (r) => r.visitors)) + daily("Signups", days, by(d.signups, (r) => r.n))
    + daily("Signed-in people active", days, by(d.daily, (r) => r.active_users)) + daily("New saves (not imports)", days, by(d.saves, (r) => r.n))
    + daily("Time on site", days, by(d.daily, (r) => r.active_ms), dur);

  const f0 = d.funnel[0][1] || 1, j0 = joined || 1;
  $("funnel").innerHTML = d.funnel.map(([k, n], i) => {
    const base = i < 3 ? f0 : j0, prev = i ? d.funnel[i - 1][1] : n;
    return `<div class="row"><span class="k">${esc(k)}</span><span class="track"><span class="fill" style="width:${(100 * n) / base}%"></span></span>
      <span class="n">${n} · ${pct(n, base)}${i && i !== 3 ? ` <small>(${pct(n, prev)} of prev)</small>` : ""}</span></div>`;
  }).join("");

  const dim = (k) => d.dims[k].map((r) => ({ k: r.k, n: r.n }));
  const asked = group(d.users.filter((u) => u.found_via).map((u) => ({ detail: u.found_via.split(":")[0], visitors: 1 })));
  $("sources").innerHTML = bars("How people say they found Skwirl (asked in the app)", asked, d.users.length) + bars("Referrer (site they came from)", dim("referrer"), t.visitors) + bars("utm_source", dim("utm_source"), t.visitors)
    + bars("Country", dim("country"), t.visitors) + bars("First page", dim("landing"), t.visitors);
  $("devices").innerHTML = bars("Device", dim("device"), t.visitors) + bars("OS", dim("os"), t.visitors) + bars("Browser / app", dim("browser"), t.visitors)
    + bars("Language", dim("lang"), t.visitors) + bars("Timezone", dim("tz"), t.visitors);

  const landingViews = evs(d, "view").filter((e) => e.detail === "auth").reduce((a, e) => a + e.visitors, 0);
  // People who reached at least p% of the landing page (each depth is logged once per visit, deepest last).
  const scroll = ["25", "50", "75", "100"].map((p) => ({ k: `${p}% of the page`, n: evs(d, "scroll").filter((e) => e.detail.startsWith("auth:") && +e.detail.split(":")[1] >= +p).reduce((a, e) => Math.max(a, e.visitors), 0) }));
  const buckets = [["< 10s", 1e4], ["10–30s", 3e4], ["30s–2m", 12e4], ["2–5m", 3e5], ["5–15m", 9e5], ["15m+", Infinity]];
  const timeRows = buckets.map(([k, hi], i) => ({ k, n: d.durations.filter((ms) => ms < hi && ms >= (i ? buckets[i - 1][1] : 0)).length }));
  const sections = group(evs(d, "section").filter((e) => e.detail.endsWith(":open")), (e) => e.detail.replace(":open", ""));
  const named = (n, label) => group(evs(d, n)).map((r) => ({ k: label ? `${label}: ${r.k}` : r.k, n: r.n }));
  const actions = ["found_via", "push_permission", "push_dismissed", "push_error", "plus_interest", "plus_waitlist", "join_submit", "join_ok", "join_err", "signin", "login_link", "save", "import", "open_note", "search", "filter", "feedback_sent", "feedback_dismissed", "card_shown", "offline_copy"]
    .flatMap((n) => group(evs(d, n)).map((r) => ({ k: r.k === "(none)" ? n : `${n}: ${r.k}`, n: r.n }))).sort((a, b) => b.n - a.n);
  $("actions").innerHTML = bars("Screens seen (people)", named("view"), t.visitors) + bars("Landing scroll depth (of landing viewers)", scroll, landingViews)
    + bars("Time per visit", timeRows, d.durations.length) + bars("Set up sections opened", sections, t.visitors)
    + bars("Top taps (people)", group(evs(d, "click")).slice(0, 25), t.visitors) + bars("Actions (people)", actions.slice(0, 30), t.visitors)
    + bars("Note topics opened", named("open_note")) + bars("Errors in the browser", named("error"));

  // Skwirl Plus demand: taps on "Notify me" vs people who left their details.
  const taps = evs(d, "plus_interest").reduce((a, e) => a + e.visitors, 0), w = d.waitlist;
  $("plus").innerHTML = `<div class="kpis" style="margin-top:0">${kpi(taps, "tapped Notify me")}${kpi(w.length, "joined the waitlist")}${kpi(pct(w.length, taps), "tap → joined")}${kpi(pct(new Set(w.filter((x) => x.name).map((x) => x.name)).size, d.users.length), "of all users want it")}</div>
    <div class="grid" style="margin-top:12px">${bars("By country", group(w.map((x) => ({ detail: x.country, visitors: 1 }))), w.length)}${bars("Price they saw", group(w.map((x) => ({ detail: x.price, visitors: 1 }))), w.length)}${bars("Where they tapped", group(w.map((x) => ({ detail: x.place, visitors: 1 }))), w.length)}</div>
    ${w.length ? `<div class="card scroll" style="margin-top:12px"><table><thead><tr><th>When</th><th>Who</th><th>Email</th><th>Country</th><th>Price</th><th>Where</th></tr></thead><tbody>${w.map((x) => `<tr><td>${when(x.at)}</td><td>${esc(x.name || "visitor")}</td><td>${esc(x.email || "")}</td><td>${esc(x.country || "")}</td><td>${esc(x.price || "")}</td><td>${esc(x.place || "")}</td></tr>`).join("")}</tbody></table></div>` : ""}`;
  $("people").innerHTML = `<thead><tr><th>Name</th><th>Joined</th><th>From</th><th>Country</th><th>Device</th><th>Visits</th><th>Days</th><th>Time</th><th>Saves</th><th>Imports</th><th>Notes</th><th>Opens</th><th>Searches</th><th>AI</th><th>Telegram</th><th>Own key</th><th>Email</th><th>Found us via</th><th>Last seen</th><th>Last thing they did</th></tr></thead><tbody>`
    + d.users.map((u) => `<tr data-user="${esc(u.id)}"><td><b>${esc(u.name)}</b></td><td>${when(u.created_at)}</td><td>${esc(u.first_referrer || "")}</td><td>${esc(u.country || "")}</td><td>${esc(u.device || "")}</td>
      <td>${u.visits}</td><td>${u.days}</td><td>${dur(u.active_ms)}</td><td>${u.saves}</td><td>${u.imports}</td><td>${u.notes}</td><td>${u.opens}</td><td>${u.searches}</td>
      <td>${u.ai ? "yes" : ""}</td><td>${u.telegram ? "yes" : ""}</td><td>${u.own_key ? "yes" : ""}</td><td>${u.has_email ? "yes" : ""}</td><td>${esc(u.found_via || "")}</td><td>${when(u.last_seen || u.last_action_at)}</td><td>${esc(u.last_event || "")}</td></tr>`).join("") + "</tbody>";
  $("visits").innerHTML = `<thead><tr><th>Started</th><th>Who</th><th>Country</th><th>Device</th><th>Browser / app</th><th>From</th><th>First page</th><th>Active</th><th>Events</th><th>Installed</th></tr></thead><tbody>`
    + d.recent.map((v) => `<tr ${v.user_id ? `data-user="${esc(v.user_id)}"` : `data-visitor="${esc(v.visitor)}"`}><td>${when(v.started_at)}</td><td>${v.name ? `<b>${esc(v.name)}</b>` : `visitor ${esc(v.visitor.slice(0, 6))}`}</td>
      <td>${esc(v.country || "")}</td><td>${esc(v.device || "")} · ${esc(v.os || "")}</td><td>${esc(v.browser || "")}</td><td>${esc(v.referrer || v.utm_source || "direct")}</td><td>${esc(v.landing || "")}</td>
      <td>${dur(v.active_ms)}</td><td>${v.events}</td><td>${v.installed ? "app" : ""}</td></tr>`).join("") + "</tbody>";
}

// The journey: every visit, every event, with the server-side actions (saves, imports, AI calls) slotted in by time.
async function openJourney(q) {
  const j = $("journey"); j.classList.add("open"); j.innerHTML = "Loading…";
  const r = await api("/v1/admin/journey?" + q).catch(() => null);
  if (!r || !r.ok) { j.innerHTML = "Couldn't load."; return; }
  const d = await r.json();
  const say = (e) => {
    const n = e.name, x = e.detail;
    return n === "view" ? `screen: ${x}` : n === "click" ? `tapped ${x}` : n === "section" ? `${x.endsWith(":open") ? "opened" : "closed"} ${x.split(":")[0]}`
      : n === "scroll" ? `scrolled ${x}%` : n === "page" ? `loaded ${x}` : n === "hide" ? "left the tab" : n === "show" ? "came back to the tab"
      : n === "load_ms" ? `page loaded in ${x} ms` : `${n}${x ? ": " + x : ""}`;
  };
  const items = d.visits.map((v) => {
    const start = Date.parse(v.started_at), end = Date.parse(v.last_at) + 60e3;
    const rows = d.events.filter((e) => e.visit_id === v.id).map((e) => ({ at: e.at, txt: say(e), cls: e.name === "error" ? "err" : "" }))
      .concat(d.server.filter((s) => { const t = Date.parse(s.at); return t >= start - 60e3 && t <= end; }).map((s) => ({ at: s.at, txt: `server: ${s.name}`, cls: "srv" })))
      .sort((a, b) => a.at.localeCompare(b.at));
    const rel = (at) => { const s = Math.max(0, Math.round((Date.parse(at) - start) / 1000)); return `+${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`; };
    return `<div class="visit"><header>${when(v.started_at)} <span class="pill">${dur(v.active_ms)} active</span><span class="pill">${esc(v.device)} · ${esc(v.browser)}</span><span class="pill">${esc(v.country || "")}</span>${v.referrer ? `<span class="pill">from ${esc(v.referrer)}</span>` : ""}</header>
      ${rows.map((e) => `<div class="ev ${e.cls}"><span class="t">${rel(e.at)}</span><span>${esc(e.txt)}</span></div>`).join("") || "<small>No events</small>"}</div>`;
  });
  // Server actions from before tracking began (or outside any visit) still tell the story.
  const inVisit = (s) => d.visits.some((v) => { const t = Date.parse(s.at); return t >= Date.parse(v.started_at) - 60e3 && t <= Date.parse(v.last_at) + 60e3; });
  const loose = d.server.filter((s) => !inVisit(s));
  j.innerHTML = `<div class="top"><h2 style="margin:0">${d.user ? esc(d.user.name) : "Visitor " + esc((d.visitors[0] || "").slice(0, 6))}</h2><span class="sp"></span><button type="button" id="jClose">Close</button></div>
    ${d.user ? `<p class="muted">Joined ${when(d.user.created_at)} · ${d.visits.length} visits tracked · ${dur(d.visits.reduce((a, v) => a + v.active_ms, 0))} active</p>` : ""}
    ${items.join("")}
    ${loose.length ? `<h2>Other actions (server log)</h2>${loose.map((s) => `<div class="ev srv"><span class="t">${when(s.at)}</span><span>${esc(s.name)}</span></div>`).join("")}` : ""}`;
  $("jClose").onclick = () => j.classList.remove("open");
}

document.addEventListener("click", (e) => {
  const tr = e.target.closest("tr[data-user], tr[data-visitor]");
  if (tr) openJourney(tr.dataset.user ? "user=" + encodeURIComponent(tr.dataset.user) : "visitor=" + encodeURIComponent(tr.dataset.visitor));
});
document.addEventListener("keydown", (e) => { if (e.key === "Escape") $("journey").classList.remove("open"); });
$("days").addEventListener("change", load);
$("reload").addEventListener("click", load);
load();
