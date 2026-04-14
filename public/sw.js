// Service Worker — Crew Trips
// Intercepte le lancement depuis l'écran d'accueil et redirige vers le bon trip

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()))

self.addEventListener('fetch', event => {
  const url = new URL(event.request.url)
  
  // Ne rien faire pour les assets statiques et API
  if (url.pathname.startsWith('/_next') || 
      url.pathname.startsWith('/api') ||
      url.pathname.includes('.')) {
    return
  }
  
  // Si on ouvre depuis l'écran d'accueil (navigate vers /)
  // et qu'on a un trip sauvegardé, rediriger
  if (event.request.mode === 'navigate' && url.pathname === '/') {
    event.respondWith(
      caches.open('crew-trips-launch').then(cache => {
        return cache.match('launch-url').then(response => {
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
      })
    )
  }
})

// Écouter les messages pour sauvegarder l'URL du trip actif
self.addEventListener('message', event => {
  if (event.data?.type === 'SET_LAUNCH_URL') {
    caches.open('crew-trips-launch').then(cache => {
      cache.put('launch-url', new Response(event.data.url))
    })
  }
})
