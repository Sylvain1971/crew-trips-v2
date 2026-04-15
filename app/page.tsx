'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TRIP_ICONS } from '@/lib/utils'
import { COULEURS_MEMBRES } from '@/lib/types'

function genCode() {
  return Array.from({length:6},()=>'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*32)]).join('')
}

function formatTel(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

interface TripDB {
  code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
}

function HomeInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [nom, setNom] = useState(searchParams.get('nom')||'')
  const [type, setType] = useState(searchParams.get('type')||'peche')
  const [dest, setDest] = useState(searchParams.get('dest')||'')
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [tel, setTel] = useState('')
  const [loading, setLoading] = useState(false)
  const [mesTrips, setMesTrips] = useState<TripDB[]>([])
  const [loadingTrips, setLoadingTrips] = useState(false)
  const [showMesTrips, setShowMesTrips] = useState(false)

  // Charger le numéro sauvegardé
  useEffect(() => {
    try {
      const savedTel = localStorage.getItem('crew-tel')
      if (savedTel) {
        setTel(savedTel)
        chargerMesTrips(savedTel)
      }
    } catch {}
  }, [])

  async function chargerMesTrips(numero: string) {
    const digits = numero.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoadingTrips(true)
    const { data } = await supabase.from('trips')
      .select('code,nom,type,destination,date_debut,date_fin')
      .eq('createur_tel', digits)
      .order('created_at', { ascending: false })
    setMesTrips(data || [])
    setLoadingTrips(false)
  }

  function onTelChange(val: string) {
    const formatted = formatTel(val)
    setTel(formatted)
    const digits = formatted.replace(/\D/g, '')
    if (digits.length === 10) {
      try { localStorage.setItem('crew-tel', formatted) } catch {}
      chargerMesTrips(formatted)
    } else {
      setMesTrips([])
    }
  }

  async function creer() {
    if (!nom.trim()) return
    const digits = tel.replace(/\D/g, '')
    if (digits.length !== 10) {
      alert('Entrez votre numéro de téléphone à 10 chiffres.')
      return
    }
    setLoading(true)
    try { localStorage.setItem('crew-tel', tel) } catch {}
    const code = genCode()
    const { error } = await supabase.from('trips').insert({
      code, nom: nom.trim(), type,
      destination: dest.trim()||null,
      date_debut: d1||null, date_fin: d2||null,
      createur_tel: digits,
    })
    if (error) {
      alert('Erreur lors de la création : ' + error.message)
      setLoading(false)
      return
    }
    try {
      const participants = searchParams.get('participants')?.split(',').filter(Boolean) || []
      const sourceCode = searchParams.get('sourceCode') || null
      const { data: newTrip, error: fetchErr } = await supabase.from('trips').select('id').eq('code', code).single()
      if (fetchErr || !newTrip) throw new Error('Trip introuvable après création')
      // Créer membre créateur depuis prénom sauvegardé
      const prenomCreateur = (() => {
        try {
          const keys = Object.keys(localStorage)
          for (const k of keys) {
            if (!k.startsWith('crew2-')) continue
            const m = JSON.parse(localStorage.getItem(k) || '')
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
        if (newMembre) try { localStorage.setItem(`crew2-${code}`, JSON.stringify(newMembre)) } catch {}
      }
      if (participants.length > 0) {
        await supabase.from('participants_autorises').insert(
          participants.map(p => ({ trip_id: newTrip.id, prenom: p }))
        )
      }
      if (sourceCode) {
        const { data: src } = await supabase.from('trips').select('*').eq('code', sourceCode).single()
        if (src) {
          await supabase.from('trips').update({
            lodge_nom: src.lodge_nom, lodge_adresse: src.lodge_adresse,
            lodge_tel: src.lodge_tel, lodge_wifi: src.lodge_wifi,
            lodge_code: src.lodge_code, lodge_arrivee: src.lodge_arrivee,
            whatsapp_lien: src.whatsapp_lien,
          }).eq('id', newTrip.id)
          const { data: srcInfos } = await supabase.from('infos').select('*').eq('trip_id', src.id)
          if (srcInfos && srcInfos.length > 0) {
            type InfoInsert = Omit<typeof srcInfos[0], 'id'|'trip_id'|'created_at'>
            await supabase.from('infos').insert(
              srcInfos.map(({id: _id, trip_id: _tid, created_at: _cat, ...rest}: InfoInsert & {id:string,trip_id:string,created_at:string}) =>
                ({...rest, trip_id: newTrip.id}))
            )
          }
        }
      }
      try { localStorage.setItem('crew-last-trip', code) } catch {}
      router.push('/trip/' + code + '/created')
    } catch (err) {
      console.error('Erreur post-création:', err)
      try { localStorage.setItem('crew-last-trip', code) } catch {}
      router.push('/trip/' + code + '/created')
    }
  }

  function dupliquer(t: TripDB) {
    const params = new URLSearchParams({
      nom: t.nom, type: t.type,
      dest: t.destination || '',
      sourceCode: t.code,
    })
    router.push(`/?${params.toString()}`)
    setShowMesTrips(false)
    setD1(''); setD2('')
    setNom(t.nom); setType(t.type); setDest(t.destination||'')
  }

  function fmtDate(d?: string) {
    if (!d) return ''
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  const isDuplicate = searchParams.get('nom') !== null
  const telComplet = tel.replace(/\D/g,'').length === 10

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
        </div>

        {/* Mes trips depuis le numéro */}
        {telComplet && mesTrips.length > 0 && (
          <div style={{width:'100%',maxWidth:420,marginBottom:16}}>
            <button onClick={()=>setShowMesTrips(!showMesTrips)}
              style={{width:'100%',background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',
                borderRadius:12,padding:'10px 16px',color:'rgba(255,255,255,.85)',fontSize:13,
                fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <span>📋 Mes trips ({mesTrips.length})</span>
              <span style={{fontSize:16}}>{showMesTrips ? '▲' : '▼'}</span>
            </button>
            {showMesTrips && (
              <div style={{background:'rgba(255,255,255,.06)',borderRadius:12,border:'1px solid rgba(255,255,255,.1)',
                overflow:'hidden',marginTop:6}}>
                {mesTrips.map(t => (
                  <div key={t.code} style={{padding:'12px 14px',borderBottom:'1px solid rgba(255,255,255,.06)',
                    display:'flex',alignItems:'center',gap:10}}>
                    <div style={{fontSize:24,flexShrink:0}}>{TRIP_ICONS[t.type]||'🏕'}</div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontWeight:700,fontSize:14,color:'#fff',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.nom}</div>
                      {t.destination && <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginTop:1}}>{t.destination}</div>}
                      {t.date_debut && <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginTop:1}}>{fmtDate(t.date_debut)}{t.date_fin ? ` → ${fmtDate(t.date_fin)}` : ''}</div>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:5,flexShrink:0}}>
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
          </div>
        )}
        {loadingTrips && <div style={{color:'rgba(255,255,255,.4)',fontSize:13,marginBottom:16}}>Chargement de vos trips…</div>}

        {/* Formulaire */}
        <div style={{width:'100%',maxWidth:420,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:`1px solid ${isDuplicate?'rgba(255,255,255,.3)':'rgba(255,255,255,.1)'}`}}>
          {isDuplicate && (
            <div style={{background:'rgba(255,255,255,.1)',borderRadius:10,padding:'8px 12px',
              marginBottom:16,fontSize:13,color:'rgba(255,255,255,.75)',textAlign:'center'}}>
              📋 Duplication — ajustez les dates et créez
            </div>
          )}

          {/* Numéro de téléphone */}
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>VOTRE NUMÉRO DE TÉLÉPHONE</label>
            <input className="input"
              type="tel"
              placeholder="418 540 1111"
              value={tel}
              onChange={e=>onTelChange(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:`1.5px solid ${tel && !telComplet ? '#f87171' : telComplet ? '#4ade80' : 'rgba(255,255,255,.15)'}`,color:'#fff',letterSpacing:1}}
            />
            <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:5}}>
              {telComplet ? '✓ Numéro reconnu — vos trips sont chargés' : 'Identifie votre compte et regroupe tous vos trips'}
            </div>
          </div>

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
                <div style={{position:'relative'}}>
                  <input type="date" value={d1} onChange={e=>setD1(e.target.value)}
                    style={{width:'100%',padding:'12px 10px',borderRadius:10,border:'1.5px solid rgba(255,255,255,.25)',
                      background:'rgba(255,255,255,.15)',color:'#fff',fontSize:13,fontFamily:'inherit',outline:'none',colorScheme:'dark'}}/>
                  {!d1 && <span style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
                    fontSize:13,color:'rgba(255,255,255,.45)',pointerEvents:'none',letterSpacing:3}}>- -</span>}
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>FIN</div>
                <div style={{position:'relative'}}>
                  <input type="date" value={d2} onChange={e=>setD2(e.target.value)}
                    style={{width:'100%',padding:'12px 10px',borderRadius:10,border:'1.5px solid rgba(255,255,255,.25)',
                      background:'rgba(255,255,255,.15)',color:'#fff',fontSize:13,fontFamily:'inherit',outline:'none',colorScheme:'dark'}}/>
                  {!d2 && <span style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
                    fontSize:13,color:'rgba(255,255,255,.45)',pointerEvents:'none',letterSpacing:3}}>- -</span>}
                </div>
              </div>
            </div>
          </div>

          <button className="btn" onClick={creer} disabled={loading||!nom.trim()||!telComplet}
            style={{background:loading||!nom.trim()||!telComplet?'rgba(255,255,255,.15)':'#fff',
              color:loading||!nom.trim()||!telComplet?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700,marginTop:4}}>
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
