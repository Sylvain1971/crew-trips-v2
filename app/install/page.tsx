'use client'

/**
 * /install — Page universelle d'entrée pour les nouveaux utilisateurs.
 *
 * Pattern Slack/Notion/Linear : un seul lien universel, identique pour tous,
 * réutilisable à vie. On sépare "recruter l'utilisateur" de "l'inviter à un
 * trip spécifique". Les invitations apparaîtront automatiquement dans
 * /mes-trips via matching par prénom+nom (+ tel si fourni).
 *
 * 5 états selon le contexte :
 *  1. PWA + identité existante  → redirect silencieux vers /mes-trips
 *  2. PWA + pas d'identité      → redirect vers /mes-trips (qui a son propre flow)
 *  3. Safari iOS sans PWA       → popup flottant bloquant (auto-sélection)
 *  4. In-app browser            → "Ouvrez dans Safari"
 *  5. Desktop/Android           → redirect vers /mes-trips
 */

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type ViewState =
  | 'checking'      // Détection en cours
  | 'popup-safari'  // Safari iOS sans PWA → popup instructions
  | 'in-app-bloc'   // In-app browser (FB/IG/Messenger/Gmail) → "Ouvrez dans Safari"

export default function InstallPage() {
  const router = useRouter()
  const [state, setState] = useState<ViewState>('checking')

  useEffect(() => {
    // -------- Détection plateforme --------
    try {
      const isPWA =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true
      const ua = navigator.userAgent
      const isIOS = /iPhone|iPad|iPod/i.test(ua)
      const isSafari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS/i.test(ua)
      const isInAppBrowser = /FBAN|FBAV|Instagram|Gmail|WhatsApp|Messenger|Line|Twitter/i.test(ua)

      // État 4 : in-app browser (toujours prioritaire sur les autres)
      if (isInAppBrowser) {
        setState('in-app-bloc')
        return
      }

      // État 1 : PWA installée → redirect direct vers /mes-trips
      //         (qu'il y ait une identité ou non, /mes-trips sait gérer)
      if (isPWA) {
        router.replace('/mes-trips')
        return
      }

      // État 5 : Desktop ou Android → redirect vers /mes-trips
      //         (l'install PWA n'a pas la même contrainte sur ces plateformes)
      if (!isIOS || !isSafari) {
        router.replace('/mes-trips')
        return
      }

      // État 3 : Safari iOS sans PWA → popup bloquant
      setState('popup-safari')
    } catch {
      // Fallback conservateur : en cas d'erreur, on renvoie vers /mes-trips
      router.replace('/mes-trips')
    }
  }, [router])

  // -------- État 1/5 géré via router.replace avant rendu --------
  // Logo Crew Trips avec pulsation — remplace "Chargement…" pour meilleure
  // perception de marque pendant la détection de plateforme (~500ms-1s).
  if (state === 'checking') {
    return (
      <main style={{
        minHeight: '100dvh',
        background: 'var(--forest)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <style>{`
          @keyframes crewLoaderPulse {
            0%, 100% { opacity: 0.7; transform: scale(0.97); }
            50% { opacity: 1; transform: scale(1); }
          }
          @keyframes crewLoaderFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
        <div style={{
          animation: 'crewLoaderFadeIn 0.3s ease-out both, crewLoaderPulse 1.4s ease-in-out 0.3s infinite',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <Image
            src="/logo-hero.webp"
            alt="Crew Trips"
            width={120}
            height={120}
            priority
          />
        </div>
      </main>
    )
  }

  // -------- État 4 : in-app browser → guide pour ouvrir dans Safari --------
  if (state === 'in-app-bloc') {
    return <InAppBrowserScreen />
  }

  // -------- État 3 : Safari iOS → écran marketing + popup bloquant --------
  return <SafariInstallScreen />
}

/* ============================================================
 *  État 3 : Écran Safari iOS avec popup flottant bloquant
 * ============================================================ */
function SafariInstallScreen() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'linear-gradient(180deg, var(--forest) 0%, var(--forest-mid) 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* -------- Arrière-plan marketing (visible ~300ms avant popup) -------- */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          padding: '40px 24px',
          textAlign: 'center',
        }}
      >
        <div style={{ marginBottom: 20 }}>
          <Image
            src="/logo-hero.webp"
            alt="Crew Trips"
            width={140}
            height={140}
            priority
            style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,.3))' }}
          />
        </div>
        <h1
          style={{
            fontFamily: 'var(--font-brand), Georgia, serif',
            fontSize: 38,
            fontWeight: 700,
            color: '#fff',
            letterSpacing: '-.02em',
            margin: '0 0 10px',
          }}
        >
          Crew Trips
        </h1>
        <p
          style={{
            fontSize: 16,
            color: 'rgba(255,255,255,.75)',
            margin: 0,
            maxWidth: 320,
            lineHeight: 1.5,
          }}
        >
          Planifiez vos trips entre amis
        </p>
      </div>

      {/* -------- Overlay blurré (bloque les interactions derrière) -------- */}
      <div
        aria-hidden="true"
        style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0, 0, 0, 0.35)',
          backdropFilter: 'blur(8px)',
          WebkitBackdropFilter: 'blur(8px)',
          zIndex: 200,
          animation: 'crewInstallFadeIn 0.5s ease-out',
        }}
      />

      {/* -------- Card flottante (65vh, ne couvre pas tout) -------- */}
      {/* Popup — layout 3 sections :
          1. Bloc blanc étapes (haut, dense mais aéré — visible au-dessus de
             la Share Sheet iOS à l'étape 3)
          2. Logo Crew Trips (centre, respirant — caché par Share Sheet, OK)
          3. Bloc blanc instruction finale (bas — caché par Share Sheet, OK)
          Le container est transparent, seuls les blocs ont un fond. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="install-title"
        style={{
          position: 'fixed',
          top: 12,
          left: 12,
          right: 12,
          bottom: 12,
          background: 'transparent',
          zIndex: 201,
          overflowY: 'auto',
          overflowX: 'hidden',
          animation: 'crewInstallSlideUp 0.55s cubic-bezier(0.16, 1, 0.3, 1)',
          WebkitOverflowScrolling: 'touch',
          display: 'flex',
          flexDirection: 'column',
          gap: 14,
          alignItems: 'stretch',
          maxWidth: 440,
          marginLeft: 'auto',
          marginRight: 'auto',
        }}
      >
        <style>{`
          @keyframes crewInstallFadeIn { from { opacity: 0 } to { opacity: 1 } }
          @keyframes crewInstallSlideUp {
            from { opacity: 0; transform: translateY(30px) }
            to   { opacity: 1; transform: translateY(0) }
          }
        `}</style>

        {/* ============================================================
            BLOC 1 — Titre + 5 étapes (reste visible pendant Share Sheet)
            ============================================================ */}
        <div
          style={{
            background: '#fff',
            borderRadius: 20,
            padding: '16px 16px 16px',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
          }}
        >
          <h2
            id="install-title"
            style={{
              margin: '0 0 4px',
              fontSize: 16,
              fontWeight: 700,
              color: '#0F2D0F',
              letterSpacing: '-0.01em',
              lineHeight: 1.2,
              textAlign: 'center',
            }}
          >
            Installer Crew Trips
          </h2>
          <div
            style={{
              fontSize: 9.5,
              fontWeight: 600,
              color: 'rgba(0,0,0,.42)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              textAlign: 'center',
              margin: '0 0 14px',
            }}
          >
            Suivez ces 5 étapes dans Safari
          </div>

          <ol
            style={{
              margin: 0,
              padding: 0,
              listStyle: 'none',
              display: 'flex',
              flexDirection: 'column',
              gap: 9,
            }}
          >
            <Step n={1} title="Tapez sur le bouton menu (⋯)" icon={<IoniOSMenuIcon />} />
            <Step n={2} title="Tapez sur Partager" icon={<IoniOSShareIcon />} />
            <Step n={3} title="Faites défiler, tapez En afficher plus" icon={<IoniOSChevronIcon />} />
            <Step n={4} title="Tapez Ajouter à l'écran d'accueil" icon={<IoniOSAddIcon />} />
            <Step n={5} title="Tapez Ajouter (en haut à droite)" />
          </ol>
        </div>

        {/* ============================================================
            LOGO CENTRAL — vit dans un cadre respirant sur le fond flou
            ============================================================ */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            padding: '6px 0',
          }}
        >
          <div
            style={{
              width: 112,
              height: 112,
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 26,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 6,
              boxSizing: 'border-box',
            }}
          >
            <img
              src="/apple-touch-icon.png"
              alt="Crew Trips"
              width={96}
              height={96}
              style={{
                borderRadius: 20,
                display: 'block',
              }}
            />
          </div>
        </div>

        {/* ============================================================
            BLOC 2 — Instruction finale (lue avant Share Sheet)
            ============================================================ */}
        <div
          style={{
            background: '#fff',
            borderRadius: 18,
            padding: '14px 16px 13px',
            boxShadow: '0 6px 18px rgba(0, 0, 0, 0.18)',
            textAlign: 'center',
          }}
        >
          <div
            style={{
              fontSize: 9,
              fontWeight: 600,
              color: 'rgba(0,0,0,.42)',
              textTransform: 'uppercase',
              letterSpacing: '0.12em',
              marginBottom: 5,
            }}
          >
            Une fois installée
          </div>
          <p
            style={{
              fontSize: 12.5,
              color: '#0F2D0F',
              margin: 0,
              lineHeight: 1.45,
              fontWeight: 500,
            }}
          >
            L&apos;icône Crew Trips apparaîtra sur votre écran d&apos;accueil.<br />
            <span style={{ color: 'rgba(15,45,15,0.72)', fontWeight: 400 }}>
              Fermez Safari et ouvrez-la pour commencer.
            </span>
          </p>
        </div>
      </div>
    </main>
  )
}

/* ============================================================
 *  État 4 : In-app browser → "Ouvrez dans Safari"
 * ============================================================ */
function InAppBrowserScreen() {
  return (
    <main
      style={{
        minHeight: '100dvh',
        background: 'var(--forest)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '40px 24px',
        textAlign: 'center',
      }}
    >
      <div style={{ marginBottom: 20 }}>
        <Image src="/logo-hero.webp" alt="Crew Trips" width={100} height={100} />
      </div>
      <h1
        style={{
          fontFamily: 'var(--font-brand), Georgia, serif',
          fontSize: 26,
          fontWeight: 700,
          color: '#fff',
          letterSpacing: '-.02em',
          margin: '0 0 14px',
        }}
      >
        Ouvrez dans Safari
      </h1>
      <p
        style={{
          fontSize: 15,
          color: 'rgba(255,255,255,.8)',
          lineHeight: 1.5,
          maxWidth: 340,
          margin: '0 0 28px',
        }}
      >
        Pour installer Crew Trips, vous devez ouvrir ce lien dans Safari et non
        dans l&apos;application actuelle.
      </p>

      <div
        style={{
          background: 'rgba(255,255,255,.06)',
          border: '1.5px solid rgba(255,255,255,.15)',
          borderRadius: 14,
          padding: '16px 18px',
          maxWidth: 340,
          textAlign: 'left',
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            color: 'rgba(255,255,255,.5)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
            marginBottom: 10,
          }}
        >
          Comment faire
        </div>
        <ol
          style={{
            margin: 0,
            paddingLeft: 20,
            color: 'rgba(255,255,255,.85)',
            fontSize: 14,
            lineHeight: 1.7,
          }}
        >
          <li>Tapez sur le menu <span style={{ opacity: 0.7 }}>(⋯ ou ⋮)</span></li>
          <li>Choisissez <b>Ouvrir dans Safari</b></li>
          <li>Reprenez depuis cette page</li>
        </ol>
      </div>
    </main>
  )
}

/* ============================================================
 *  Sous-composant : une étape numérotée
 * ============================================================ */
function Step({
  n,
  title,
  icon,
  children,
}: {
  n: number
  title: React.ReactNode
  icon?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <li style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      {/* Numéro dans pastille — 20×20, chiffre 11 */}
      <div
        style={{
          flex: '0 0 20px',
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'var(--forest, #0F2D0F)',
          color: '#fff',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: 11,
          fontWeight: 600,
        }}
      >
        {n}
      </div>

      {/* Contenu — tout sur une ligne */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 12.5,
            fontWeight: 500,
            color: '#111',
            lineHeight: 1.35,
          }}
        >
          {icon}
          <span>{title}</span>
        </div>
        {children && (
          <div
            style={{
              marginTop: 2,
              fontSize: 12,
              color: 'rgba(0, 0, 0, 0.55)',
              lineHeight: 1.4,
            }}
          >
            {children}
          </div>
        )}
      </div>
    </li>
  )
}

/* ============================================================
 *  Icônes iOS (SVG inline)
 *  Couleur iOS bleue #007AFF pour cohérence avec le système.
 * ============================================================ */

/** Icône iOS "Menu" (3 points horizontaux dans un cercle) */
function IoniOSMenuIcon() {
  return (
    <span style={iconWrapperStyle}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="9" stroke="#007AFF" strokeWidth="1.6" />
        <circle cx="7" cy="11" r="1.2" fill="#007AFF" />
        <circle cx="11" cy="11" r="1.2" fill="#007AFF" />
        <circle cx="15" cy="11" r="1.2" fill="#007AFF" />
      </svg>
    </span>
  )
}

/** Icône iOS "Partager" (carré avec flèche vers le haut) */
function IoniOSShareIcon() {
  return (
    <span style={iconWrapperStyle}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <path
          d="M11 14V3.5M11 3.5L7.5 7M11 3.5L14.5 7"
          stroke="#007AFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <path
          d="M5 10v7a2 2 0 002 2h8a2 2 0 002-2v-7"
          stroke="#007AFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** Icône iOS "Chevron vers le bas" (dans un cercle gris clair) */
function IoniOSChevronIcon() {
  return (
    <span style={iconWrapperStyle}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <circle cx="11" cy="11" r="9" fill="rgba(120,120,128,.16)" />
        <path
          d="M7.5 9.5L11 13L14.5 9.5"
          stroke="#007AFF"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  )
}

/** Icône iOS "Ajouter" (carré avec + au centre) */
function IoniOSAddIcon() {
  return (
    <span style={iconWrapperStyle}>
      <svg width="20" height="20" viewBox="0 0 22 22" fill="none" aria-hidden="true">
        <rect x="3" y="3" width="16" height="16" rx="4" stroke="#007AFF" strokeWidth="1.6" />
        <path d="M11 7v8M7 11h8" stroke="#007AFF" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    </span>
  )
}

const iconWrapperStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 20,
  height: 20,
  flexShrink: 0,
  verticalAlign: 'middle',
}
