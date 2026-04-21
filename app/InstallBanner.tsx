'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
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

  useEffect(() => {
    function onFocus() {
      const tag = document.activeElement?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') setKeyboardOpen(true)
    }
    function onBlur() {
      setTimeout(() => setKeyboardOpen(false), 300)
    }
    document.addEventListener('focusin', onFocus)
    document.addEventListener('focusout', onBlur)
    return () => {
      document.removeEventListener('focusin', onFocus)
      document.removeEventListener('focusout', onBlur)
    }
  }, [])

  function dismiss() {
    // Dismiss seulement pour la session courante (state React).
    // Au prochain chargement de page, le popup reapparaitra apres 5s.
    // Objectif: encourager l'installation PWA a chaque connexion.
    setDismissed(true)
    setShow(false)
  }

  if (!show || dismissed) return null

  const bottomPos = keyboardOpen ? -300 : 0

  return (
    <div style={{
      position: 'fixed', bottom: bottomPos, left: 12, right: 12, zIndex: 200,
      background: '#fff', borderRadius: 12, padding: '10px 12px',
      boxShadow: '0 4px 24px rgba(0,0,0,.18)', border: '1px solid rgba(0,0,0,.08)',
      display: 'flex', alignItems: 'flex-start', gap: 10,
      transition: 'bottom .3s ease',
      animation: 'slideUp .3s ease'
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(16px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
      <img src="/apple-touch-icon.png" alt="" width={36} height={36}
        style={{borderRadius:8,flexShrink:0,marginTop:2}} />
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontWeight:700,fontSize:13,color:'#111',marginBottom:3}}>Installer Crew Trips</div>
        <div style={{fontSize:11,color:'#666',lineHeight:1.7}}>
          <span>1. Appuyez sur <strong>Partager</strong> ⬆ en bas</span><br/>
          <span>2. Faites défiler → <strong>Ajouter à l'écran d'accueil</strong></span><br/>
          <span>3. Appuyez sur <strong>Ajouter</strong> en haut à droite</span>
        </div>
      </div>
      <button onClick={dismiss}
        style={{background:'none',border:'none',fontSize:26,color:'#e53e3e',cursor:'pointer',
          padding:'0 2px',lineHeight:1,flexShrink:0,fontWeight:700}}>
        ×
      </button>
    </div>
  )
}
