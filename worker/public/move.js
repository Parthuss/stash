// Skwirl moved to skwirl.app (Nov 2026). On the old address, send first-time visitors there, keeping
// the path, query (a shared ?url=) and hash (a #t= or #login= sign-in link). A device already signed
// in here, or the installed home-screen app, stays put: its sign-in, icon and notifications belong
// to this address, and moving would silently sign the person out.
(function () {
  if (["skwirl.parthakholkar.com", "stash.parthakholkar.com"].indexOf(location.hostname) < 0) return;
  var signedIn = false; try { signedIn = !!localStorage.getItem("stash_token"); } catch (e) {}
  var installed = matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  if (!signedIn && !installed) location.replace("https://skwirl.app" + location.pathname + location.search + location.hash);
})();
