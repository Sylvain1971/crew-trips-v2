// Service Worker — Crew Trips
// Stocke l'URL du dernier trip ET le membre pour la PWA standalone

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (url.pathname.startsWith('/_next') ||
      url.pathname.startsWith('/api') ||
      url.pathname.includes('.')) return

  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      caches.open('crew-trips-launch').then(cache =>
        cache.match('launch-url').then(response => {
          if (response) {
            return response.text().then(tripUrl => {
              if (tripUrl && tripUrl.startsWith('/trip/')) {
                return Response.redirect(tripUrl, 302)
              }
              return fetch(event.request)
            })
          }
          return fetch(event.request)
        })
      )
    )
  }
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SET_LAUNCH_URL') {
    caches.open('crew-trips-launch').then(cache => {
      cache.put('launch-url', new Response(event.data.url))
    })
  }
  if (event.data?.type === 'SET_MEMBRE') {
    // Stocker le membre par code de trip dans le SW cache
    caches.open('crew-trips-membres').then(cache => {
      cache.put(`membre-${event.data.code}`, new Response(JSON.stringify(event.data.membre)))
    })
  }
  if (event.data?.type === 'GET_MEMBRE') {
    caches.open('crew-trips-membres').then(cache => {
      cache.match(`membre-${event.data.code}`).then(response => {
        if (response) {
          response.text().then(data => {
            event.source?.postMessage({ type: 'MEMBRE_DATA', code: event.data.code, data })
          })
        } else {
          event.source?.postMessage({ type: 'MEMBRE_DATA', code: event.data.code, data: null })
        }
      })
    })
  }
})
