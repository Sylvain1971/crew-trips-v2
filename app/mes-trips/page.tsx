'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { TripIcon } from '@/lib/tripIcons'
import { SvgIcon } from '@/lib/svgIcons'

function formatTel(val: string): string {
  const digits = val.replace(/\D/g, '').slice(0, 10)
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

interface TripDB {
  code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  role: 'createur' | 'participant'
}

export default function MesTripsPage() {
  const router = useRouter()
  const [tel, setTel] = useState('')
  const [trips, setTrips] = useState<TripDB[]>([])
  const [loading, setLoading] = useState(false)
  const [cherche, setCherche] = useState(false)

  const telComplet = tel.replace(/\D/g,'').length === 10

  useEffect(() => {
    try {
      const saved = localStorage.getItem('crew-tel')
      if (saved) { setTel(saved); charger(saved) }
    } catch {}
  }, [])

  async function charger(numero: string) {
    const digits = numero.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoading(true); setCherche(true)

    // 1. Trips créés (createur_tel)
    const { data: tripsCreateur } = await supabase.from('trips')
      .select('code,nom,type,destination,date_debut,date_fin')
      .eq('createur_tel', digits)
      .order('created_at', { ascending: false })

    // 2. Trips rejoints comme participant (membres.tel)
    const { data: membresParticipant } = await supabase.from('membres')
      .select('trip_id, is_createur')
      .eq('tel', digits)
      .eq('is_createur', false)

    let tripsParticipant: TripDB[] = []
    if (membresParticipant && membresParticipant.length > 0) {
      const tripIds = membresParticipant.map((m: any) => m.trip_id)
      const { data: tripsData } = await supabase.from('trips')
        .select('code,nom,type,destination,date_debut,date_fin')
        .in('id', tripIds)
        .order('created_at', { ascending: false })
      tripsParticipant = (tripsData || []).map((t: any) => ({ ...t, role: 'participant' as const }))
    }

    // Fusionner — créateurs en premier, sans doublons
    const codesCreateur = new Set((tripsCreateur || []).map((t: any) => t.code))
    const creeateurs: TripDB[] = (tripsCreateur || []).map((t: any) => ({ ...t, role: 'createur' as const }))
    const participants: TripDB[] = tripsParticipant.filter(t => !codesCreateur.has(t.code))

    setTrips([...creeateurs, ...participants])
    setLoading(false)
  }

  function onTelChange(val: string) {
    const formatted = formatTel(val)
    setTel(formatted)
    const digits = formatted.replace(/\D/g, '')
    if (digits.length === 10) {
      try { localStorage.setItem('crew-tel', formatted) } catch {}
      charger(formatted)
    } else {
      setTrips([]); setCherche(false)
    }
  }

  function fmtDate(d?: string) {
    if (!d) return ''
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{background:'var(--forest)',padding:'16px 20px 20px',display:'flex',flexDirection:'column',alignItems:'center',position:'relative'}}>
        <button onClick={()=>router.push('/')}
          style={{position:'absolute',top:16,left:20,background:'rgba(255,255,255,.1)',border:'none',borderRadius:10,padding:'8px 12px',color:'#fff',cursor:'pointer',fontSize:14}}>
          ← Retour
        </button>
        <div style={{marginBottom:4}}>
          <Image src="/logo-hero.webp" alt="Crew Trips" width={90} height={90} />
        </div>
        <div style={{fontFamily:'var(--font-brand), Georgia, serif',fontWeight:700,fontSize:20,color:'#fff',letterSpacing:'-.02em',lineHeight:1,marginBottom:6}}>Crew Trips</div>
        <div style={{fontSize:9,color:'rgba(255,255,255,.5)',letterSpacing:'.22em',textTransform:'uppercase',fontWeight:500}}>Mes trips</div>
      </div>

      <div style={{flex:1,padding:'16px 20px 40px'}}>
        {/* Champ téléphone */}
        <div className="field" style={{maxWidth:420,margin:'0 auto 24px'}}>
          <label style={{color:'rgba(255,255,255,.5)',textAlign:'center',display:'block'}}>VOTRE NUMÉRO DE TÉLÉPHONE</label>
          <input className="input"
            type="tel" placeholder="ex : 418 000 0000"
            value={tel} onChange={e=>onTelChange(e.target.value)}
            autoFocus
            style={{background:'rgba(255,255,255,.08)',
              border:`1.5px solid ${tel && !telComplet ? '#f87171' : telComplet ? '#4ade80' : 'rgba(255,255,255,.15)'}`,
              color:'#fff',letterSpacing:1,fontSize:18,textAlign:'center'}}
          />
          {telComplet && <div style={{fontSize:11,color:'#4ade80',marginTop:5,textAlign:'center'}}>✓ Numéro reconnu</div>}
        </div>

        {/* Liste des trips */}
        <div style={{maxWidth:420,margin:'0 auto'}}>
          {loading && (
            <div style={{textAlign:'center',color:'rgba(255,255,255,.4)',fontSize:14,padding:32}}>
              Chargement…
            </div>
          )}

          {!loading && cherche && trips.length === 0 && (
            <div style={{textAlign:'center',padding:40}}>
              <div style={{display:'inline-flex',width:72,height:72,borderRadius:16,background:'rgba(255,255,255,.08)',color:'rgba(255,255,255,.5)',alignItems:'center',justifyContent:'center',marginBottom:12}}>
                <SvgIcon name="clipboard" size={36} />
              </div>
              <div style={{color:'rgba(255,255,255,.5)',fontSize:14}}>Aucun trip trouvé pour ce numéro.</div>
              <button onClick={()=>router.push('/nouveau')}
                style={{marginTop:20,padding:'12px 24px',borderRadius:12,border:'none',background:'#fff',
                  color:'var(--forest)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
                Créer un nouveau trip →
              </button>
            </div>
          )}

          {trips.map((t) => (
            <div key={t.code} className="card" style={{marginBottom:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:12}}>
              <div style={{flexShrink:0,width:36,height:36}}>
                <TripIcon type={t.type} size={36} />
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                  <div style={{fontWeight:700,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.nom}</div>
                  <span style={{fontSize:10,fontWeight:700,padding:'2px 7px',borderRadius:20,flexShrink:0,
                    background:'rgba(0,0,0,.08)',color:'var(--text-3)',display:'inline-flex',alignItems:'center',gap:3}}>
                    {t.role==='createur' ? <><SvgIcon name="star" size={10} />Admin</> : 'Participant'}
                  </span>
                </div>
                {t.destination && <div style={{fontSize:12,color:'var(--text-3)',marginTop:2,display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="pin" size={11} /> {t.destination}</div>}
                {t.date_debut && <div style={{fontSize:12,color:'var(--text-3)',marginTop:1,display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="calendar" size={11} /> {fmtDate(t.date_debut)}{t.date_fin ? ` → ${fmtDate(t.date_fin)}` : ''}</div>}
              </div>
              <button onClick={()=>router.push(`/trip/${t.code}`)}
                style={{padding:'8px 14px',borderRadius:10,border:'none',background:'var(--forest)',
                  color:'#fff',fontWeight:700,fontSize:13,cursor:'pointer',flexShrink:0}}>
                Ouvrir →
              </button>
            </div>
          ))}

          {trips.length > 0 && (
            <button onClick={()=>router.push('/nouveau')}
              style={{width:'100%',marginTop:8,padding:'12px',borderRadius:12,
                border:'1.5px solid rgba(255,255,255,.15)',background:'transparent',
                color:'rgba(255,255,255,.6)',fontWeight:600,fontSize:14,cursor:'pointer'}}>
              + Créer un nouveau trip
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
