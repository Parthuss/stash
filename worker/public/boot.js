// Runs before first paint. The landing page is visible in the HTML by default (so crawlers that
// don't run JavaScript see it); a signed-in device hides it here so the library loads without a flash.
document.documentElement.dataset.acorn = "2b0e";
try { if (localStorage.getItem("stash_token") || /^#(t|login)=/.test(location.hash)) document.documentElement.classList.add("authed"); } catch {}
