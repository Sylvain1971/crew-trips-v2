'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TRIP_ICONS } from '@/lib/utils'
import { COULEURS_MEMBRES } from '@/lib/types'

function genCode() {
  return Array.from({length:6},()=>'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*32)]).join('')
}

interface SavedTrip {
  code: string
  nom: string
  type: string
  destination?: string
  participants?: string[]
  savedAt: number
  sourceCode?: string
}

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [nom, setNom] = useState(searchParams.get('nom')||'')
  const [type, setType] = useState(searchParams.get('type')||'peche')
  const [dest, setDest] = useState(searchParams.get('dest')||'')
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [loading, setLoading] = useState(false)
  const [mesTrips, setMesTrips] = useState<SavedTrip[]>([])
  const [showMesTrips, setShowMesTrips] = useState(false)

  useEffect(() => {
    const raw = localStorage.getItem('crew-mes-trips')
    if (!raw) return
    try {
      const saved: SavedTrip[] = JSON.parse(raw)
      if (saved.length === 0) return
      // Vérifier quels trips existent encore en DB
      const codes = saved.map(t => t.code)
      supabase.from('trips').select('code').in('code', codes).then(({data}) => {
        const existingCodes = new Set((data||[]).map((t:any) => t.code))
        const filtered = saved.filter(t => existingCodes.has(t.code))
        setMesTrips(filtered)
        localStorage.setItem('crew-mes-trips', JSON.stringify(filtered))
      })
    } catch {}
  }, [])

  function saveTripLocal(trip: SavedTrip) {
    try {
      const raw = localStorage.getItem('crew-mes-trips')
      const existing: SavedTrip[] = raw ? JSON.parse(raw) : []
      const filtered = existing.filter(t => t.code !== trip.code)
      const updated = [trip, ...filtered].slice(0, 20)
      localStorage.setItem('crew-mes-trips', JSON.stringify(updated))
      setMesTrips(updated)
    } catch {
      // localStorage plein ou indisponible — on ignore silencieusement
    }
  }

  async function creer() {
    if (!nom.trim()) return
    setLoading(true)
    const code = genCode()
    const { error } = await supabase.from('trips').insert({
      code, nom: nom.trim(), type, destination: dest.trim()||null,
      date_debut: d1||null, date_fin: d2||null,
    })
    if (error) {
      alert('Erreur lors de la création du trip : ' + error.message)
      setLoading(false)
      return
    }
    try {
      const participants = searchParams.get('participants')?.split(',').filter(Boolean) || []
      const sourceCode = searchParams.get('sourceCode') || null
      saveTripLocal({ code, nom: nom.trim(), type, destination: dest.trim()||undefined, participants, savedAt: Date.now() })
      // Récupérer le nouvel ID du trip
      const { data: newTrip, error: fetchErr } = await supabase.from('trips').select('id').eq('code', code).single()
      if (fetchErr || !newTrip) throw new Error(fetchErr?.message || 'Trip introuvable après création')
      // Créer le membre créateur immédiatement pour bypasser JoinScreen
      // On cherche uniquement parmi les trips où on était créateur
      const prenomCreateur = (() => {
        try {
          const raw = localStorage.getItem('crew-mes-trips')
          if (!raw) return null
          const saved: SavedTrip[] = JSON.parse(raw)
          for (const t of saved) {
            const stored = localStorage.getItem(`crew2-${t.code}`)
            if (!stored) continue
            const m = JSON.parse(stored)
            if (m?.prenom && m?.is_createur === true) return m.prenom as string
          }
        } catch {}
        return null
      })()
      if (prenomCreateur) {
        const couleur = COULEURS_MEMBRES[Math.floor(Math.random() * COULEURS_MEMBRES.length)]
        const { data: newMembre } = await supabase.from('membres')
          .insert({ trip_id: newTrip.id, prenom: prenomCreateur, couleur, is_createur: true })
          .select().single()
        if (newMembre) {
          try { localStorage.setItem(`crew2-${code}`, JSON.stringify(newMembre)) } catch {}
        }
      }
      // Participants autorisés
      if (participants.length > 0) {
        const { error: partErr } = await supabase.from('participants_autorises').insert(
          participants.map(p => ({ trip_id: newTrip.id, prenom: p }))
        )
        if (partErr) console.error('Erreur participants_autorises:', partErr.message)
      }
      // Copier lodge + infos du trip source
      if (sourceCode) {
        const { data: src } = await supabase.from('trips').select('*').eq('code', sourceCode).single()
        if (src) {
          const { error: lodgeErr } = await supabase.from('trips').update({
            lodge_nom: src.lodge_nom, lodge_adresse: src.lodge_adresse,
            lodge_tel: src.lodge_tel, lodge_wifi: src.lodge_wifi,
            lodge_code: src.lodge_code, lodge_arrivee: src.lodge_arrivee,
            whatsapp_lien: src.whatsapp_lien,
          }).eq('id', newTrip.id)
          if (lodgeErr) console.error('Erreur copie lodge:', lodgeErr.message)
          const { data: srcInfos } = await supabase.from('infos').select('*').eq('trip_id', src.id)
          if (srcInfos && srcInfos.length > 0) {
            type InfoInsert = Omit<typeof srcInfos[0], 'id'|'trip_id'|'created_at'>
            const { error: infosErr } = await supabase.from('infos').insert(
              srcInfos.map(({id: _id, trip_id: _tid, created_at: _cat, ...rest}: InfoInsert & {id:string,trip_id:string,created_at:string}) =>
                ({...rest, trip_id: newTrip.id}))
            )
            if (infosErr) console.error('Erreur copie infos:', infosErr.message)
          }
        }
      }
      router.push('/trip/' + code)
    } catch (err) {
      console.error('Erreur post-création:', err)
      // Le trip est créé — on redirige quand même
      router.push('/trip/' + code)
    }
  }

  function dupliquer(trip: SavedTrip) {
    const params = new URLSearchParams({
      nom: trip.nom,
      type: trip.type,
      dest: trip.destination || '',
      participants: (trip.participants||[]).join(','),
      sourceCode: trip.code,
    })
    router.push(`/?${params.toString()}`)
    setShowMesTrips(false)
    // Effacer les dates
    setD1(''); setD2('')
    setNom(trip.nom)
    setType(trip.type)
    setDest(trip.destination||'')
  }

  function fmt(ts: number) {
    return new Date(ts).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
  }

  const isDuplicate = searchParams.get('nom') !== null

  return (
    <main style={{minHeight:'100dvh',display:'flex',flexDirection:'column',background:'var(--forest)'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px 24px'}}>

        {/* Header */}
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:56,marginBottom:12}}>{TRIP_ICONS[type]||'🏕'}</div>
          <h1 style={{fontSize:32,fontWeight:800,color:'#fff',letterSpacing:'-.04em',lineHeight:1.1}}>Crew Trips</h1>
          <p style={{fontSize:15,color:'rgba(255,255,255,.55)',marginTop:10,lineHeight:1.5}}>
            Tout ce que ton groupe a besoin de savoir.<br/>Un seul lien.
          </p>
          {mesTrips.length > 0 && (
            <button onClick={()=>setShowMesTrips(!showMesTrips)}
              style={{marginTop:14,background:'rgba(255,255,255,.12)',border:'1px solid rgba(255,255,255,.2)',
                borderRadius:20,padding:'7px 18px',color:'rgba(255,255,255,.85)',fontSize:13,
                fontWeight:600,cursor:'pointer'}}>
              📋 Mes trips ({mesTrips.length})
            </button>
          )}
        </div>

        {/* Mes trips panel */}
        {showMesTrips && (
          <div style={{width:'100%',maxWidth:420,marginBottom:20,background:'rgba(255,255,255,.06)',
            borderRadius:16,border:'1px solid rgba(255,255,255,.1)',overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,.08)',
              fontWeight:700,fontSize:14,color:'rgba(255,255,255,.7)'}}>
              Mes trips passés
            </div>
            {mesTrips.map(t=>(
              <div key={t.code} style={{padding:'12px 16px',borderBottom:'1px solid rgba(255,255,255,.06)',
                display:'flex',alignItems:'center',gap:12}}>
                <div style={{fontSize:28,flexShrink:0}}>{TRIP_ICONS[t.type]||'🏕'}</div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontWeight:700,fontSize:14,color:'#fff',whiteSpace:'nowrap',
                    overflow:'hidden',textOverflow:'ellipsis'}}>{t.nom}</div>
                  {t.destination && <div style={{fontSize:12,color:'rgba(255,255,255,.45)',marginTop:1}}>{t.destination}</div>}
                  <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginTop:1}}>{fmt(t.savedAt)}</div>
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:6,flexShrink:0}}>
                  <button onClick={()=>router.push(`/trip/${t.code}`)}
                    style={{padding:'5px 10px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',
                      background:'transparent',color:'rgba(255,255,255,.7)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                    Ouvrir
                  </button>
                  <button onClick={()=>dupliquer(t)}
                    style={{padding:'5px 10px',borderRadius:8,border:'none',
                      background:'rgba(255,255,255,.9)',color:'var(--forest)',fontSize:12,fontWeight:700,cursor:'pointer'}}>
                    Dupliquer
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Formulaire */}
        <div style={{width:'100%',maxWidth:420,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:`1px solid ${isDuplicate?'rgba(255,255,255,.3)':'rgba(255,255,255,.1)'}`}}>
          {isDuplicate && (
            <div style={{background:'rgba(255,255,255,.1)',borderRadius:10,padding:'8px 12px',
              marginBottom:16,fontSize:13,color:'rgba(255,255,255,.75)',textAlign:'center'}}>
              📋 Duplication — ajustez les dates et créez
            </div>
          )}
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>NOM DU TRIP</label>
            <input className="input" placeholder="Ex: Dean River — Septembre 2025"
              value={nom} onChange={e=>setNom(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}
              onFocus={e=>{e.target.style.border='1.5px solid rgba(255,255,255,.4)'}}
              onBlur={e=>{e.target.style.border='1.5px solid rgba(255,255,255,.15)'}}
            />
          </div>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>ACTIVITÉ</label>
            <select className="input" value={type} onChange={e=>setType(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}>
              <option value="peche" style={{background:'#1a3a1a',color:'#fff'}}>🎣 Pêche à la mouche</option>
              <option value="ski" style={{background:'#1a3a1a',color:'#fff'}}>⛷ Ski alpin</option>
              <option value="motoneige" style={{background:'#1a3a1a',color:'#fff'}}>🗻 Motoneige</option>
              <option value="hike" style={{background:'#1a3a1a',color:'#fff'}}>🥾 Randonnée / Hike</option>
              <option value="velo" style={{background:'#1a3a1a',color:'#fff'}}>🚵 Vélo / Mountain Bike</option>
              <option value="chasse" style={{background:'#1a3a1a',color:'#fff'}}>🫎 Chasse</option>
              <option value="yoga" style={{background:'#1a3a1a',color:'#fff'}}>🧘 Yoga</option>
              <option value="autre" style={{background:'#1a3a1a',color:'#fff'}}>🏕 Autre</option>
            </select>
          </div>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>DESTINATION</label>
            <input className="input" placeholder="Ex: Dean River, Colombie-Britannique"
              value={dest} onChange={e=>setDest(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}
            />
          </div>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>DATES</label>
            <div style={{display:'flex',gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>DÉBUT</div>
                <input type="date" value={d1} onChange={e=>setD1(e.target.value)}
                  style={{width:'100%',padding:'12px 10px',borderRadius:10,border:'1.5px solid rgba(255,255,255,.25)',
                    background:'rgba(255,255,255,.15)',color:'#fff',fontSize:13,
                    fontFamily:'inherit',outline:'none',colorScheme:'dark'}}/>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>FIN</div>
                <input type="date" value={d2} onChange={e=>setD2(e.target.value)}
                  style={{width:'100%',padding:'12px 10px',borderRadius:10,border:'1.5px solid rgba(255,255,255,.25)',
                    background:'rgba(255,255,255,.15)',color:'#fff',fontSize:13,
                    fontFamily:'inherit',outline:'none',colorScheme:'dark'}}/>
              </div>
            </div>
          </div>
          <button className="btn" onClick={creer} disabled={loading||!nom.trim()}
            style={{background:loading||!nom.trim()?'rgba(255,255,255,.15)':'#fff',
              color:loading||!nom.trim()?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700,marginTop:4}}>
            {loading ? 'Création en cours…' : isDuplicate ? 'Créer ce nouveau trip →' : 'Créer le trip →'}
          </button>
        </div>
        <p style={{fontSize:12,color:'rgba(255,255,255,.3)',marginTop:20,textAlign:'center',lineHeight:1.6}}>
          Un lien unique sera généré. Partagez-le dans Messenger.
        </p>
      </div>
    </main>
  )
}
export default function Home() {
  return (
    <Suspense fallback={<div style={{minHeight:'100dvh',background:'var(--forest)'}} />}>
      <HomeInner />
    </Suspense>
  )
}