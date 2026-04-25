'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  matchParticipant,
  normalizeName,
  normalizeTel,
  hashNip,
  isValidNip,
} from '@/lib/types'
import { countdown } from '@/lib/utils'
import { apiJoinTrip, apiRegisterMember } from '@/lib/api'
import { TripIcon } from '@/lib/tripIcons'
import { SvgIcon } from '@/lib/svgIcons'
import type { Trip, Membre, ParticipantAutorise } from '@/lib/types'

function fmt(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
}

function formatTel(val: string): string {
  const d = val.replace(/\D/g,'').slice(0,10)
  if (d.length<=3) return d
  if (d.length<=6) return `${d.slice(0,3)} ${d.slice(3)}`
  return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
}

// Rate limiting: cle localStorage pour traquer les tentatives echouees
// sur CET appareil (tous trips confondus). Valeur = {count, until}.
const RL_KEY = 'crew-nip-rate-limit'
const RL_MAX_ATTEMPTS = 3
const RL_BLOCK_MS = 15 * 60 * 1000 // 15 minutes

function getRateLimit(): { blocked: boolean; remainingMin: number; attempts: number } {
  try {
    const raw = localStorage.getItem(RL_KEY)
    if (!raw) return { blocked: false, remainingMin: 0, attempts: 0 }
    const { count, until } = JSON.parse(raw) as { count: number; until: number }
    const now = Date.now()
    if (until && now < until) {
      return { blocked: true, remainingMin: Math.ceil((until - now) / 60000), attempts: count }
    }
    // Expire: reset
    if (until && now >= until) {
      localStorage.removeItem(RL_KEY)
      return { blocked: false, remainingMin: 0, attempts: 0 }
    }
    return { blocked: false, remainingMin: 0, attempts: count || 0 }
  } catch { return { blocked: false, remainingMin: 0, attempts: 0 } }
}

function bumpRateLimit(): number {
  try {
    const raw = localStorage.getItem(RL_KEY)
    const prev = raw ? JSON.parse(raw) as { count: number; until: number } : { count: 0, until: 0 }
    const count = (prev.count || 0) + 1
    const until = count >= RL_MAX_ATTEMPTS ? Date.now() + RL_BLOCK_MS : 0
    localStorage.setItem(RL_KEY, JSON.stringify({ count, until }))
    return count
  } catch { return 0 }
}

function resetRateLimit() {
  try { localStorage.removeItem(RL_KEY) } catch {}
}

// Mode d'entrée sur JoinScreen.
// - 'choice': écran de choix initial (reconnexion ou inscription)
// - 'reconnexion': tel + NIP pour les participants déjà inscrits
// - 'inscription': prénom + nom + tel + NIP pour la 1re inscription
// - 'creer-nip': migration douce — utilisateur existant sans NIP en DB
type Mode = 'choice' | 'reconnexion' | 'inscription' | 'creer-nip'

export default function JoinScreen({trip,autorises,onJoin}:{
  trip:Trip, autorises:ParticipantAutorise[], onJoin:(m:Membre)=>void
}) {
  const [mode, setMode] = useState<Mode>('choice')
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [nip, setNip] = useState('')
  const [showNip, setShowNip] = useState(false)
  const [erreur, setErreur] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [cd, setCd] = useState(()=>countdown(trip.date_debut))
  const [isStandalone, setIsStandalone] = useState(false)
  // Pour mode 'creer-nip': on stocke le membre DB existant dont le NIP est null
  const [pendingMembre, setPendingMembre] = useState<Membre|null>(null)

  useEffect(()=>{
    const t = setInterval(()=>setCd(countdown(trip.date_debut)), 60000)
    try {
      const saved = localStorage.getItem('crew-tel'); if (saved) setTel(saved)
      const savedPrenom = localStorage.getItem('crew-prenom'); if (savedPrenom) setPrenom(savedPrenom)
      const savedNom = localStorage.getItem('crew-nom'); if (savedNom) setNom(savedNom)

      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true
      setIsStandalone(!!standalone)

      if (standalone) { setMode('reconnexion') }
    } catch {}
    return ()=>clearInterval(t)
  },[trip.date_debut])

  const listeActive = autorises.length > 0
  const telComplet = normalizeTel(tel).length === 10
  const nipValide = isValidNip(nip)

  function onChangeTel(val: string) {
    const f = formatTel(val)
    setTel(f)
    setErreur(null)
    if (f.replace(/\D/g,'').length === 10) try { localStorage.setItem('crew-tel', f) } catch {}
  }
  function onChangeNip(val: string, setter: (s: string) => void) {
    setter(val.replace(/\D/g, '').slice(0, 4))
    setErreur(null)
  }

  function finaliserConnexion(membre: Membre, digits: string, prenomFinal: string, nomFinal: string, tokenDejaCree = false) {
    try {
      localStorage.setItem('crew-tel-locked', formatTel(digits))
      localStorage.setItem('crew-tel', formatTel(digits))
      localStorage.setItem('crew-prenom', prenomFinal)
      if (nomFinal) localStorage.setItem('crew-nom', nomFinal)
      resetRateLimit() // succes = reset compteur
    } catch {}
    // Phase 2 : générer un access_token serveur (non bloquant si échec).
    // Le token sera utilisé par get_trip_data après activation de RLS en Session 2.3.
    // Skip si le token a déjà été créé par apiRegisterMember (flow inscription).
    if (membre.nip && !tokenDejaCree) {
      apiJoinTrip(trip.code, digits, membre.nip).catch(() => {
        // Échec silencieux : l'app continue via les SELECT directs jusqu'à activation RLS
      })
    }
    onJoin({...membre, nom: membre.nom || '', is_createur: membre.is_createur ?? false})
  }

  // MODE RECONNEXION : tel + NIP, match sur (trip_id, tel, nip hashe)
  async function reconnecter() {
    const digits = normalizeTel(tel)
    if (digits.length !== 10) { setErreur('Numéro de téléphone requis (10 chiffres).'); return }
    if (!isValidNip(nip)) { setErreur('NIP requis (4 chiffres).'); return }

    // Rate limiting
    const rl = getRateLimit()
    if (rl.blocked) {
      setErreur(`Trop de tentatives. Réessayez dans ${rl.remainingMin} minute${rl.remainingMin>1?'s':''} ou contactez l'administrateur.`)
      return
    }

    setLoading(true); setErreur(null)

    // Etape 1: trouver le membre par (trip_id + tel)
    const { data: membre } = await supabase.from('membres')
      .select('*')
      .eq('trip_id', trip.id)
      .eq('tel', digits)
      .maybeSingle()

    if (!membre) {
      setErreur("Aucun participant avec ce numéro dans ce trip. Vérifiez, ou utilisez « Je rejoins pour la première fois ».")
      setLoading(false); return
    }

    // Etape 2: cas migration douce — nip IS NULL en DB
    if (!membre.nip) {
      setLoading(false)
      setPendingMembre(membre)
      setMode('creer-nip')
      // Pre-remplir le tel pour eviter de le retaper
      return
    }

    // Etape 3: comparer hash
    const nipHash = await hashNip(nip)
    if (nipHash !== membre.nip) {
      const attempts = bumpRateLimit()
      const remaining = RL_MAX_ATTEMPTS - attempts
      if (remaining <= 0) {
        setErreur(`Trop de tentatives. Réessayez dans 15 minutes ou contactez l'administrateur.`)
      } else {
        setErreur(`NIP incorrect. ${remaining} tentative${remaining>1?'s':''} restante${remaining>1?'s':''} avant blocage temporaire.`)
      }
      setLoading(false); return
    }

    finaliserConnexion(membre, digits, membre.prenom, membre.nom || '')
  }

  // MODE CREER-NIP : l'utilisateur existe en DB mais n'a pas encore de NIP
  // (migration douce apres deploiement de la feature NIP).
  // Le NIP cree est propage a TOUTES les lignes membres avec le meme tel
  // (coherent avec le modele "1 personne = 1 NIP unique par tel").
  async function creerNipMigration() {
    if (!pendingMembre) { setMode('reconnexion'); return }
    if (!isValidNip(nip)) { setErreur('NIP requis (4 chiffres).'); return }

    setLoading(true); setErreur(null)
    const nipHash = await hashNip(nip)
    const telDigits = normalizeTel(pendingMembre.tel || '')

    if (telDigits) {
      // Propagation a toutes les lignes avec ce tel (cas normal)
      const { error } = await supabase.from('membres')
        .update({ nip: nipHash })
        .eq('tel', telDigits)
      if (error) {
        setErreur('Erreur lors de la création du NIP. Réessayez.')
        setLoading(false); return
      }
    } else {
      // Cas extreme : membre sans tel (ne devrait pas arriver). Update cette ligne.
      const { error } = await supabase.from('membres')
        .update({ nip: nipHash })
        .eq('id', pendingMembre.id)
      if (error) {
        setErreur('Erreur lors de la création du NIP. Réessayez.')
        setLoading(false); return
      }
    }

    const digits = telDigits || normalizeTel(tel)
    finaliserConnexion({...pendingMembre, nip: nipHash}, digits, pendingMembre.prenom, pendingMembre.nom || '')
  }

  // MODE INSCRIPTION : prenom + nom + tel + NIP + confirmer NIP
  async function rejoindre() {
    const prenomClean = prenom.trim()
    const nomClean = nom.trim()
    const digits = normalizeTel(tel)

    if (!prenomClean) { setErreur('Veuillez entrer votre prénom.'); return }
    if (!nomClean) { setErreur('Veuillez entrer votre nom de famille.'); return }
    if (digits.length !== 10) { setErreur('Numéro de téléphone requis (10 chiffres).'); return }
    if (!isValidNip(nip)) { setErreur('NIP requis (4 chiffres).'); return }

    setLoading(true); setErreur(null)

    // Etape 1 : validation liste autorises (si active)
    let prenomFinal = prenomClean
    let nomFinal = nomClean
    if (listeActive) {
      const r = matchParticipant(autorises, prenomClean, nomClean, tel)
      if (!r.ok) {
        setLoading(false)
        if (r.raison === 'not_found') {
          setErreur("Ces informations ne correspondent à aucun participant autorisé. Contactez l'organisateur.")
        } else if (r.raison === 'tel_mismatch') {
          setErreur('Ce numéro de téléphone ne correspond pas à ce participant.')
        } else {
          setErreur("Plusieurs participants portent ce nom. Contactez l'organisateur pour régulariser votre inscription.")
        }
        return
      }
      prenomFinal = r.participant.prenom
      nomFinal = r.participant.nom || ''
    }

    const nipHash = await hashNip(nip)

    // Phase 2 : les INSERT/UPDATE directs sur membres sont bloques par RLS.
    // On utilise la RPC register_member qui gere les 3 cas :
    //  - nouveau membre (insert + token)
    //  - deja membre par tel dans ce trip (update NIP + token)
    //  - propagation NIP cross-trip si meme tel ailleurs
    //
    // Cas edge non couvert par la RPC : "membreNomSeul" (membre existe par
    // prenom+nom sans tel dans ce trip). Dans ce cas, register_member va
    // creer un doublon. On detecte ce cas a priori via SELECT (permis par RLS)
    // et on refuse gentiment pour que l'admin regularise.
    const { data: membresExistants } = await supabase.from('membres').select('*').eq('trip_id', trip.id)

    if (membresExistants && membresExistants.length > 0) {
      const membreNomSeulSansTel = membresExistants.find((m: Membre) =>
        normalizeName(m.prenom) === normalizeName(prenomFinal)
        && normalizeName(m.nom || '') === normalizeName(nomFinal)
        && !normalizeTel(m.tel || '')
      )
      if (membreNomSeulSansTel) {
        setErreur("Ce participant existe déjà dans le trip mais sans téléphone. Contactez l'organisateur pour régulariser.")
        setLoading(false); return
      }
      const membreNomAvecTelDifferent = membresExistants.find((m: Membre) =>
        normalizeName(m.prenom) === normalizeName(prenomFinal)
        && normalizeName(m.nom || '') === normalizeName(nomFinal)
        && normalizeTel(m.tel || '')
        && normalizeTel(m.tel || '') !== digits
      )
      if (membreNomAvecTelDifferent) {
        setErreur("Un autre participant porte déjà ce prénom et nom dans ce trip avec un téléphone différent. Contactez l'organisateur.")
        setLoading(false); return
      }
    }

    // Delegue a la RPC (SECURITY DEFINER, bypass RLS)
    const result = await apiRegisterMember(trip.code, prenomFinal, nomFinal, digits, nipHash)

    if (!result.success || !result.membre_id) {
      setErreur(result.message || 'Erreur de connexion. Réessayez.')
      setLoading(false)
      return
    }

    // Recupere le membre complet pour le passer a finaliserConnexion
    const { data: membreCree } = await supabase.from('membres').select('*').eq('id', result.membre_id).maybeSingle()
    if (!membreCree) {
      setErreur('Erreur de connexion. Réessayez.')
      setLoading(false)
      return
    }
    setLoading(false)
    // apiRegisterMember a déjà créé le token, on skip le 2e appel dans finaliserConnexion
    finaliserConnexion(membreCree as Membre, digits, prenomFinal, nomFinal, true)
  }

  const canSubmitInscription = prenom.trim().length > 0 && nom.trim().length > 0 && telComplet && nipValide && !loading
  const canSubmitReconnexion = telComplet && nipValide && !loading
  const canSubmitCreerNip = nipValide && !loading

  // Bouton oeil inline pour montrer/masquer le NIP pendant la saisie.
  // Standard iOS bancaire: masque par defaut, l'utilisateur peut decider
  // de voir ses chiffres s'il n'est pas sur de ce qu'il a tape.
  const oeilBtn = (
    <button type="button" onClick={()=>setShowNip(s => !s)}
      aria-label={showNip ? 'Masquer le NIP' : 'Afficher le NIP'}
      style={{position:'absolute',right:10,top:'50%',transform:'translateY(-50%)',
        background:'none',border:'none',cursor:'pointer',padding:6,
        color:'rgba(255,255,255,.6)',display:'flex',alignItems:'center'}}>
      {showNip ? (
        // oeil barre (masquer)
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
          <line x1="1" y1="1" x2="23" y2="23"/>
        </svg>
      ) : (
        // oeil simple (afficher)
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
      )}
    </button>
  )

  const entete = (
    <>
      <div style={{fontSize:9,fontWeight:500,color:'rgba(255,255,255,.5)',letterSpacing:'.22em',textTransform:'uppercase',marginBottom:20}}>
        Crew Trips
      </div>
      <div style={{textAlign:'center',marginBottom:24}}>
        <div style={{width:90,height:90,margin:'0 auto 10px'}}><TripIcon type={trip.type} size={90} /></div>
        <h1 style={{fontSize:24,fontWeight:800,color:'#fff',letterSpacing:'-.03em',lineHeight:1.15,marginBottom:6}}>{trip.nom}</h1>
        {trip.destination && <p style={{fontSize:14,color:'rgba(255,255,255,.55)',marginBottom:4,display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="pin" size={13} /> {trip.destination}</p>}
        {trip.date_debut && (
          <p style={{fontSize:13,color:'rgba(255,255,255,.45)'}}>
            {fmt(trip.date_debut)}{trip.date_fin?` → ${fmt(trip.date_fin)}`:''}
          </p>
        )}
        {cd && (
          <div style={{marginTop:12,display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.1)',borderRadius:20,padding:'6px 14px'}}>
            <span style={{fontSize:13,color:'rgba(255,255,255,.85)',fontWeight:600}}>⏳ {cd}</span>
          </div>
        )}
      </div>
    </>
  )

  // Bloc separateur visuel pour la section "Creez votre NIP"
  const nipSeparateur = (
    <div style={{display:'flex',alignItems:'center',gap:10,marginTop:6,marginBottom:12}}>
      <div style={{flex:1,height:1,background:'rgba(255,255,255,.1)'}} />
      <span style={{fontSize:10,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',fontWeight:600}}>
        Créez votre NIP
      </span>
      <div style={{flex:1,height:1,background:'rgba(255,255,255,.1)'}} />
    </div>
  )

  // MODE 'choice'
  if (mode === 'choice') {
    return (
      <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
          {entete}
          <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
            <div style={{fontSize:13,color:'rgba(255,255,255,.5)',textAlign:'center',marginBottom:20,lineHeight:1.65}}>
              Vous avez été invité à ce trip.<br/>
              <strong style={{color:'rgba(255,255,255,.8)'}}>Crew Trips</strong> regroupe toutes les infos — vols, lodge, équipement, chat.
            </div>

            <button onClick={()=>{setMode('inscription');setErreur(null)}}
              style={{width:'100%',padding:'16px 20px',borderRadius:12,border:'none',
                background:'#fff',color:'var(--forest)',fontWeight:700,fontSize:15,cursor:'pointer',marginBottom:10,
                display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
              <span style={{textAlign:'left'}}>
                <span style={{display:'block',fontSize:15,fontWeight:700}}>Je rejoins pour la 1re fois</span>
                <span style={{display:'block',fontSize:11,fontWeight:400,opacity:.7,marginTop:2}}>Prénom, nom, téléphone et NIP</span>
              </span>
              <span style={{fontSize:18}}>→</span>
            </button>

            <button onClick={()=>{setMode('reconnexion');setErreur(null)}}
              style={{width:'100%',padding:'16px 20px',borderRadius:12,
                border:'1.5px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.04)',
                color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'space-between',gap:10}}>
              <span style={{textAlign:'left'}}>
                <span style={{display:'block',fontSize:14,fontWeight:700}}>Je suis déjà inscrit</span>
                <span style={{display:'block',fontSize:11,fontWeight:400,opacity:.6,marginTop:2}}>Téléphone et NIP</span>
              </span>
              <span style={{fontSize:18,opacity:.6}}>→</span>
            </button>
          </div>
          <p style={{fontSize:11,color:'rgba(255,255,255,.2)',marginTop:16,textAlign:'center',lineHeight:1.7}}>
            Pas de compte requis · Aucune installation nécessaire
            {listeActive && <><br/>Liste de participants restreinte</>}
          </p>
        </div>
      </main>
    )
  }

  // MODE 'reconnexion' : tel + NIP
  if (mode === 'reconnexion') {
    return (
      <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
          {entete}
          <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
            <div style={{fontSize:13,color:'rgba(255,255,255,.5)',textAlign:'center',marginBottom:18,lineHeight:1.65}}>
              {isStandalone
                ? <>Bienvenue. Entrez votre téléphone et NIP pour ouvrir le trip.</>
                : <>Entrez le numéro de téléphone et le NIP avec lesquels vous vous êtes inscrit.</>
              }
            </div>

            <div style={{marginBottom:12}}>
              <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
                Numéro de téléphone
              </label>
              <input className="input" type="tel" placeholder="418 XXX XXXX"
                value={tel} onChange={e=>onChangeTel(e.target.value)}
                autoFocus
                style={{fontSize:16,letterSpacing:1,textAlign:'center',
                  background:'rgba(255,255,255,.06)',
                  border:`1.5px solid ${tel && telComplet ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                  color:'#fff'}}
              />
            </div>

            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
                NIP (4 chiffres)
              </label>
              <div style={{position:'relative'}}>
                <input className="input" type={showNip ? 'text' : 'password'} inputMode="numeric" placeholder="••••"
                  value={nip} onChange={e=>onChangeNip(e.target.value, setNip)}
                  onKeyDown={e=>e.key==='Enter' && canSubmitReconnexion && reconnecter()}
                  maxLength={4}
                  style={{fontSize:18,letterSpacing:showNip ? 4 : 8,textAlign:'center',paddingRight:40,
                    background:'rgba(255,255,255,.06)',
                    border:`1.5px solid ${nip && nipValide ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                    color:'#fff'}}
                />
                {oeilBtn}
              </div>
            </div>

            {erreur && (
              <div style={{background:'rgba(248,113,113,.15)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                <p style={{fontSize:13,color:'#fca5a5',textAlign:'center',lineHeight:1.5}}>{erreur}</p>
              </div>
            )}

            <button className="btn" onClick={reconnecter} disabled={!canSubmitReconnexion}
              style={{background: !canSubmitReconnexion ? 'rgba(255,255,255,.15)' : '#fff',
                color: !canSubmitReconnexion ? 'rgba(255,255,255,.4)' : 'var(--forest)',fontWeight:700,marginBottom:8}}>
              {loading ? 'Connexion…' : 'Entrer dans le trip →'}
            </button>

            {trip.createur_tel ? (
              <a
                href={`sms:${trip.createur_tel}?&body=${encodeURIComponent(
                  `Salut, j'ai oublié mon NIP pour le trip "${trip.nom}". Peux-tu le réinitialiser dans l'app ? (Groupe → 🔓 Reset NIP à côté de mon nom)`
                )}`}
                style={{
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                  width:'100%',padding:'10px',marginTop:6,borderRadius:10,
                  background:'rgba(255,255,255,.06)',
                  border:'1px solid rgba(255,255,255,.12)',
                  color:'rgba(255,255,255,.65)',
                  fontSize:12,fontWeight:600,textDecoration:'none',
                }}>
                🤔 NIP oublié ? Demander à l&apos;administrateur
              </a>
            ) : (
              <div style={{fontSize:11,color:'rgba(255,255,255,.4)',textAlign:'center',marginTop:6,lineHeight:1.5}}>
                🤔 NIP oublié ? Contactez l&apos;administrateur du trip pour qu&apos;il le réinitialise.
              </div>
            )}

            {!isStandalone && (
              <button onClick={()=>{setMode('choice');setErreur(null);setNip('')}}
                style={{width:'100%',padding:'10px',background:'none',border:'none',
                  color:'rgba(255,255,255,.4)',fontSize:12,cursor:'pointer',fontWeight:500,marginTop:6}}>
                ← Retour
              </button>
            )}
          </div>
        </div>
      </main>
    )
  }

  // MODE 'creer-nip' : migration douce (utilisateur existe en DB sans NIP)
  if (mode === 'creer-nip') {
    return (
      <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
        <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
          {entete}
          <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
            <div style={{fontSize:13,color:'rgba(255,255,255,.7)',textAlign:'center',marginBottom:8,lineHeight:1.65,fontWeight:600}}>
              Bienvenue {pendingMembre?.prenom} !
            </div>
            <div style={{fontSize:12,color:'rgba(255,255,255,.5)',textAlign:'center',marginBottom:18,lineHeight:1.65}}>
              Pour sécuriser votre accès, créez un NIP à 4 chiffres. Vous l&apos;utiliserez à chaque connexion sur un nouvel appareil.
            </div>

            <div style={{marginBottom:14}}>
              <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
                NIP (4 chiffres)
              </label>
              <input className="input" type="text" inputMode="numeric" placeholder="••••"
                value={nip} onChange={e=>onChangeNip(e.target.value, setNip)}
                onKeyDown={e=>e.key==='Enter' && canSubmitCreerNip && creerNipMigration()}
                autoFocus maxLength={4}
                style={{fontSize:22,letterSpacing:8,textAlign:'center',fontWeight:700,
                  background:'rgba(255,255,255,.06)',
                  border:`1.5px solid ${nip && nipValide ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                  color:'#fff'}}
              />
            </div>

            {erreur && (
              <div style={{background:'rgba(248,113,113,.15)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',marginBottom:10}}>
                <p style={{fontSize:13,color:'#fca5a5',textAlign:'center',lineHeight:1.5}}>{erreur}</p>
              </div>
            )}

            <button className="btn" onClick={creerNipMigration} disabled={!canSubmitCreerNip}
              style={{background: !canSubmitCreerNip ? 'rgba(255,255,255,.15)' : '#fff',
                color: !canSubmitCreerNip ? 'rgba(255,255,255,.4)' : 'var(--forest)',fontWeight:700,marginBottom:8}}>
              {loading ? 'Création…' : 'Créer mon NIP et entrer →'}
            </button>
          </div>
        </div>
      </main>
    )
  }

  // MODE 'inscription' : prenom + nom + tel + NIP + confirmer NIP
  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
        {entete}
        <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
          <div style={{fontSize:13,color:'rgba(255,255,255,.5)',textAlign:'center',marginBottom:18,lineHeight:1.65}}>
            Première inscription à ce trip — entrez vos informations.
          </div>

          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Prénom
            </label>
            <input className="input" placeholder="Votre prénom" value={prenom}
              onChange={e=>{setPrenom(e.target.value);setErreur(null)}}
              autoFocus
              style={{fontSize:16,fontWeight:600,background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Nom de famille
            </label>
            <input className="input" placeholder="Votre nom de famille" value={nom}
              onChange={e=>{setNom(e.target.value);setErreur(null)}}
              style={{fontSize:16,fontWeight:600,background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Numéro de téléphone
            </label>
            <input className="input" type="tel" placeholder="418 XXX XXXX"
              value={tel} onChange={e=>onChangeTel(e.target.value)}
              style={{fontSize:15,letterSpacing:1,background:'rgba(255,255,255,.06)',
                border:`1.5px solid ${tel && telComplet ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                color:'rgba(255,255,255,.85)'}}
            />
          </div>

          {nipSeparateur}

          <div style={{marginBottom:14}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              NIP (4 chiffres)
            </label>
            <input className="input" type="text" inputMode="numeric" placeholder="••••"
              value={nip} onChange={e=>onChangeNip(e.target.value, setNip)}
              onKeyDown={e=>e.key==='Enter' && canSubmitInscription && rejoindre()}
              maxLength={4}
              style={{fontSize:22,letterSpacing:8,textAlign:'center',fontWeight:700,
                background:'rgba(255,255,255,.06)',
                border:`1.5px solid ${nip && nipValide ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                color:'#fff'}}
            />
            <div style={{fontSize:11,color:'rgba(255,255,255,.4)',marginTop:6,lineHeight:1.5}}>
              Vous l&apos;utiliserez à chaque connexion sur un nouvel appareil.
            </div>
          </div>

          {erreur && (
            <div style={{background:'rgba(248,113,113,.15)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',marginBottom:10}}>
              <p style={{fontSize:13,color:'#fca5a5',textAlign:'center'}}>{erreur}</p>
            </div>
          )}

          <button className="btn" onClick={rejoindre} disabled={!canSubmitInscription}
            style={{background: !canSubmitInscription ? 'rgba(255,255,255,.15)' : '#fff',
              color: !canSubmitInscription ? 'rgba(255,255,255,.4)' : 'var(--forest)',fontWeight:700,marginBottom:8}}>
            {loading ? 'Connexion…' : 'Entrer dans le trip →'}
          </button>

          <button onClick={()=>{setMode('choice');setErreur(null);setNip('')}}
            style={{width:'100%',padding:'10px',background:'none',border:'none',
              color:'rgba(255,255,255,.4)',fontSize:12,cursor:'pointer',fontWeight:500}}>
            ← Retour
          </button>
        </div>
      </div>
    </main>
  )
}
