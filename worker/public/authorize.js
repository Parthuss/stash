// OAuth consent for AI apps. The server already checked client_id + redirect_uri before sending us here.
const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
let token = null;
try { token = localStorage.getItem("stash_token"); } catch {}
const tokenFrom = (t) => ((t || "").match(/(stk_[0-9a-f]{20,}|[\w-]{24,})/) || [])[1] || (t || "").trim();
if (!token) $("signin").hidden = false;
fetch("/oauth/client?client_id=" + encodeURIComponent(q.get("client_id") || "")).then((r) => r.json()).then((c) => {
  if (c.name) { $("title").textContent = `Connect ${c.name}`; $("lead").textContent = `${c.name} wants to use your Skwirl.`; }
}).catch(() => {});
async function answer(allow) {
  $("err").textContent = "";
  const t = token || tokenFrom($("link").value);
  if (allow && !t) { $("err").textContent = "Paste your sign-in link first."; return; }
  const body = { allow, client_id: q.get("client_id"), redirect_uri: q.get("redirect_uri"), state: q.get("state"), code_challenge: q.get("code_challenge") };
  let r;
  try { r = await fetch("/oauth/approve", { method: "POST", headers: { "content-type": "application/json", Authorization: "Bearer " + (t || "none") }, body: JSON.stringify(body) }); }
  catch { $("err").textContent = "Can't reach Skwirl. Check your connection and try again."; return; }
  const b = await r.json().catch(() => ({}));
  if (r.status === 401 && !allow) { history.back(); return; }
  if (r.status === 401) { token = null; $("signin").hidden = false; $("err").textContent = "That sign-in link didn't work. Copy the whole link and try again."; return; }
  if (!r.ok) { $("err").textContent = b.error || "Something went wrong."; return; }
  if (allow && !token) { try { localStorage.setItem("stash_token", t); } catch {} }
  location.href = b.redirect;
}
$("yes").addEventListener("click", () => answer(true));
$("no").addEventListener("click", () => answer(false));
