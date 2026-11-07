// Minimal service worker: Chrome wants one before it offers "install", and
// installing is what registers Skwirl as an Android share-sheet target.
// Deliberately no caching — notes are live data. It also shows push notifications.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});

self.addEventListener("push", (e) => {
  let m = {}; try { m = e.data ? e.data.json() : {}; } catch {}
  e.waitUntil(self.registration.showNotification(m.title || "Skwirl", {
    body: m.body || "", icon: "/icon-192.png", badge: "/icon-192.png", tag: m.tag, data: { url: m.url || "/" },
  }));
});
self.addEventListener("notificationclick", (e) => {
  e.notification.close();
  const url = new URL((e.notification.data && e.notification.data.url) || "/", self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.location.origin)) { c.focus(); return c.navigate(url).catch(() => {}); }
    return self.clients.openWindow(url);
  }));
});
