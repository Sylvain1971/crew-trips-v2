'use client'
import { useState, useEffect, Suspense } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getTripExamples } from '@/lib/utils'
import { TripIcon } from '@/lib/tripIcons'
import { COULEURS_MEMBRES } from '@/lib/types'
import { SvgIcon } from '@/lib/svgIcons'

function genCode() {
  return Array.from({length:6},()=>'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*32)]).join('')
}
function formatTel(val: string): string {
  const digits = val.replace(/\D/g,'').slice(0,10)
  if (digits.length<=3) return digits
  if (digits.length<=6) return `${digits.slice(0,3)} ${digits.slice(3)}`
  return `${digits.slice(0,3)} ${digits.slice(3,6)} ${digits.slice(6)}`
}

function NouveauInner() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [codeAcces, setCodeAcces] = useState('')
  const [codeValide, setCodeValide] = useState(false)
  const [codeErreur, setCodeErreur] = useState(false)
  const [showPwd, setShowPwd] = useState(false)
  const [tel, setTel] = useState('')
  const [nom, setNom] = useState(searchParams.get('nom')||'')
  const [type, setType] = useState(searchParams.get('type')||'peche')
  const [dest, setDest] = useState(searchParams.get('dest')||'')
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [prenom, setPrenom] = useState('')
  const [nomFamille, setNomFamille] = useState('')
  const [loading, setLoading] = useState(false)

  const telComplet = tel.replace(/\D/g,'').length === 10
  const prenomOk = prenom.trim().length >= 1
  const nomFamilleOk = nomFamille.trim().length >= 1
  const isDuplicate = searchParams.get('nom') !== null

  useEffect(() => {
    try {
      const saved = localStorage.getItem('crew-tel')
      if (saved) setTel(saved)
      const savedPrenom = localStorage.getItem('crew-prenom')
      if (savedPrenom) setPrenom(savedPrenom)
      const savedNomFamille = localStorage.getItem('crew-nom')
      if (savedNomFamille) setNomFamille(savedNomFamille)
      // Vérifier si le code créateur est déjà validé en session
      const sessionCode = sessionStorage.getItem('crew-creator-validated')
      if (sessionCode === '1') setCodeValide(true)
    } catch {}
  }, [])

  function validerCode() {
    supabase.from('config').select('value').eq('key', 'creator_code').single()
      .then(({ data }) => {
        const creatorCode = data?.value || ''
        if (codeAcces.trim() === creatorCode && creatorCode !== '') {
          setCodeValide(true)
          setCodeErreur(false)
          try { sessionStorage.setItem('crew-creator-validated', '1') } catch {}
        } else {
          setCodeErreur(true)
        }
      })
  }

  function onTelChange(val: string) {
    const f = formatTel(val)
    setTel(f)
    if (f.replace(/\D/g,'').length === 10) try { localStorage.setItem('crew-tel', f) } catch {}
  }

  async function creer() {
    if (!nom.trim() || !telComplet || !prenomOk || !nomFamilleOk) return
    setLoading(true)
    try {
      localStorage.setItem('crew-prenom', prenom.trim())
      localStorage.setItem('crew-nom', nomFamille.trim())
      localStorage.setItem('crew-tel-locked', tel)
    } catch {}
    const digits = tel.replace(/\D/g,'')
    const code = genCode()
    const { error } = await supabase.from('trips').insert({
      code, nom: nom.trim(), type,
      destination: dest.trim()||null,
      date_debut: d1||null, date_fin: d2||null,
      createur_tel: digits,
    })
    if (error) { alert('Erreur : ' + error.message); setLoading(false); return }
    try {
      const sourceCode = searchParams.get('sourceCode') || null
      const { data: newTrip } = await supabase.from('trips').select('id').eq('code', code).single()
      if (!newTrip) throw new Error('Trip introuvable')
      // Créer membre créateur avec le prénom + nom saisis
      if (prenom.trim() && nomFamille.trim()) {
        const couleur = COULEURS_MEMBRES[Math.floor(Math.random()*COULEURS_MEMBRES.length)]
        const { data: newMembre } = await supabase.from('membres')
          .insert({ trip_id: newTrip.id, prenom: prenom.trim(), nom: nomFamille.trim(), couleur, is_createur: true, tel: digits })
          .select().single()
        if (newMembre) try { localStorage.setItem(`crew2-${code}`, JSON.stringify(newMembre)) } catch {}
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
          if (srcInfos?.length) {
            type II = Omit<typeof srcInfos[0],'id'|'trip_id'|'created_at'>
            await supabase.from('infos').insert(
              srcInfos.map(({id:_i,trip_id:_t,created_at:_c,...rest}:II&{id:string,trip_id:string,created_at:string})=>({...rest,trip_id:newTrip.id}))
            )
          }
        }
      }
      try { localStorage.setItem('crew-last-trip', code) } catch {}
      router.push('/trip/' + code + '/created')
    } catch (err) {
      console.error(err)
      try { localStorage.setItem('crew-last-trip', code) } catch {}
      router.push('/trip/' + code + '/created')
    }
  }

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      {/* Header */}
      <div style={{background:'var(--forest)',padding:'16px 20px 20px',borderBottom:'1px solid rgba(255,255,255,.08)',display:'flex',flexDirection:'column',alignItems:'center',position:'relative'}}>
        <button onClick={()=>router.push('/')}
          style={{position:'absolute',top:16,left:20,background:'rgba(255,255,255,.1)',border:'none',borderRadius:10,padding:'8px 12px',color:'#fff',cursor:'pointer',fontSize:14}}>
          ← Retour
        </button>
        <div style={{marginBottom:4,width:64,height:64}}>
          <TripIcon type={type} size={64} />
        </div>
        <div style={{fontFamily:'var(--font-brand), Georgia, serif',fontWeight:700,fontSize:20,color:'#fff',letterSpacing:'-.02em',lineHeight:1,marginBottom:6}}>Crew Trips</div>
        <div style={{fontSize:9,color:'rgba(255,255,255,.5)',letterSpacing:'.22em',textTransform:'uppercase',fontWeight:500}}>
          {isDuplicate ? 'DUPLIQUER UN TRIP' : 'NOUVEAU TRIP'}
        </div>
      </div>

      {/* Écran code secret */}
      {!codeValide ? (
        <div style={{flex:1,display:'flex',alignItems:'center',justifyContent:'center',padding:24}}>
          <div style={{width:'100%',maxWidth:340}}>
            <div style={{textAlign:'center',marginBottom:24}}>
              <div style={{fontSize:36,marginBottom:8}}>🔑</div>
              <div style={{fontWeight:700,fontSize:18,color:'#fff',marginBottom:6}}>Code de création requis</div>
              <div style={{fontSize:13,color:'rgba(255,255,255,.45)',lineHeight:1.5}}>
                Contactez l'administrateur pour obtenir le code.
              </div>
            </div>
            <div style={{position:'relative'}}>
              <input className="input" type={showPwd ? 'text' : 'password'} placeholder="Code secret"
                value={codeAcces} onChange={e=>{setCodeAcces(e.target.value);setCodeErreur(false)}}
                onKeyDown={e=>e.key==='Enter'&&validerCode()}
                style={{background:'rgba(255,255,255,.08)',
                  border:`1.5px solid ${codeErreur?'#f87171':'rgba(255,255,255,.15)'}`,
                  color:'#fff',textAlign:'center',fontSize:16,marginBottom:8,letterSpacing:2,paddingRight:44}}/>
              <button onClick={()=>setShowPwd(p=>!p)}
                style={{position:'absolute',right:12,top:13,background:'none',border:'none',cursor:'pointer',color:'rgba(255,255,255,.4)',padding:0,lineHeight:1}}>
                {showPwd
                  ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                }
              </button>
            </div>
            {codeErreur && <div style={{color:'#fca5a5',fontSize:13,textAlign:'center',marginBottom:8}}>Code incorrect</div>}
            <button className="btn" onClick={validerCode} disabled={!codeAcces.trim()}
              style={{background:codeAcces.trim()?'#fff':'rgba(255,255,255,.15)',
                color:codeAcces.trim()?'var(--forest)':'rgba(255,255,255,.4)',fontWeight:700}}>
              Continuer →
            </button>
          </div>
        </div>
      ) : (
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'8px 20px 40px'}}>
        <div style={{width:'100%',maxWidth:420}}>
          {isDuplicate && (
            <div style={{background:'rgba(255,255,255,.1)',borderRadius:10,padding:'10px 14px',
              marginBottom:16,fontSize:13,color:'rgba(255,255,255,.75)',textAlign:'center',
              display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%',boxSizing:'border-box'}}>
              <SvgIcon name="clipboard" size={14} /> Duplication — ajustez les dates et créez
            </div>
          )}

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)',textAlign:'center',display:'block'}}>VOTRE NUMÉRO DE TÉLÉPHONE</label>
            <input className="input" type="tel" placeholder="ex : 418 000 0000"
              value={tel} onChange={e=>onTelChange(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${tel && !telComplet?'#f87171':telComplet?'#4ade80':'rgba(255,255,255,.15)'}`,
                color:'#fff',letterSpacing:1,textAlign:'center'}}/>
            <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:5,textAlign:'center'}}>
              Identifie votre compte créateur
            </div>
          </div>

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>VOTRE PRÉNOM</label>
            <input className="input" placeholder="ex : Sylvain"
              value={prenom} onChange={e=>setPrenom(e.target.value)}
              onBlur={()=>{ try { localStorage.setItem('crew-prenom', prenom.trim()) } catch {} }}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}/>
          </div>

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>VOTRE NOM DE FAMILLE</label>
            <input className="input" placeholder="ex : Bergeron"
              value={nomFamille} onChange={e=>setNomFamille(e.target.value)}
              onBlur={()=>{ try { localStorage.setItem('crew-nom', nomFamille.trim()) } catch {} }}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}/>
            <div style={{fontSize:11,color:'rgba(255,255,255,.35)',marginTop:5}}>
              Deviendra votre nom d&apos;administrateur dans ce trip
            </div>
          </div>

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>NOM DU TRIP</label>
            <input className="input" placeholder={`Ex: ${getTripExamples(type).nom}`}
              value={nom} onChange={e=>setNom(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}
              onFocus={e=>{e.target.style.border='1.5px solid rgba(255,255,255,.4)'}}
              onBlur={e=>{e.target.style.border='1.5px solid rgba(255,255,255,.15)'}}/>
          </div>

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>ACTIVITÉ</label>
            <select className="input" value={type} onChange={e=>setType(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}>
              <option value="peche" style={{background:'#1a3a1a',color:'#fff'}}>Pêche à la mouche</option>
              <option value="ski" style={{background:'#1a3a1a',color:'#fff'}}>Ski alpin</option>
              <option value="motoneige" style={{background:'#1a3a1a',color:'#fff'}}>Motoneige</option>
              <option value="hike" style={{background:'#1a3a1a',color:'#fff'}}>Randonnée / Hike</option>
              <option value="velo" style={{background:'#1a3a1a',color:'#fff'}}>Vélo / Mountain Bike</option>
              <option value="chasse" style={{background:'#1a3a1a',color:'#fff'}}>Chasse</option>
              <option value="yoga" style={{background:'#1a3a1a',color:'#fff'}}>Yoga</option>
              <option value="soleil" style={{background:'#1a3a1a',color:'#fff'}}>Soleil & Plage</option>
              <option value="autre" style={{background:'#1a3a1a',color:'#fff'}}>Autre</option>
            </select>
          </div>

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>DESTINATION</label>
            <input className="input" placeholder={`Ex: ${getTripExamples(type).dest}`}
              value={dest} onChange={e=>setDest(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}/>
          </div>

          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>DATES</label>
            <div style={{display:'flex',gap:8}}>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>DÉBUT</div>
                <div style={{position:'relative',height:50}}>
                  <input type="date" value={d1} onChange={e=>setD1(e.target.value)}
                    style={{position:'absolute',inset:0,width:'100%',height:'100%',padding:'0 15px',borderRadius:10,
                      border:'1.5px solid rgba(255,255,255,.15)',background:'rgba(255,255,255,.08)',
                      color:d1?'#fff':'transparent',fontSize:15,fontFamily:'inherit',outline:'none',
                      colorScheme:'dark',boxSizing:'border-box'}}/>
                  {!d1 && <span style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
                    fontSize:20,color:'rgba(255,255,255,.3)',pointerEvents:'none'}}>–</span>}
                </div>
              </div>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,.5)',fontWeight:700,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>FIN</div>
                <div style={{position:'relative',height:50}}>
                  <input type="date" value={d2} onChange={e=>setD2(e.target.value)}
                    style={{position:'absolute',inset:0,width:'100%',height:'100%',padding:'0 15px',borderRadius:10,
                      border:'1.5px solid rgba(255,255,255,.15)',background:'rgba(255,255,255,.08)',
                      color:d2?'#fff':'transparent',fontSize:15,fontFamily:'inherit',outline:'none',
                      colorScheme:'dark',boxSizing:'border-box'}}/>
                  {!d2 && <span style={{position:'absolute',top:'50%',left:'50%',transform:'translate(-50%,-50%)',
                    fontSize:20,color:'rgba(255,255,255,.3)',pointerEvents:'none'}}>–</span>}
                </div>
              </div>
            </div>
          </div>

          <button className="btn" onClick={creer} disabled={loading||!nom.trim()||!telComplet||!prenomOk||!nomFamilleOk}
            style={{background:loading||!nom.trim()||!telComplet||!prenomOk||!nomFamilleOk?'rgba(255,255,255,.15)':'#fff',
              color:loading||!nom.trim()||!telComplet||!prenomOk||!nomFamilleOk?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700,marginTop:4}}>
            {loading?'Création en cours…':isDuplicate?'Créer ce nouveau trip →':'Créer le trip →'}
          </button>
        </div>
      </div>
      )}
    </main>
  )
}

export default function NouveauPage() {
  return (
    <Suspense fallback={<div style={{minHeight:'100dvh',background:'var(--forest)'}}/>}>
      <NouveauInner/>
    </Suspense>
  )
}
