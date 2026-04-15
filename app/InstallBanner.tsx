'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [keyboardOpen, setKeyboardOpen] = useState(false)
  const pathname = usePathname()

  const showOnPage = pathname === '/' || (pathname.startsWith('/trip/') && !pathname.includes('/print'))

  useEffect(() => {
    if (!showOnPage) { setShow(false); return }
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const wasDismissed = localStorage.getItem('crew-install-dismissed')
    if (isIOS && !isStandalone && !wasDismissed) {
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
    setDismissed(true)
    setShow(false)
    localStorage.setItem('crew-install-dismissed', '1')
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
