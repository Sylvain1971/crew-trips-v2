'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { TripIcon } from '@/lib/tripIcons'
import { SvgIcon } from '@/lib/svgIcons'

interface TripDB {
  code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  role: 'createur' | 'participant'
}

// États possibles de la page :
// - 'checking' : on vérifie le localStorage au mount (flash de chargement)
// - 'no-identity' : pas de verrou => on affiche l'écran "Identité requise"
// - 'authorized' : verrou présent => on charge et affiche les trips
type PageState = 'checking' | 'no-identity' | 'authorized'

export default function MesTripsPage() {
  const router = useRouter()
  const [tel, setTel] = useState('')
  const [trips, setTrips] = useState<TripDB[]>([])
  const [loading, setLoading] = useState(false)
  const [cherche, setCherche] = useState(false)
  const [pageState, setPageState] = useState<PageState>('checking')
  // Détecter si on est dans la PWA installée (mode standalone iOS/Android).
  // Important car iOS isole le localStorage entre Safari et la PWA
  // installée — un utilisateur deja authentifie dans Safari apparait
  // comme non-identifie dans la PWA au premier lancement.
  const [isStandalone, setIsStandalone] = useState(false)

  useEffect(() => {
    try {
      // Détecter le mode PWA standalone (iOS + Android)
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        // iOS specific
        (window.navigator as { standalone?: boolean }).standalone === true
      setIsStandalone(!!standalone)

      // Verrou : si une identité a été validée précédemment, on affiche les trips
      let locked = localStorage.getItem('crew-tel-locked')

      // Migration transparente : si l'utilisateur avait déjà un tel enregistré
      // (ancienne logique avant le verrou), on le promeut automatiquement pour
      // ne pas éjecter les utilisateurs existants au déploiement.
      if (!locked) {
        const oldTel = localStorage.getItem('crew-tel')
        if (oldTel && oldTel.replace(/\D/g,'').length === 10) {
          localStorage.setItem('crew-tel-locked', oldTel)
          locked = oldTel
        }
      }

      if (locked) {
        setTel(locked)
        setPageState('authorized')
        charger(locked)
      } else {
        setPageState('no-identity')
      }
    } catch {
      setPageState('no-identity')
    }
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
      const tripIds = membresParticipant.map((m: { trip_id: string }) => m.trip_id)
      const { data: tripsData } = await supabase.from('trips')
        .select('code,nom,type,destination,date_debut,date_fin')
        .in('id', tripIds)
        .order('created_at', { ascending: false })
      tripsParticipant = (tripsData || []).map((t: Omit<TripDB,'role'>) => ({ ...t, role: 'participant' as const }))
    }

    // Fusionner — créateurs en premier, sans doublons
    const codesCreateur = new Set((tripsCreateur || []).map((t: { code: string }) => t.code))
    const creeateurs: TripDB[] = (tripsCreateur || []).map((t: Omit<TripDB,'role'>) => ({ ...t, role: 'createur' as const }))
    const participants: TripDB[] = tripsParticipant.filter(t => !codesCreateur.has(t.code))

    setTrips([...creeateurs, ...participants])
    setLoading(false)
  }

  function fmtDate(d?: string) {
    if (!d) return ''
    return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  // =====================================================
  // Rendu : 3 états
  // =====================================================

  // État 1 : chargement initial (flash court le temps de lire localStorage)
  if (pageState === 'checking') {
    return (
      <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',alignItems:'center',justifyContent:'center'}}>
        <div style={{color:'rgba(255,255,255,.4)',fontSize:14}}>Chargement…</div>
      </main>
    )
  }

  // État 2 : pas d'identité sur cet appareil — écran "Identité requise"
  if (pageState === 'no-identity') {
    return (
      <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
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

        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'20px 24px',textAlign:'center'}}>
          <div style={{display:'inline-flex',width:80,height:80,borderRadius:20,background:'rgba(255,255,255,.08)',color:'rgba(255,255,255,.7)',alignItems:'center',justifyContent:'center',marginBottom:20}}>
            <SvgIcon name="lock" size={40} />
          </div>
          <div style={{fontSize:20,fontWeight:700,color:'#fff',marginBottom:10,letterSpacing:'-.02em'}}>
            {isStandalone ? 'Rejoindre un trip' : 'Identité requise'}
          </div>
          <div style={{fontSize:14,color:'rgba(255,255,255,.6)',lineHeight:1.6,maxWidth:340,marginBottom:28}}>
            {isStandalone
              ? <>Cette app et Safari ont chacun leur propre mémoire. Entrez le code ou cliquez sur le lien d&apos;invitation du trip que vous avez reçu — une seule connexion suffit.</>
              : <>Pour voir vos trips, rejoignez-en un via votre lien d&apos;invitation, ou créez-en un nouveau.</>
            }
          </div>

          <div style={{display:'flex',flexDirection:'column',gap:10,width:'100%',maxWidth:320}}>
            {isStandalone && (
              <button onClick={()=>router.push('/rejoindre')}
                style={{padding:'14px 20px',borderRadius:12,border:'none',background:'#fff',
                  color:'var(--forest)',fontWeight:700,fontSize:15,cursor:'pointer'}}>
                Rejoindre un trip existant →
              </button>
            )}
            <button onClick={()=>router.push('/nouveau')}
              style={isStandalone ? {
                padding:'13px 20px',borderRadius:12,
                border:'1.5px solid rgba(255,255,255,.25)',background:'transparent',
                color:'rgba(255,255,255,.9)',fontWeight:600,fontSize:14,cursor:'pointer'
              } : {
                padding:'14px 20px',borderRadius:12,border:'none',background:'#fff',
                color:'var(--forest)',fontWeight:700,fontSize:15,cursor:'pointer'
              }}>
              Créer un nouveau trip {isStandalone ? '' : '→'}
            </button>
            <button onClick={()=>router.push('/')}
              style={{padding:'13px 20px',borderRadius:12,
                border:'1.5px solid rgba(255,255,255,.2)',background:'transparent',
                color:'rgba(255,255,255,.8)',fontWeight:600,fontSize:14,cursor:'pointer'}}>
              Retour à l&apos;accueil
            </button>
          </div>

          <div style={{fontSize:11,color:'rgba(255,255,255,.3)',marginTop:24,lineHeight:1.6,maxWidth:300}}>
            {isStandalone
              ? <>iOS sépare les données entre Safari et les apps installées. Vous devrez vous identifier une fois ici.</>
              : <>Un appareil est lié à un seul participant pour des raisons de sécurité.</>
            }
          </div>
        </div>
      </main>
    )
  }

  // État 3 : autorisé — on affiche la liste des trips
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
        {/* Identité verrouillée (lecture seule, pas d'input) */}
        <div className="field" style={{maxWidth:420,margin:'0 auto 24px'}}>
          <label style={{color:'rgba(255,255,255,.5)',textAlign:'center',display:'block'}}>
            🔒 IDENTITÉ VERROUILLÉE SUR CET APPAREIL
          </label>
          <div style={{
            background:'rgba(255,255,255,.04)',
            border:'1.5px solid rgba(255,255,255,.15)',
            borderRadius:10,
            padding:'14px 16px',
            color:'rgba(255,255,255,.75)',
            letterSpacing:1,
            fontSize:18,
            textAlign:'center',
            fontWeight:600,
          }}>
            {tel}
          </div>
          <div style={{fontSize:11,color:'rgba(255,255,255,.45)',marginTop:6,textAlign:'center',lineHeight:1.5}}>
            Pour des raisons de sécurité, un appareil est lié à un seul participant.
          </div>
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
            </div>
          )}

          {trips.map((t) => (
            <div key={t.code} className="card" style={{marginBottom:10,padding:'14px 16px',display:'flex',alignItems:'center',gap:12}}>
              <div style={{flexShrink:0,width:56,height:56}}>
                <TripIcon type={t.type} size={56} />
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{display:'flex',alignItems:'center',gap:6,marginBottom:2}}>
                  <div style={{fontWeight:700,fontSize:15,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{t.nom}</div>
                  {t.role==='createur' && (
                    <span title="Admin" aria-label="Admin" style={{color:'#F59E0B',display:'inline-flex',flexShrink:0}}>
                      <SvgIcon name="star" size={13} />
                    </span>
                  )}
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
        </div>
      </div>
    </main>
  )
}
