'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { normalizeName, normalizeTel } from '@/lib/types'

// Même code admin que /admin — défini dans .env.local :
//   NEXT_PUBLIC_ADMIN_CODE=ton_code_secret
const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? ''

function formatTel(val: string): string {
  const d = val.replace(/\D/g,'').slice(0,10)
  if (d.length<=3) return d
  if (d.length<=6) return `${d.slice(0,3)} ${d.slice(3)}`
  return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
}

export default function AdminRetrouverPage() {
  const router = useRouter()

  // Protection admin : obligatoire d'entrer le code secret avant d'accéder au formulaire.
  // Réutilise la session admin partagée (posée par /admin au login) pour éviter
  // de redemander le code si on vient de /admin.
  const [code, setCode] = useState('')
  const [auth, setAuth] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [loginErreur, setLoginErreur] = useState('')

  // Au mount, vérifier si une session admin existe déjà
  useEffect(() => {
    try {
      if (sessionStorage.getItem('crew-admin-authed') === '1') setAuth(true)
    } catch {}
  }, [])

  // Formulaire de recherche
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [erreur, setErreur] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)

  const telComplet = normalizeTel(tel).length === 10
  const canSubmit = prenom.trim().length > 0 && nom.trim().length > 0 && telComplet && !loading

  function login() {
    if (!ADMIN_CODE) {
      setLoginErreur('NEXT_PUBLIC_ADMIN_CODE non configuré.')
      return
    }
    if (code === ADMIN_CODE) {
      setAuth(true); setLoginErreur('')
      try { sessionStorage.setItem('crew-admin-authed', '1') } catch {}
    }
    else setLoginErreur('Code incorrect')
  }

  async function chercher() {
    const prenomClean = prenom.trim()
    const nomClean = nom.trim()
    const digits = normalizeTel(tel)

    if (!prenomClean) { setErreur('Prénom requis.'); return }
    if (!nomClean) { setErreur('Nom de famille requis.'); return }
    if (digits.length !== 10) { setErreur('Numéro de téléphone requis (10 chiffres).'); return }

    setLoading(true); setErreur(null)

    const { data: candidats } = await supabase.from('membres')
      .select('id,prenom,nom,tel')
      .eq('tel', digits)

    if (!candidats || candidats.length === 0) {
      setErreur("Aucun participant ne correspond à ces informations.")
      setLoading(false); return
    }

    const match = candidats.find((m: { prenom: string; nom: string | null }) =>
      normalizeName(m.prenom) === normalizeName(prenomClean)
      && normalizeName(m.nom || '') === normalizeName(nomClean)
    )

    if (!match) {
      setErreur("Ces informations ne correspondent à aucun participant. Vérifiez le prénom, le nom et le téléphone.")
      setLoading(false); return
    }

    // Poser le verrou d'identité + redirection
    try {
      localStorage.setItem('crew-tel-locked', formatTel(digits))
      localStorage.setItem('crew-tel', formatTel(digits))
      localStorage.setItem('crew-prenom', match.prenom)
      if (match.nom) localStorage.setItem('crew-nom', match.nom)
    } catch (e) {
      setErreur('Impossible de sauvegarder l\'identité localement : ' + (e instanceof Error ? e.message : String(e)))
      setLoading(false); return
    }

    // Forcer un hard reload pour que /mes-trips relise le localStorage proprement
    // (router.push() garde le state React et peut créer des problèmes de timing
    // sur le premier mount de /mes-trips).
    window.location.href = '/mes-trips'
  }

  // Écran login admin
  if (!auth) return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:24,position:'relative'}}>
      <button onClick={()=>router.push('/admin')}
        style={{position:'absolute',top:20,left:20,background:'rgba(255,255,255,.1)',border:'none',borderRadius:10,padding:'8px 14px',color:'rgba(255,255,255,.7)',fontSize:14,fontWeight:600,cursor:'pointer'}}>
        ← Admin
      </button>
      <div style={{width:'100%',maxWidth:340,background:'rgba(255,255,255,.06)',borderRadius:20,padding:28,border:'1px solid rgba(255,255,255,.1)'}}>
        <div style={{textAlign:'center',marginBottom:24}}>
          <div style={{fontSize:40,marginBottom:10}}>🔐</div>
          <div style={{fontWeight:800,fontSize:20,color:'#fff'}}>Retrouver un utilisateur</div>
          <div style={{fontSize:13,color:'rgba(255,255,255,.4)',marginTop:6}}>Accès restreint · Code admin requis</div>
        </div>
        <div style={{position:'relative'}}>
          <input className="input" type={showPwd ? 'text' : 'password'} placeholder="Code d'accès admin"
            value={code} onChange={e=>setCode(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&login()}
            style={{background:'rgba(255,255,255,.08)',border:`1.5px solid ${loginErreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff',marginBottom:10,textAlign:'center',paddingRight:44}} />
          <button onClick={()=>setShowPwd(p=>!p)}
            style={{position:'absolute',right:12,top:13,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',padding:0,lineHeight:1}}>
            {showPwd
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
        </div>
        {loginErreur && <div style={{color:'#fca5a5',fontSize:13,textAlign:'center',marginBottom:10}}>{loginErreur}</div>}
        <button className="btn" onClick={login} style={{background:'#fff',color:'var(--forest)',fontWeight:700}}>Entrer →</button>
      </div>
    </main>
  )

  // Écran formulaire de recherche (authentifié)
  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      <div style={{background:'var(--forest)',padding:'16px 20px 20px',display:'flex',flexDirection:'column',alignItems:'center',position:'relative'}}>
        <button onClick={()=>router.push('/admin')}
          style={{position:'absolute',top:16,left:20,background:'rgba(255,255,255,.1)',border:'none',borderRadius:10,padding:'8px 12px',color:'#fff',cursor:'pointer',fontSize:14}}>
          ← Admin
        </button>
        <div style={{marginBottom:4}}>
          <Image src="/logo-hero.webp" alt="Crew Trips" width={90} height={90} />
        </div>
        <div style={{fontFamily:'var(--font-brand), Georgia, serif',fontWeight:700,fontSize:20,color:'#fff',letterSpacing:'-.02em',lineHeight:1,marginBottom:6}}>Crew Trips</div>
        <div style={{fontSize:9,color:'rgba(255,255,255,.5)',letterSpacing:'.22em',textTransform:'uppercase',fontWeight:500}}>Retrouver un utilisateur</div>
      </div>

      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'24px 20px'}}>
        <div style={{width:'100%',maxWidth:360}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,.6)',textAlign:'center',marginBottom:24,lineHeight:1.6,padding:'0 4px'}}>
            Outil admin : recréer le verrou d&apos;identité sur cet appareil en saisissant le prénom, le nom et le téléphone d&apos;un participant existant.
          </div>

          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Prénom
            </label>
            <input className="input" placeholder="Prénom du participant" value={prenom}
              onChange={e=>{setPrenom(e.target.value); setErreur(null)}}
              autoFocus
              style={{fontSize:16,fontWeight:600,
                background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Nom de famille
            </label>
            <input className="input" placeholder="Nom de famille du participant" value={nom}
              onChange={e=>{setNom(e.target.value); setErreur(null)}}
              style={{fontSize:16,fontWeight:600,
                background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

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
            {loading ? 'Vérification…' : 'Retrouver et poser le verrou →'}
          </button>
        </div>
      </div>
    </main>
  )
}
