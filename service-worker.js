// Minimaler Service Worker: cached nur die App-Shell (HTML/CSS/JS),
// damit die App installierbar ist und beim erneuten Öffnen schneller lädt.
// Audiodateien von xeno-canto werden bewusst NICHT gecacht (Cross-Origin,
// Lizenzbedingungen, Speicherbedarf).

const CACHE_NAME = "vogelstimmen-shell-v2";
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
  // Nur eigene App-Shell-Dateien betreffen, alles andere (xeno-canto API/Audio) normal durchreichen.
  // Network-first: immer zuerst versuchen, die aktuelle Version aus dem Netz zu holen (und den Cache
  // dabei zu aktualisieren) – nur wenn das fehlschlägt (offline), auf den Cache zurückfallen. So bleibt
  // die Offline-Fähigkeit erhalten, aber Nutzer:innen sehen nach einem Deploy sofort die neue Version,
  // statt auf eine geänderte service-worker.js warten zu müssen (die sich bei reinen Inhaltsänderungen
  // an app.js/species-data.js/index.html ja gar nicht ändert und ein Update sonst nie auslösen würde).
  if (url.origin === self.location.origin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(cache => cache.put(event.request, copy));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  }
});
