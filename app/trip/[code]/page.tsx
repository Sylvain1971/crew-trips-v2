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

  const load = useCallback(async()=>{
    const {data} = await supabase.from('trips').select('*').eq('code',params.code).single()
    if (!data) { setError(true); setLoading(false); return }
    setTrip(data)
    const {data:auth} = await supabase.from('participants_autorises').select('*').eq('trip_id',data.id)
    setAutorises(auth||[])
    const stored = localStorage.getItem(`crew2-${params.code}`)
    if (stored) {
      try {
        const m = JSON.parse(stored)
        const {data:dbM, error:dbErr} = await supabase.from('membres')
          .select('*').eq('id', m.id).maybeSingle()
        if (dbM) {
          // Normaliser is_createur (peut être null sur anciens membres)
          setMembre({...dbM, is_createur: dbM.is_createur ?? false})
        } else {
          // Membre supprimé ou retiré — effacer localStorage
          localStorage.removeItem(`crew2-${params.code}`)
        }
      } catch {}
    }
    setLoading(false)
  },[params.code])

  useEffect(()=>{ load() },[load])

  function saveMembre(m: Membre) {
    setMembre(m)
    try {
      localStorage.setItem(`crew2-${params.code}`, JSON.stringify(m))
    } catch {
      // localStorage plein ou indisponible
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
      <a href="/" style={{marginTop:8,fontSize:14,color:'rgba(255,255,255,.7)',textDecoration:'underline'}}>← Créer un nouveau trip</a>
    </div>
  )

  if (!membre) return <JoinScreen trip={trip} autorises={autorises} onJoin={saveMembre} />

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100dvh',background:'var(--sand)'}}>
      {tab!=='infos' && (
        <div style={{background:'var(--forest)',padding:'12px 16px 10px',display:'flex',alignItems:'center',gap:10,flexShrink:0}}>
          <span style={{fontSize:20}}>{TRIP_ICONS[trip.type]||'🏕'}</span>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontWeight:700,fontSize:15,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {trip.nom}
            </div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.1)',padding:'5px 10px',borderRadius:20,flexShrink:0}}>
            <div style={{width:8,height:8,borderRadius:'50%',background:membre.couleur}} />
            <span style={{fontSize:12,fontWeight:600,color:'rgba(255,255,255,.8)'}}>{membre.prenom}</span>
            {membre.is_createur && <span style={{fontSize:10,color:'rgba(255,255,255,.5)'}}>✦</span>}
          </div>
        </div>
      )}

      <div style={{flex:1,overflow:tab==='chat'?'hidden':'auto',display:'flex',flexDirection:'column'}}>
        {tab==='infos' && <Infos trip={trip} membre={membre} />}
        {tab==='chat' && <Chat tripId={trip.id} membre={membre} />}
        {tab==='membres' && <Membres trip={trip} membre={membre} onTripUpdate={onTripUpdate} />}
      </div>

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
