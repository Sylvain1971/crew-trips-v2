// Hook : gère le chargement du trip, du membre courant et des participants autorisés.
// Gère aussi la reconnexion auto via localStorage → tel → Service Worker cache.
//
// Phase 2 : utilise les RPC côté serveur avec FALLBACK sur les SELECT directs.
// Quand RLS sera activée (Session 2.3), les SELECT directs échoueront mais
// les RPC prendront le relais automatiquement.
import { useCallback, useEffect, useState } from 'react'
import { supabase } from './supabase'
import { apiGetTripByCode, apiReconnectByTel, apiGetAutorises, apiGetMembreById, apiJoinTrip } from './api'
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
    // Phase 2 : RPC first, fallback direct
    const rpc = await apiGetMembreById(m.id)
    if (rpc.success && rpc.membre) {
      return { ...rpc.membre, is_createur: rpc.membre.is_createur ?? false }
    }
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

  // Phase 2 : RPC first (couvre tel normal + fallback createur_tel), fallback direct
  const rpc = await apiReconnectByTel(code, digits)
  if (rpc.success && rpc.membre) {
    const m = { ...rpc.membre, is_createur: rpc.membre.is_createur ?? false }
    try { localStorage.setItem(`crew2-${code}`, JSON.stringify(m)) } catch {}
    return m
  }

  // Fallback direct (avant activation RLS)
  const { data: membreTel } = await supabase.from('membres')
    .select('*').eq('trip_id', trip.id).eq('tel', digits).maybeSingle()
  if (membreTel) {
    const m = { ...membreTel, is_createur: membreTel.is_createur ?? false }
    try { localStorage.setItem(`crew2-${code}`, JSON.stringify(m)) } catch {}
    return m
  }

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
    // Phase 2 : RPC first, fallback direct
    const rpc = await apiGetMembreById(m.id)
    if (rpc.success && rpc.membre) {
      const membre = { ...rpc.membre, is_createur: rpc.membre.is_createur ?? false }
      try { localStorage.setItem(`crew2-${code}`, JSON.stringify(membre)) } catch {}
      return membre
    }
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
      // 1. Charger le trip — Phase 2 : RPC first, fallback direct
      let trip: Trip | null = null
      const rpcTrip = await apiGetTripByCode(code)
      if (rpcTrip.success && rpcTrip.trip) {
        trip = rpcTrip.trip
      } else {
        const { data } = await supabase.from('trips').select('*').eq('code', code).single()
        trip = data
      }
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

      poserVerrouIdentite(membre)

      // Phase 2 : si on a reconnecté automatiquement un membre qui a un NIP,
      // on devrait avoir un token. Si pas encore (première visite post-Phase2),
      // on ne peut pas générer de token sans le NIP en clair — le token sera
      // généré au prochain login explicite via JoinScreen.
      // Pas bloquant.

      // 3. Si aucun membre trouvé, charger les participants autorisés (pour JoinScreen)
      let autorises: ParticipantAutorise[] = []
      if (!membre) {
        // Phase 2 : RPC first, fallback direct
        const rpcAut = await apiGetAutorises(code)
        if (rpcAut.success && rpcAut.autorises) {
          autorises = rpcAut.autorises as ParticipantAutorise[]
        } else {
          const { data } = await supabase.from('participants_autorises').select('*').eq('trip_id', trip.id)
          autorises = data || []
        }
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

// Helper exporté : déclenche la génération d'un token serveur pour un membre déjà
// reconnecté par tel. Appelé par ailleurs (dans un useEffect du trip par ex) si
// on veut régénérer un token proactivement. Non utilisé aujourd'hui mais prêt.
export async function regenerateTokenFor(tripCode: string, tel: string, nipHash: string) {
  try { await apiJoinTrip(tripCode, tel, nipHash) } catch {}
}
