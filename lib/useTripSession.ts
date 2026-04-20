// Hook : gère le chargement du trip, du membre courant et des participants autorisés.
// Gère aussi la reconnexion auto via localStorage → tel → Service Worker cache.
// Les participants autorisés ne sont chargés QUE si aucun membre n'a été trouvé
// (utilisés uniquement par JoinScreen), pour éviter une requête inutile aux utilisateurs déjà connectés.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import type { Trip, Membre, ParticipantAutorise } from './types'

type State = {
  trip: Trip | null
  membre: Membre | null
  autorises: ParticipantAutorise[]
  loading: boolean
  error: boolean
}

// Pose/maj le verrou d'identité (crew-tel-locked) dès qu'un membre est
// retrouvé dans un trip, peu importe la stratégie (localStorage, tel,
// Service Worker, JoinScreen). Assure que /mes-trips reconnaît cet appareil
// comme déjà identifié.
function poserVerrouIdentite(m: Membre | null) {
  if (!m) return
  const digits = (m.tel || '').replace(/\D/g, '')
  if (digits.length !== 10) return
  const formatted = `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
  try {
    localStorage.setItem('crew-tel-locked', formatted)
    localStorage.setItem('crew-tel', formatted)
    if (m.prenom) localStorage.setItem('crew-prenom', m.prenom)
    if (m.nom) localStorage.setItem('crew-nom', m.nom)
  } catch {}
}

async function tryLocalStorage(code: string): Promise<Membre | null> {
  try {
    const raw = localStorage.getItem(`crew2-${code}`)
    if (!raw) return null
    const m = JSON.parse(raw)
    const { data } = await supabase.from('membres').select('*').eq('id', m.id).maybeSingle()
    if (data) return { ...data, is_createur: data.is_createur ?? false }
    localStorage.removeItem(`crew2-${code}`)
  } catch {}
  return null
}

async function tryTelReconnect(code: string, trip: Trip): Promise<Membre | null> {
  const savedTel = (() => { try { return localStorage.getItem('crew-tel') } catch { return null } })()
  if (!savedTel) return null
  const digits = savedTel.replace(/\D/g, '')
  if (digits.length !== 10) return null

  // Chercher par tel (créateur ou participant)
  const { data: membreTel } = await supabase.from('membres')
    .select('*').eq('trip_id', trip.id).eq('tel', digits).maybeSingle()
  if (membreTel) {
    const m = { ...membreTel, is_createur: membreTel.is_createur ?? false }
    try { localStorage.setItem(`crew2-${code}`, JSON.stringify(m)) } catch {}
    return m
  }

  // Fallback : vérifier via createur_tel (déjà présent dans trip — pas de requête supplémentaire)
  if (trip.createur_tel === digits) {
    const { data: createurMembre } = await supabase.from('membres')
      .select('*').eq('trip_id', trip.id).eq('is_createur', true).maybeSingle()
    if (createurMembre) {
      const m = { ...createurMembre, is_createur: true }
      try { localStorage.setItem(`crew2-${code}`, JSON.stringify(m)) } catch {}
      return m
    }
  }
  return null
}

async function trySWCache(code: string): Promise<Membre | null> {
  if (!('serviceWorker' in navigator) || !navigator.serviceWorker.controller) return null
  const raw = await new Promise<string | null>(resolve => {
    const handler = (event: MessageEvent) => {
      if (event.data?.type === 'MEMBRE_DATA' && event.data.code === code) {
        navigator.serviceWorker.removeEventListener('message', handler)
        resolve(event.data.data)
      }
    }
    navigator.serviceWorker.addEventListener('message', handler)
    navigator.serviceWorker.controller!.postMessage({ type: 'GET_MEMBRE', code })
    setTimeout(() => { navigator.serviceWorker.removeEventListener('message', handler); resolve(null) }, 2000)
  })
  if (!raw) return null
  try {
    const m = JSON.parse(raw)
    const { data } = await supabase.from('membres').select('*').eq('id', m.id).maybeSingle()
    if (data) {
      const membre = { ...data, is_createur: data.is_createur ?? false }
      try { localStorage.setItem(`crew2-${code}`, JSON.stringify(membre)) } catch {}
      return membre
    }
  } catch {}
  return null
}

export function useTripSession(code: string) {
  const [state, setState] = useState<State>({
    trip: null, membre: null, autorises: [], loading: true, error: false,
  })

  const load = useCallback(async () => {
    try {
      // 1. Charger le trip
      const { data: trip } = await supabase.from('trips').select('*').eq('code', code).single()
      if (!trip) { setState(s => ({ ...s, error: true, loading: false })); return }

      // Mémoriser le dernier trip visité (PWA standalone)
      try { localStorage.setItem('crew-last-trip', code) } catch {}
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SET_LAST_TRIP', code })
      }

      // 2. Tenter de retrouver le membre (3 stratégies en cascade)
      const membre =
        await tryLocalStorage(code) ??
        await tryTelReconnect(code, trip) ??
        await trySWCache(code)

      // Poser le verrou d'identité dès qu'un membre est retrouvé, peu importe
      // la stratégie. Couvre les utilisateurs déjà connectés avant le déploiement
      // du verrou, et toutes les reconnexions silencieuses.
      poserVerrouIdentite(membre)

      // 3. Si aucun membre trouvé, charger les participants autorisés (pour JoinScreen)
      //    Sinon, on évite cette requête — c'est le gain N+1.
      let autorises: ParticipantAutorise[] = []
      if (!membre) {
        const { data } = await supabase.from('participants_autorises').select('*').eq('trip_id', trip.id)
        autorises = data || []
      }

      setState({ trip, membre, autorises, loading: false, error: false })
    } catch {
      setState(s => ({ ...s, error: true, loading: false }))
    }
  }, [code])

  useEffect(() => { load() }, [load])

  const saveMembre = useCallback((m: Membre) => {
    setState(s => ({ ...s, membre: m }))
    try { localStorage.setItem(`crew2-${code}`, JSON.stringify(m)) } catch {}
    // Ceinture + bretelles : assurer que le verrou est toujours posé
    // quand un membre est sauvé, même si JoinScreen oubliait un cas.
    poserVerrouIdentite(m)
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SET_MEMBRE', code, membre: m })
    }
  }, [code])

  const onTripUpdate = useCallback((updates: Partial<Trip>) => {
    setState(s => s.trip ? { ...s, trip: { ...s.trip, ...updates } } : s)
  }, [])

  return { ...state, saveMembre, onTripUpdate }
}
