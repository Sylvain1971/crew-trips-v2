'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { TRIP_ICONS } from '@/lib/utils'

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
    const { data } = await supabase.from('trips')
      .select('code,nom,type,destination,date_debut,date_fin')
      .eq('createur_tel', digits)
      .order('created_at', { ascending: false })
    setTrips(data || [])
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
        <div style={{fontSize:36,marginBottom:4}}>🏕</div>
        <div style={{fontWeight:800,fontSize:22,color:'#fff',letterSpacing:'-.03em'}}>Crew Trips</div>
        <div style={{fontWeight:600,fontSize:15,color:'rgba(255,255,255,.6)',marginTop:4}}>Mes trips</div>
      </div>

      <div style={{flex:1,padding:'8px 20px 40px'}}>
        {/* Champ téléphone */}
        <div className="field" style={{maxWidth:420,margin:'0 auto 24px'}}>
          <label style={{color:'rgba(255,255,255,.5)'}}>VOTRE NUMÉRO DE TÉLÉPHONE</label>
          <input className="input"
            type="tel" placeholder="418 540 1111"
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
              <div style={{fontSize:40,marginBottom:12}}>📭</div>
              <div style={{color:'rgba(255,255,255,.5)',fontSize:14}}>Aucun trip trouvé pour ce numéro.</div>
              <button onClick={()=>router.push('/nouveau')}
                style={{marginTop:20,padding:'12px 24px',borderRadius:12,border:'none',background:'#fff',
                  color:'var(--forest)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
                Créer un nouveau trip →
              </button>
            </div>
          )}

          {trips.map((t, i) => (
            <div key={t.code} className="card" style={{marginBottom:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:12}}>
              <div style={{fontSize:28,flexShrink:0}}>{TRIP_ICONS[t.type]||'🏕'}</div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontWeight:700,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.nom}</div>
                {t.destination && <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>📍 {t.destination}</div>}
                {t.date_debut && <div style={{fontSize:12,color:'var(--text-3)',marginTop:1}}>📅 {fmtDate(t.date_debut)}{t.date_fin ? ` → ${fmtDate(t.date_fin)}` : ''}</div>}
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
                border:'1.5px solid var(--border)',background:'transparent',
                color:'var(--text-2)',fontWeight:600,fontSize:14,cursor:'pointer'}}>
              + Créer un nouveau trip
            </button>
          )}
        </div>
      </div>
    </main>
  )
}
