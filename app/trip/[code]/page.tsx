'use client'
import { useEffect, useState, useCallback, use } from 'react'
import { supabase } from '@/lib/supabase'
import { TRIP_ICONS } from '@/lib/utils'
import type { Trip, Membre, ParticipantAutorise } from '@/lib/types'
import JoinScreen from './JoinScreen'
import Infos from './Infos'
import Chat from './Chat'
import Membres from './Membres'

type Tab = 'infos'|'chat'|'membres'

function NavIcon({tab}:{tab:Tab}) {
  if (tab==='infos') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
  if (tab==='chat') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  )
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

export default function TripPage({params:paramsPromise}:{params:Promise<{code:string}>}) {
  const params = use(paramsPromise)
  const [trip, setTrip] = useState<Trip|null>(null)
  const [membre, setMembre] = useState<Membre|null>(null)
  const [autorises, setAutorises] = useState<ParticipantAutorise[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [tab, setTab] = useState<Tab>('infos')
  const [showWelcome, setShowWelcome] = useState(false)

  const load = useCallback(async()=>{
    try {
      const {data} = await supabase.from('trips').select('*').eq('code',params.code).single()
      if (!data) { setError(true); return }
      setTrip(data)
      // Mémoriser le dernier trip visité pour la PWA standalone
      try { localStorage.setItem('crew-last-trip', params.code) } catch {}
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        navigator.serviceWorker.controller.postMessage({ type: 'SET_LAST_TRIP', code: params.code })
      }
      const {data:auth} = await supabase.from('participants_autorises').select('*').eq('trip_id',data.id)
      setAutorises(auth||[])

      // 1. Essayer localStorage
      const stored = localStorage.getItem(`crew2-${params.code}`)
      if (stored) {
        try {
          const m = JSON.parse(stored)
          const {data:dbM} = await supabase.from('membres').select('*').eq('id', m.id).maybeSingle()
          if (dbM) { setMembre({...dbM, is_createur: dbM.is_createur ?? false}); return }
          localStorage.removeItem(`crew2-${params.code}`)
        } catch {}
      }

      // 2. Reconnexion auto via numéro de téléphone
      const savedTel = (() => { try { return localStorage.getItem('crew-tel') } catch { return null } })()
      if (savedTel) {
        const digits = savedTel.replace(/\D/g, '')
        if (digits.length === 10) {
          // Chercher dans membres par tel (créateur ou participant)
          const { data: membreTel } = await supabase.from('membres')
            .select('*').eq('trip_id', data.id).eq('tel', digits).maybeSingle()
          if (membreTel) {
            const m = {...membreTel, is_createur: membreTel.is_createur ?? false}
            setMembre(m)
            try { localStorage.setItem(`crew2-${params.code}`, JSON.stringify(m)) } catch {}
            return
          }
          // Fallback: vérifier si créateur par createur_tel
          const { data: tripData } = await supabase.from('trips').select('createur_tel').eq('code', params.code).single()
          if (tripData?.createur_tel === digits) {
            const { data: createurMembre } = await supabase.from('membres')
              .select('*').eq('trip_id', data.id).eq('is_createur', true).maybeSingle()
            if (createurMembre) {
              const m = {...createurMembre, is_createur: true}
              setMembre(m)
              try { localStorage.setItem(`crew2-${params.code}`, JSON.stringify(m)) } catch {}
              return
            }
          }
        }
      }

      // 2. localStorage vide (PWA standalone) — essayer le Service Worker cache
      if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
        const membreFromSW = await new Promise<string|null>(resolve => {
          const handler = (event: MessageEvent) => {
            if (event.data?.type === 'MEMBRE_DATA' && event.data.code === params.code) {
              navigator.serviceWorker.removeEventListener('message', handler)
              resolve(event.data.data)
            }
          }
          navigator.serviceWorker.addEventListener('message', handler)
          navigator.serviceWorker.controller!.postMessage({ type: 'GET_MEMBRE', code: params.code })
          setTimeout(() => { navigator.serviceWorker.removeEventListener('message', handler); resolve(null) }, 2000)
        })
        if (membreFromSW) {
          try {
            const m = JSON.parse(membreFromSW)
            const {data:dbM} = await supabase.from('membres').select('*').eq('id', m.id).maybeSingle()
            if (dbM) {
              const membre = {...dbM, is_createur: dbM.is_createur ?? false}
              setMembre(membre)
              try { localStorage.setItem(`crew2-${params.code}`, JSON.stringify(membre)) } catch {}
              return
            }
          } catch {}
        }
      }
    } catch {
      setError(true)
    } finally {
      setLoading(false)
    }
  },[params.code])

  useEffect(()=>{ load() },[load])

  // Enregistrer le Service Worker + fix manifest PWA
  useEffect(()=>{
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    // Pointer le manifest vers ce trip pour que l'installation iOS mémorise /trip/[code]
    const existing = document.querySelector('link[rel="manifest"]')
    if (existing) existing.setAttribute('href', `/trip/${params.code}/manifest`)
    else {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = `/trip/${params.code}/manifest`
      document.head.appendChild(link)
    }
  }, [params.code])

  function saveMembre(m: Membre) {
    setMembre(m)
    try { localStorage.setItem(`crew2-${params.code}`, JSON.stringify(m)) } catch {}
    if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
      navigator.serviceWorker.controller.postMessage({ type: 'SET_MEMBRE', code: params.code, membre: m })
    }
  }

  function onTripUpdate(updates: Partial<Trip>) {
    setTrip(prev => prev ? {...prev,...updates} : prev)
  }

  if (loading) return (
    <div style={{minHeight:'100dvh',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--forest)'}}>
      <div style={{color:'rgba(255,255,255,.5)',fontSize:14}}>Chargement…</div>
    </div>
  )
  if (error||!trip) return (
    <div style={{minHeight:'100dvh',display:'flex',flexDirection:'column',alignItems:'center',
      justifyContent:'center',gap:14,padding:24,textAlign:'center',background:'var(--forest)'}}>
      <span style={{fontSize:52}}>🔍</span>
      <div style={{fontWeight:700,fontSize:20,color:'#fff'}}>Trip introuvable</div>
      <div style={{color:'rgba(255,255,255,.5)',fontSize:14}}>Ce lien ne correspond à aucun trip actif.</div>
      <a href="/mes-trips" style={{marginTop:12,display:'inline-flex',alignItems:'center',gap:8,
        background:'rgba(255,255,255,.15)',border:'1.5px solid rgba(255,255,255,.25)',
        borderRadius:10,padding:'10px 20px',fontSize:14,fontWeight:600,
        color:'#fff',textDecoration:'none'}}>← Mes trips</a>
    </div>
  )

  if (!membre) return <JoinScreen trip={trip} autorises={autorises} onJoin={saveMembre} />

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100dvh',background:'var(--sand)'}}>
      {tab!=='infos' && (
        <div style={{background:'var(--forest)',padding:'12px 16px 10px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <a href="/mes-trips"
            style={{background:'rgba(255,255,255,.1)',border:'none',borderRadius:8,padding:'6px 10px',
              color:'rgba(255,255,255,.7)',fontSize:12,cursor:'pointer',textDecoration:'none',flexShrink:0,
              display:'flex',alignItems:'center',gap:4}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Mes trips
          </a>
          <span style={{fontSize:20}}>{TRIP_ICONS[trip.type]||'🏕'}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {trip.nom}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.1)',padding:'5px 10px',borderRadius:20,flexShrink:0}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:membre.couleur}} />
            <span style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,.8)'}}>{membre.prenom}</span>
            {membre.is_createur && <span style={{fontSize:10,color:'rgba(255,255,255,.5)'}}>★</span>}
          </div>
        </div>
      )}

      <div style={{flex:1,overflow:tab==='chat'?'hidden':'auto',display:'flex',flexDirection:'column'}}>
        {tab==='infos' && <Infos trip={trip} membre={membre} onTripUpdate={onTripUpdate} />}
        {tab==='chat' && <Chat tripId={trip.id} membre={membre} />}
        {tab==='membres' && <Membres trip={trip} membre={membre} onTripUpdate={onTripUpdate} />}
      </div>

      {/* Banner bienvenue supprimé — remplacé par bouton ← Accueil dans le header */}

      <nav className="bottom-nav">
        {(['infos','chat','membres'] as Tab[]).map(t=>(
          <button key={t} className={`nav-tab ${tab===t?'active':''}`} onClick={()=>setTab(t)}>
            <NavIcon tab={t} />
            {t==='infos'?'Infos':t==='chat'?'Chat':'Groupe'}
          </button>
        ))}
      </nav>
    </div>
  )
}
