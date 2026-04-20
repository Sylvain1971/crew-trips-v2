'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { normalizeName, normalizeTel } from '@/lib/types'

function formatTel(val: string): string {
  const d = val.replace(/\D/g,'').slice(0,10)
  if (d.length<=3) return d
  if (d.length<=6) return `${d.slice(0,3)} ${d.slice(3)}`
  return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
}

export default function RetrouverPage() {
  const router = useRouter()
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [erreur, setErreur] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)

  const telComplet = normalizeTel(tel).length === 10
  const canSubmit = prenom.trim().length > 0 && nom.trim().length > 0 && telComplet && !loading

  async function chercher() {
    const prenomClean = prenom.trim()
    const nomClean = nom.trim()
    const digits = normalizeTel(tel)

    if (!prenomClean) { setErreur('Prénom requis.'); return }
    if (!nomClean) { setErreur('Nom de famille requis.'); return }
    if (digits.length !== 10) { setErreur('Numéro de téléphone requis (10 chiffres).'); return }

    setLoading(true); setErreur(null)

    // Match EXACT sur prenom + nom + tel dans membres
    const { data: candidats } = await supabase.from('membres')
      .select('id,prenom,nom,tel')
      .eq('tel', digits)

    if (!candidats || candidats.length === 0) {
      setErreur("Aucun participant ne correspond à ces informations. Utilisez votre lien d'invitation ou créez un nouveau trip.")
      setLoading(false); return
    }

    const match = candidats.find((m: { prenom: string; nom: string | null }) =>
      normalizeName(m.prenom) === normalizeName(prenomClean)
      && normalizeName(m.nom || '') === normalizeName(nomClean)
    )

    if (!match) {
      setErreur("Ces informations ne correspondent à aucun participant. Vérifiez votre prénom, nom et téléphone.")
      setLoading(false); return
    }

    try {
      localStorage.setItem('crew-tel-locked', formatTel(digits))
      localStorage.setItem('crew-tel', formatTel(digits))
      localStorage.setItem('crew-prenom', match.prenom)
      if (match.nom) localStorage.setItem('crew-nom', match.nom)
    } catch {}

    router.push('/mes-trips')
  }

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
        <div style={{fontSize:9,color:'rgba(255,255,255,.5)',letterSpacing:'.22em',textTransform:'uppercase',fontWeight:500}}>Retrouver mes trips</div>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 20px'}}>
        <div style={{width:'100%',maxWidth:360}}>

          <div style={{fontSize:13,color:'rgba(255,255,255,.6)',textAlign:'center',marginBottom:24,lineHeight:1.6,padding:'0 4px'}}>
            Entrez les informations que vous utilisez pour accéder à vos trips. Nous les comparerons à votre fiche dans un trip existant.
          </div>

          {/* Prénom */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Prénom
            </label>
            <input className="input" placeholder="Votre prénom" value={prenom}
              onChange={e=>{setPrenom(e.target.value); setErreur(null)}}
              autoFocus
              style={{fontSize:16,fontWeight:600,
                background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

          {/* Nom */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Nom de famille
            </label>
            <input className="input" placeholder="Votre nom de famille" value={nom}
              onChange={e=>{setNom(e.target.value); setErreur(null)}}
              style={{fontSize:16,fontWeight:600,
                background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

          {/* Téléphone */}
          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Numéro de téléphone
            </label>
            <input className="input" type="tel" placeholder="418 000 0000"
              value={tel}
              onChange={e=>{setTel(formatTel(e.target.value)); setErreur(null)}}
              onKeyDown={e=>e.key==='Enter' && canSubmit && chercher()}
              style={{fontSize:15,letterSpacing:1,
                background:'rgba(255,255,255,.06)',
                border:`1.5px solid ${tel && telComplet ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                color:'rgba(255,255,255,.85)'}}
            />
          </div>

          {erreur && (
            <div style={{background:'rgba(248,113,113,.15)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',marginBottom:14}}>
              <p style={{fontSize:13,color:'#fca5a5',textAlign:'center',lineHeight:1.5}}>{erreur}</p>
            </div>
          )}

          <button className="btn" onClick={chercher} disabled={!canSubmit}
            style={{background: !canSubmit ? 'rgba(255,255,255,.15)' : '#fff',
              color: !canSubmit ? 'rgba(255,255,255,.4)' : 'var(--forest)',fontWeight:700}}>
            {loading ? 'Vérification…' : 'Retrouver mes trips →'}
          </button>

          <p style={{fontSize:11,color:'rgba(255,255,255,.3)',marginTop:20,textAlign:'center',lineHeight:1.6}}>
            Vous n&apos;êtes dans aucun trip ? Cliquez sur &laquo;&nbsp;Retour&nbsp;&raquo; et créez un nouveau trip.
          </p>
        </div>
      </div>
    </main>
  )
}
