const CACHE_NAME = 'le-dressing-v48'
const resolveFromScope = (path) => new URL(path, self.registration.scope).href
const APP_SHELL = [
  '',
  'index.html',
  'manifest.webmanifest',
  'icon.svg',
  'icon-192.png',
  'icon-512.png',
  'apple-touch-icon.png',
  'assets/wardrobe-sprite.png',
].map(resolveFromScope)

async function precacheApplication() {
  const cache = await caches.open(CACHE_NAME)
  await cache.addAll(APP_SHELL)

  const indexUrl = resolveFromScope('index.html')
  const indexResponse = await fetch(indexUrl)
  const html = await indexResponse.text()
  const referencedAssets = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
    .map((match) => new URL(match[1], indexUrl))
    .filter((url) => url.origin === self.location.origin && url.href.startsWith(self.registration.scope))
    .map((url) => url.href)

  await cache.addAll([...new Set(referencedAssets)])
}

self.addEventListener('install', (event) => {
  event.waitUntil(precacheApplication())
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  )
})

self.addEventListener('fetch', (event) => {
  const request = event.request
  const url = new URL(request.url)

  if (request.method !== 'GET' || url.origin !== self.location.origin) return

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(resolveFromScope('index.html'), copy))
          return response
        })
        .catch(() => caches.match(resolveFromScope('index.html'))),
    )
    return
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached
      return fetch(request).then((response) => {
        if (response.ok) {
          const copy = response.clone()
          void caches.open(CACHE_NAME).then((cache) => cache.put(request, copy))
        }
        return response
      })
    }),
  )
})
