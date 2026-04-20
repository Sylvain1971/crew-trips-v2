'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import {
  COULEURS_MEMBRES,
  matchParticipant,
  normalizeName,
  normalizeTel,
  formatNomComplet
} from '@/lib/types'
import { countdown } from '@/lib/utils'
import { TripIcon } from '@/lib/tripIcons'
import { SvgIcon } from '@/lib/svgIcons'
import type { Trip, Membre, ParticipantAutorise } from '@/lib/types'

function fmt(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
}

export default function JoinScreen({trip,autorises,onJoin}:{
  trip:Trip, autorises:ParticipantAutorise[], onJoin:(m:Membre)=>void
}) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [erreur, setErreur] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [cd, setCd] = useState(()=>countdown(trip.date_debut))

  useEffect(()=>{
    const t = setInterval(()=>setCd(countdown(trip.date_debut)), 60000)
    try {
      const saved = localStorage.getItem('crew-tel'); if (saved) setTel(saved)
      const savedPrenom = localStorage.getItem('crew-prenom'); if (savedPrenom) setPrenom(savedPrenom)
      const savedNom = localStorage.getItem('crew-nom'); if (savedNom) setNom(savedNom)
    } catch {}
    return ()=>clearInterval(t)
  },[trip.date_debut])

  const listeActive = autorises.length > 0
  const telComplet = normalizeTel(tel).length === 10

  function formatTel(val: string): string {
    const d = val.replace(/\D/g,'').slice(0,10)
    if (d.length<=3) return d
    if (d.length<=6) return `${d.slice(0,3)} ${d.slice(3)}`
    return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
  }

  function onChangeTel(val: string) {
    const f = formatTel(val)
    setTel(f)
    setErreur(null)
    if (f.replace(/\D/g,'').length === 10) try { localStorage.setItem('crew-tel', f) } catch {}
  }

  function onChangePrenom(val: string) {
    setPrenom(val)
    setErreur(null)
  }

  function onChangeNom(val: string) {
    setNom(val)
    setErreur(null)
  }

  async function rejoindre() {
    const prenomClean = prenom.trim()
    const nomClean = nom.trim()
    const digits = normalizeTel(tel)

    if (!prenomClean) { setErreur('Veuillez entrer votre prénom.'); return }
    if (!nomClean) { setErreur('Veuillez entrer votre nom de famille.'); return }
    if (digits.length !== 10) { setErreur('Numéro de téléphone requis (10 chiffres).'); return }

    setLoading(true); setErreur(null)

    // Étape 1 : si une liste d'autorisés existe, valider prénom+nom (+ tel si préenregistré)
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
      // Utiliser la casse exacte de la liste autorisée
      prenomFinal = r.participant.prenom
      nomFinal = r.participant.nom || ''
    }

    // Étape 2 : reconnexion — match exact sur prenom + nom + tel dans membres
    const { data: membresExistants } = await supabase.from('membres').select('*').eq('trip_id', trip.id)

    if (membresExistants && membresExistants.length > 0) {
      // Priorité 1 : match des 3 champs (le cas normal pour quelqu'un qui revient)
      const membreExact = membresExistants.find((m: Membre) =>
        normalizeName(m.prenom) === normalizeName(prenomFinal)
        && normalizeName(m.nom || '') === normalizeName(nomFinal)
        && normalizeTel(m.tel || '') === digits
      )
      if (membreExact) {
        try {
          localStorage.setItem('crew-tel-locked', formatTel(digits))
          localStorage.setItem('crew-prenom', prenomFinal)
          localStorage.setItem('crew-nom', nomFinal)
        } catch {}
        setLoading(false)
        onJoin({...membreExact, nom: membreExact.nom || '', is_createur: membreExact.is_createur ?? false})
        return
      }

      // Priorité 2 : match prénom + nom sans tel (migre un ancien membre qui entre la 1re fois avec tel)
      const membreNomSeul = membresExistants.find((m: Membre) =>
        normalizeName(m.prenom) === normalizeName(prenomFinal)
        && normalizeName(m.nom || '') === normalizeName(nomFinal)
      )
      if (membreNomSeul) {
        // Conflit : prénom+nom existant mais tel différent => on refuse (sécurité anti-usurpation)
        if (normalizeTel(membreNomSeul.tel || '') && normalizeTel(membreNomSeul.tel || '') !== digits) {
          setErreur("Un autre participant porte déjà ce prénom et nom dans ce trip avec un téléphone différent. Contactez l'organisateur.")
          setLoading(false); return
        }
        // Pas de tel enregistré (ou identique) => on complète
        await supabase.from('membres').update({ tel: digits, nom: nomFinal }).eq('id', membreNomSeul.id)
        try {
          localStorage.setItem('crew-tel-locked', formatTel(digits))
          localStorage.setItem('crew-prenom', prenomFinal)
          localStorage.setItem('crew-nom', nomFinal)
        } catch {}
        setLoading(false)
        onJoin({...membreNomSeul, nom: nomFinal, tel: digits, is_createur: membreNomSeul.is_createur ?? false})
        return
      }
    }

    // Étape 3 : nouvelle inscription
    const isFirst = (membresExistants?.length ?? 0) === 0
    const couleur = COULEURS_MEMBRES[Math.floor(Math.random()*COULEURS_MEMBRES.length)]
    const { data, error } = await supabase.from('membres')
      .insert({
        trip_id: trip.id,
        prenom: prenomFinal,
        nom: nomFinal,
        couleur,
        is_createur: isFirst,
        tel: digits
      })
      .select().single()
    if (!error && data) {
      try {
        localStorage.setItem('crew-tel-locked', formatTel(digits))
        localStorage.setItem('crew-prenom', prenomFinal)
        localStorage.setItem('crew-nom', nomFinal)
      } catch {}
      onJoin(data)
    } else {
      setErreur('Erreur de connexion. Réessayez.')
      setLoading(false)
    }
  }

  const canSubmit = prenom.trim().length > 0 && nom.trim().length > 0 && telComplet && !loading

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>

        {/* Branding */}
        <div style={{fontSize:9,fontWeight:500,color:'rgba(255,255,255,.5)',letterSpacing:'.22em',textTransform:'uppercase',marginBottom:20}}>
          Crew Trips
        </div>

        {/* Info trip */}
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

        {/* Card */}
        <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>

          {/* Explication */}
          <div style={{fontSize:13,color:'rgba(255,255,255,.5)',textAlign:'center',marginBottom:18,lineHeight:1.65,padding:'0 4px'}}>
            Vous avez été invité à ce trip.<br/>
            <strong style={{color:'rgba(255,255,255,.8)'}}>Crew Trips</strong> regroupe toutes les infos — vols, lodge, équipement, chat.
          </div>

          <div style={{height:1,background:'rgba(255,255,255,.08)',marginBottom:18}}/>

          {/* Prénom */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Prénom
            </label>
            <input className="input" placeholder="ex : Sylvain" value={prenom}
              onChange={e=>onChangePrenom(e.target.value)}
              autoFocus
              style={{fontSize:16,fontWeight:600,
                background:'rgba(255,255,255,.08)',
                border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
            />
          </div>

          {/* Nom de famille */}
          <div style={{marginBottom:12}}>
            <label style={{fontSize:10,fontWeight:600,color:'rgba(255,255,255,.5)',letterSpacing:'.12em',textTransform:'uppercase',display:'block',marginBottom:5}}>
              Nom de famille
            </label>
            <input className="input" placeholder="ex : Bergeron" value={nom}
              onChange={e=>onChangeNom(e.target.value)}
              onKeyDown={e=>e.key==='Enter' && canSubmit && rejoindre()}
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
              value={tel} onChange={e=>onChangeTel(e.target.value)}
              onKeyDown={e=>e.key==='Enter' && canSubmit && rejoindre()}
              style={{fontSize:15,letterSpacing:1,
                background:'rgba(255,255,255,.06)',
                border:`1.5px solid ${tel && telComplet ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                color:'rgba(255,255,255,.85)'}}
            />
          </div>

          {erreur && (
            <div style={{background:'rgba(248,113,113,.15)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',marginBottom:10}}>
              <p style={{fontSize:13,color:'#fca5a5',textAlign:'center'}}>{erreur}</p>
            </div>
          )}

          <button className="btn" onClick={rejoindre} disabled={!canSubmit}
            style={{background: !canSubmit ? 'rgba(255,255,255,.15)' : '#fff',
              color: !canSubmit ? 'rgba(255,255,255,.4)' : 'var(--forest)',fontWeight:700}}>
            {loading ? 'Connexion…' : 'Entrer dans le trip →'}
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
