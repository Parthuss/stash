// Minimal service worker: Chrome wants one before it offers "install", and
// installing is what registers Stash as an Android share-sheet target.
// Deliberately no caching — notes are live data.
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => {});
