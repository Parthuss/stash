// Skwirl's own analytics, no third party (see src/analytics.ts). Screens, taps, time on site and
// where people stop. Never what anyone types, searches for, or saves.
(() => {
  const ls = {
    get: (k) => { try { return localStorage.getItem(k); } catch { return null; } },
    set: (k, v) => { try { localStorage.setItem(k, v); } catch {} },
  };
  const rid = () => [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, "0")).join("");
  let vid = ls.get("sk_vid");
  if (!vid) { vid = rid(); ls.set("sk_vid", vid); }
  // One visit = one sitting; a new one starts after 30 minutes away.
  let s = null; try { s = JSON.parse(ls.get("sk_visit") || "null"); } catch {}
  const fresh = !s || s.v !== vid || Date.now() - s.last > 30 * 60e3;
  if (fresh) s = { id: rid(), v: vid, last: Date.now(), t: 0 };
  let queue = [], ctxSent = !fresh, lastInput = Date.now(), dirty = true;

  let depth = 0, where = location.pathname;
  window.track = (name, detail) => {
    if (name === "view") { where = detail; depth = 0; }  // scroll depth is per screen
    queue.push([Date.now(), name, detail == null ? null : String(detail).slice(0, 120)]);
    dirty = true;
    if (queue.length >= 20) flush();
  };
  function ctx() {
    const u = new URL(location.href), p = u.searchParams;
    let ref = null; try { const r = new URL(document.referrer); if (r.host !== location.host) ref = r.host; } catch {}
    return {
      ref, us: p.get("utm_source"), um: p.get("utm_medium"), uc: p.get("utm_campaign"), path: u.pathname,
      scr: `${screen.width}x${screen.height}`, lang: navigator.language, tz: Intl.DateTimeFormat().resolvedOptions().timeZone,
      inst: matchMedia("(display-mode: standalone)").matches || navigator.standalone === true,
    };
  }
  function flush() {
    if (!dirty) return;
    dirty = false;
    const body = { v: vid, s: s.id, t: s.t, e: queue.splice(0) };
    if (!ctxSent) { body.c = ctx(); ctxSent = true; }
    s.last = Date.now(); ls.set("sk_visit", JSON.stringify(s));
    const tok = ls.get("stash_token");
    fetch("/e", {
      method: "POST", keepalive: true, body: JSON.stringify(body),
      headers: { "content-type": "application/json", ...(tok ? { Authorization: "Bearer " + tok } : {}) },
    }).catch(() => {});
  }

  // Active time: counts while the page is on screen and was touched in the last minute.
  for (const t of ["pointerdown", "keydown", "scroll", "touchstart", "mousemove"]) addEventListener(t, () => { lastInput = Date.now(); }, { passive: true, capture: true });
  setInterval(() => { if (document.visibilityState === "visible" && Date.now() - lastInput < 60e3) { s.t += 5000; dirty = true; } }, 5000);
  setInterval(flush, 15000);
  addEventListener("visibilitychange", () => { track(document.visibilityState === "hidden" ? "hide" : "show"); if (document.visibilityState === "hidden") flush(); });
  addEventListener("pagehide", flush);

  // Taps: the control's id (UI only). Library cards hold people's own saves, so only "note_card" is kept.
  addEventListener("click", (e) => {
    const el = e.target.closest && e.target.closest("button, a, summary, label, [role=button], .card, input[type=checkbox]");
    if (!el) return;
    if (el.closest("#list")) return track("click", "note_card");
    if (el.closest("#mentionList")) return track("click", "list_item");
    const id = el.tagName === "SUMMARY" ? el.closest("details")?.id : el.id || el.closest("[id]")?.id;
    const out = el.tagName === "A" && el.host && el.host !== location.host ? ">" + el.host : "";
    track("click", (id || el.tagName.toLowerCase()) + out);
  }, { capture: true });
  addEventListener("toggle", (e) => { if (e.target.id) track("section", e.target.id + (e.target.open ? ":open" : ":close")); }, true);

  // How far down the page people get.
  addEventListener("scroll", () => {
    const d = Math.min(100, Math.floor((100 * (scrollY + innerHeight)) / document.documentElement.scrollHeight / 25) * 25);
    if (d > depth) { depth = d; track("scroll", `${where}:${d}`); }
  }, { passive: true });
  addEventListener("error", (e) => { if (e.message) track("error", e.message); });
  addEventListener("unhandledrejection", (e) => track("error", String((e.reason && e.reason.message) || e.reason)));
  track("page", location.pathname);
  addEventListener("load", () => {
    const n = performance.getEntriesByType("navigation")[0];
    if (n) track("load_ms", Math.round(n.loadEventStart || n.duration));
  });
  flush();
})();
