const CACHE_NAME = "cryptostego-v4";
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

// Cache-first für die App-Shell, damit die App auch offline startet.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
