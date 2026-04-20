'use client'
import { useEffect } from 'react'

// Enregistre le Service Worker /sw.js au démarrage.
// Nécessaire pour que iOS Safari installe le site en mode PWA standalone
// (sans barre URL) quand l'utilisateur fait "Sur l'écran d'accueil".
// Sans ça, iOS tombe en bookmark Safari classique.
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (typeof window === 'undefined') return
    if (!('serviceWorker' in navigator)) return

    // On attend le load pour ne pas bloquer le rendu initial
    const onLoad = () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .catch(err => {
          // Silent en prod, log en dev
          if (process.env.NODE_ENV === 'development') {
            console.warn('[SW] registration failed:', err)
          }
        })
    }

    if (document.readyState === 'complete') {
      onLoad()
    } else {
      window.addEventListener('load', onLoad, { once: true })
      return () => window.removeEventListener('load', onLoad)
    }
  }, [])

  return null
}