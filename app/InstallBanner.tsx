'use client'
import { useState, useEffect } from 'react'
import { usePathname } from 'next/navigation'

export default function InstallBanner() {
  const [show, setShow] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
    const wasDismissed = localStorage.getItem('crew-install-dismissed')
    if (isIOS && !isStandalone && !wasDismissed) {
      // Délai plus long sur les pages trip pour laisser le temps de se connecter
      const delay = pathname.startsWith('/trip/') ? 8000 : 3000
      const t = setTimeout(() => setShow(true), delay)
      return () => clearTimeout(t)
    }
  }, [pathname])

  function dismiss() {
    setDismissed(true)
    setShow(false)
    localStorage.setItem('crew-install-dismissed', '1')
  }

  if (!show || dismissed) return null

  return (
    <div style={{
      position: 'fixed', bottom: 80, left: 12, right: 12, zIndex: 200,
      background: '#fff', borderRadius: 16, padding: '14px 16px',
      boxShadow: '0 8px 40px rgba(0,0,0,.18)', border: '1px solid rgba(0,0,0,.06)',
      display: 'flex', flexDirection: 'column', gap: 10,
      animation: 'slideUp .3s ease'
    }}>
      <style>{`@keyframes slideUp { from { transform: translateY(20px); opacity:0 } to { transform: translateY(0); opacity:1 } }`}</style>
      <div style={{display:'flex',alignItems:'center',gap:12}}>
        <img src="/apple-touch-icon.png" alt="" width={44} height={44}
          style={{borderRadius:10,flexShrink:0}} />
        <div style={{flex:1}}>
          <div style={{fontWeight:700,fontSize:14,color:'var(--text)'}}>Installer Crew Trips</div>
          <div style={{fontSize:12,color:'var(--text-3)',marginTop:2,lineHeight:1.4}}>
            Accédez à vos trips depuis l'écran d'accueil
          </div>
        </div>
        <button onClick={dismiss}
          style={{background:'none',border:'none',fontSize:20,color:'var(--text-3)',cursor:'pointer',padding:4}}>
          ×
        </button>
      </div>
      <div style={{background:'var(--sand)',borderRadius:10,padding:'10px 12px',fontSize:13,
        color:'var(--text-2)',lineHeight:1.8}}>
        <div>1. Appuyez sur <strong style={{color:'var(--text)'}}>···</strong> en bas à gauche</div>
        <div>2. Appuyez sur <strong style={{color:'var(--text)'}}>Partager</strong> ↗</div>
        <div>3. Appuyez sur <strong style={{color:'var(--text)'}}>Afficher plus</strong></div>
        <div>4. Choisissez <strong style={{color:'var(--text)'}}>Ajouter sur l'écran d'accueil</strong></div>
        <div>5. Appuyez sur <strong style={{color:'var(--text)'}}>Ajouter</strong></div>
      </div>
    </div>
  )
}