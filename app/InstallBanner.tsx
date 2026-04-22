'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const pathname = usePathname()

  // Afficher le banner UNIQUEMENT sur les pages de trip, pas sur /.
  // Raison: l'install PWA prend l'URL courante comme start_url (depuis qu'on
  // a retire start_url du manifest). Si on autorisait l'install depuis /,
  // la PWA pointerait vers / et l'utilisateur serait bloque (pas d'identite
  // dans le contexte PWA isole). Depuis /trip/[code], la PWA pointera sur
  // son trip et JoinScreen gerera la reconnexion.
  const showOnPage = pathname.startsWith('/trip/') && !pathname.includes('/print')

  useEffect(() => {
    if (!showOnPage) { setShow(false); return }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    // Attendre que l'utilisateur soit authentifie (crew-tel-locked pose).
    // Avant ca, il remplit le JoinScreen (inscription/reconnexion) et le
    // popup serait une distraction visuelle qui bloque la saisie.
    const isAuth = !!localStorage.getItem('crew-tel-locked')
    // Note: pas de persistence du dismiss. Le popup reapparait a chaque
    // nouvelle session Safari pour encourager l'installation de la PWA
    // (meilleure experience utilisateur). Si l'utilisateur a deja installe
    // la PWA, isStandalone=true et on ne montre plus le popup.
    if (isIOS && !isStandalone && isAuth) {
      const t = setTimeout(() => setShow(true), 5000)
      return () => clearTimeout(t)
    }
  }, [pathname, showOnPage])

  function dismiss() {
    // Dismiss seulement pour la session courante (state React).
    // Au prochain chargement de page, le popup reapparaitra apres 5s.
    setDismissed(true)
    setShow(false)
  }

  if (!show || dismissed) return null

  return (
    <>
      {/* Overlay blurré — ferme au tap hors de la card */}
      <div
        onClick={dismiss}
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.45)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 199,
          animation: 'crewInstallFadeIn 0.3s ease-out',
        }}
      />

      {/* Card centrée */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="crew-install-title"
        onClick={(e) => e.stopPropagation()}
        style={{
          position: 'fixed',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 'calc(100% - 32px)',
          maxWidth: 380,
          maxHeight: 'calc(100vh - 32px)',
          overflowY: 'auto',
          background: '#fff',
          borderRadius: 24,
          boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
          zIndex: 200,
          animation: 'crewInstallSlideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        }}
      >
        <style>{`
          @keyframes crewInstallFadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes crewInstallSlideUp {
            from { opacity: 0; transform: translate(-50%, -44%) }
            to { opacity: 1; transform: translate(-50%, -50%) }
          }
        `}</style>

        <div style={{ padding: '28px 24px 20px' }}>
          {/* Header avec logo */}
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img
              src="/apple-touch-icon.png"
              alt=""
              width={64}
              height={64}
              style={{
                borderRadius: 16,
                boxShadow: '0 6px 20px rgba(0, 0, 0, 0.15)',
                marginBottom: 14,
              }}
            />
            <h2
              id="crew-install-title"
              style={{
                margin: 0,
                fontSize: 19,
                fontWeight: 700,
                color: '#111',
                letterSpacing: '-0.01em',
                lineHeight: 1.25,
              }}
            >
              Installer Crew Trips
            </h2>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 13,
                color: 'rgba(0, 0, 0, 0.55)',
                lineHeight: 1.45,
              }}
            >
              Pour une meilleure expérience sur votre appareil
            </p>
          </div>

          {/* Étapes avec vraies icônes iOS */}
          <ol style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 12 }}>
            <Step n={1}>
              Appuyez sur <IoniOSShareIcon />
              <span style={{ fontWeight: 600 }}> Partager</span> en bas de Safari
            </Step>
            <Step n={2}>
              Faites défiler et appuyez sur <IoniOSAddIcon />
              <span style={{ fontWeight: 600 }}> Ajouter à l&apos;écran d&apos;accueil</span>
            </Step>
            <Step n={3}>
              Appuyez sur <span style={{ fontWeight: 600 }}>Ajouter</span> en haut à droite
            </Step>
          </ol>

          {/* Bouton dismiss */}
          <button
            onClick={dismiss}
            style={{
              marginTop: 20,
              width: '100%',
              padding: '12px 20px',
              borderRadius: 12,
              border: '1.5px solid rgba(0, 0, 0, 0.1)',
              background: 'transparent',
              color: 'rgba(0, 0, 0, 0.65)',
              fontWeight: 600,
              fontSize: 14,
              cursor: 'pointer',
              WebkitTapHighlightColor: 'transparent',
            }}
          >
            Plus tard
          </button>
        </div>
      </div>
    </>
  )
}

/* ---------- Sous-composants ---------- */

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
      <div
        style={{
          flex: '0 0 26px',
          width: 26,
          height: 26,
          borderRadius: '50%',
          background: 'var(--forest, #1a3d2e)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 12,
          fontWeight: 700,
          marginTop: 1,
        }}
      >
        {n}
      </div>
      <div
        style={{
          flex: 1,
          fontSize: 13.5,
          color: 'rgba(0, 0, 0, 0.8)',
          lineHeight: 1.5,
          display: 'flex',
          flexWrap: 'wrap',
          alignItems: 'center',
          gap: 2,
        }}
      >
        {children}
      </div>
    </li>
  )
}

/** Icône iOS "Partager" (carré avec flèche vers le haut) */
function IoniOSShareIcon() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, margin: '0 2px', verticalAlign: 'middle' }}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path d="M11 14V3.5M11 3.5L7.5 7M11 3.5L14.5 7" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M5 10v7a2 2 0 002 2h8a2 2 0 002-2v-7" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  )
}

/** Icône iOS "Ajouter" (carré avec + au centre) */
function IoniOSAddIcon() {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: 20, height: 20, margin: '0 2px', verticalAlign: 'middle' }}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="16" height="16" rx="4" stroke="#007AFF" strokeWidth="1.6" />
        <path d="M11 7v8M7 11h8" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  )
}
