// Service Worker — Crew Trips v2
// Version 2026-04-19-a (bump cette ligne quand tu modifies le SW pour forcer la mise à jour)
// Stocke les membres par trip + le dernier trip visité (persisté en cache)

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

const META_CACHE = 'crew-trips-meta'
const MEMBRES_CACHE = 'crew-trips-membres'

// Helpers persistance
async function getLastTrip() {
  const cache = await caches.open(META_CACHE)
  const res = await cache.match('last-trip-code')
  return res ? await res.text() : null
}

async function setLastTrip(code) {
  const cache = await caches.open(META_CACHE)
  await cache.put('last-trip-code', new Response(code))
}

// Intercepter la navigation — rediriger vers le dernier trip UNIQUEMENT au démarrage PWA "cold"
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  if (event.request.mode !== 'navigate') return

  // Si on arrive sur / → rediriger vers le dernier trip, MAIS seulement si c'est
  // un démarrage depuis l'icône PWA (pas une navigation interne depuis /admin, /mes-trips, etc.)
  //
  // Heuristique: referrer vide = démarrage cold (PWA, nouvel onglet, bookmark).
  // Referrer non-vide = l'utilisateur a cliqué un lien depuis une autre page => on ne redirige pas.
  if (url.pathname === '/') {
    const referrer = event.request.referrer || ''
    const isInternalNav = referrer && referrer.startsWith(self.location.origin + '/')
    if (isInternalNav) return // laisse passer normalement vers la home

    event.respondWith(
      getLastTrip().then(code => {
        if (code) return Response.redirect(`/trip/${code}`, 302)
        return fetch(event.request)
      })
    )
    return
  }

  // Mémoriser le code du trip visité
  const tripMatch = url.pathname.match(/^\/trip\/([^/]+)$/)
  if (tripMatch) {
    event.waitUntil(setLastTrip(tripMatch[1]))
  }
})

self.addEventListener('message', event => {
  const { type, code, membre } = event.data || {}

  if (type === 'CLEAR_LAST_TRIP') {
    caches.open(META_CACHE).then(cache => cache.delete('last-trip-code'))
  }

  if (type === 'SET_LAST_TRIP') {
    setLastTrip(code)
  }

  if (type === 'SET_MEMBRE') {
    caches.open(MEMBRES_CACHE).then(cache => {
      cache.put(`membre-${code}`, new Response(JSON.stringify(membre)))
    })
  }

  if (type === 'GET_MEMBRE') {
    caches.open(MEMBRES_CACHE).then(cache => {
      cache.match(`membre-${code}`).then(response => {
        if (response) {
          response.text().then(data => {
            event.source?.postMessage({ type: 'MEMBRE_DATA', code, data })
          })
        } else {
          event.source?.postMessage({ type: 'MEMBRE_DATA', code, data: null })
        }
      })
    })
  }
})
