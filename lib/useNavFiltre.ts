// Hook partagé : gestion du filtre avec persistance sessionStorage + history
import { useEffect, useState } from 'react'

export function useNavFiltre() {
  const [filtre, setFiltreRaw] = useState<string>(() => {
    if (typeof window !== 'undefined' && window.history.state?.filtre) {
      return window.history.state.filtre
    }
    return 'all'
  })

  const setFiltre = (f: string) => {
    setFiltreRaw(f)
    if (typeof window !== 'undefined') {
      window.history.replaceState({ ...window.history.state, filtre: f }, '')
    }
  }

  const pushFiltre = (f?: string) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('crew-trips-filtre', f ?? filtre)
    }
  }

  const pushFiltreAndNavigate = (targetFiltre: string) => {
    window.history.pushState({ ...window.history.state, filtre: 'all' }, '')
    setFiltreRaw(targetFiltre)
    if (typeof window !== 'undefined') {
      window.history.replaceState({ ...window.history.state, filtre: targetFiltre }, '')
    }
  }

  useEffect(() => {
    const onPop = (e: PopStateEvent) => {
      setFiltreRaw(e.state?.filtre ?? 'all')
    }
    const restoreFromSession = () => {
      const saved = sessionStorage.getItem('crew-trips-filtre')
      if (saved) {
        setFiltreRaw(saved)
        sessionStorage.removeItem('crew-trips-filtre')
      }
    }
    const onVisible = () => {
      if (document.visibilityState === 'visible') restoreFromSession()
    }
    window.addEventListener('popstate', onPop)
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('focus', restoreFromSession)
    return () => {
      window.removeEventListener('popstate', onPop)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('focus', restoreFromSession)
    }
  }, [])

  return { filtre, setFiltre, pushFiltre, pushFiltreAndNavigate }
}
