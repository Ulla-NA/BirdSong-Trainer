// Minimaler Service Worker: cached nur die App-Shell (HTML/CSS/JS),
// damit die App installierbar ist und beim erneuten Öffnen schneller lädt.
// Audiodateien von xeno-canto werden bewusst NICHT gecacht (Cross-Origin,
// Lizenzbedingungen, Speicherbedarf).

const CACHE_NAME = "vogelstimmen-shell-v1";
const SHELL_FILES = [
  "./index.html",
  "./styles.css",
  "./app.js",
  "./species-data.js",
  "./manifest.json",
  "./icon.svg",
];

self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(SHELL_FILES))
  );
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener("fetch", event => {
  const url = new URL(event.request.url);
  // Nur eigene App-Shell-Dateien aus dem Cache bedienen, alles andere (xeno-canto API/Audio) normal durchreichen.
  if (url.origin === self.location.origin) {
    event.respondWith(
      caches.match(event.request).then(cached => cached || fetch(event.request))
    );
  }
});
