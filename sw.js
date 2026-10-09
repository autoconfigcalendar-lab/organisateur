// Rend l'appli disponible hors connexion : les fichiers de l'appli sont gardés en cache,
// toujours mis à jour depuis le réseau quand il est là. Les appels à Google ne passent pas par ici.
const CACHE = "organisateur-v3";
const FICHIERS = ["./", "index.html", "style.css", "config.js", "moteur.js", "google.js", "ui.js", "manifest.webmanifest", "icone.png"];

self.addEventListener("install", e => {
  // « reload » : on prend les fichiers sur le serveur, pas une copie gardée par le navigateur.
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(FICHIERS.map(f => new Request(f, { cache: "reload" })))));
  self.skipWaiting();
});
self.addEventListener("activate", e => {
  e.waitUntil(caches.keys().then(cles => Promise.all(cles.filter(c => c !== CACHE).map(c => caches.delete(c)))));
  self.clients.claim();
});
self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== location.origin) return;
  e.respondWith(
    // « no-cache » : le navigateur revérifie auprès du serveur, une mise à jour est donc prise aussitôt.
    fetch(e.request.url, { cache: "no-cache" })
      .then(r => { const copie = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copie)); return r; })
      .catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match("index.html")))
  );
});
