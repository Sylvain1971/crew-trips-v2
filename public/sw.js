// Service Worker — Crew Trips
// Stocke les membres par trip pour la PWA standalone iOS

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

// Sauvegarder le dernier trip visité
let lastTripCode = null

// Intercepter la navigation — rediriger vers le dernier trip au démarrage PWA
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  // Seulement les navigations (pas les assets)
  if (event.request.mode !== 'navigate') return
  // Si on arrive sur / en mode standalone et qu'on a un trip sauvegardé
  if (url.pathname === '/' && lastTripCode) {
    event.respondWith(Response.redirect(`/trip/${lastTripCode}`, 302))
    return
  }
  // Mémoriser le code du trip visité
  const tripMatch = url.pathname.match(/^\/trip\/([^/]+)$/)
  if (tripMatch) lastTripCode = tripMatch[1]
})

self.addEventListener('message', event => {
  if (event.data?.type === 'SET_LAST_TRIP') {
    lastTripCode = event.data.code
  }
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
