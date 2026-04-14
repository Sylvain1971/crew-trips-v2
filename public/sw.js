// Service Worker — Crew Trips
// Stocke les membres par trip pour la PWA standalone iOS

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('message', event => {
  if (event.data?.type === 'SET_MEMBRE') {
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
