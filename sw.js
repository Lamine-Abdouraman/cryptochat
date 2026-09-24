const CACHE_NAME = "cryptostego-v5";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./app.js",
  "./crypto-stego.js",
  "./account.js",
  "./inbox.js",
  "./firebase-config.js",
  "./manifest.json",
  "./privacy.html",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/icon-maskable-512.png",
];
// Die Firebase-SDK-Skripte (CDN) werden bewusst NICHT vorab gecacht, damit ein
// Fehler beim Erstinstall des Service Workers (z.B. offline) die Kern-App
// (Verschlüsseln/Verstecken, komplett offline-fähig) nicht blockiert.

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

// Network-first: bei bestehender Verbindung immer die aktuellste Version laden
// (verhindert, dass alte Versionen der App dauerhaft aus dem Cache hängen
// bleiben), mit Cache-Fallback für Offline-Nutzung.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const clone = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
