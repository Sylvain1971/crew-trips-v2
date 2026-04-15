'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { COULEURS_MEMBRES, findClosestPrenom } from '@/lib/types'
import { countdown, TRIP_ICONS } from '@/lib/utils'
import type { Trip, Membre, ParticipantAutorise } from '@/lib/types'

function fmt(d?: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
}

export default function JoinScreen({trip,autorises,onJoin}:{
  trip:Trip, autorises:ParticipantAutorise[], onJoin:(m:Membre)=>void
}) {
  const [prenom, setPrenom] = useState('')
  const [tel, setTel] = useState('')
  const [suggestion, setSuggestion] = useState<string|null>(null)
  const [erreur, setErreur] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const [cd, setCd] = useState(()=>countdown(trip.date_debut))
  useEffect(()=>{
    const t = setInterval(()=>setCd(countdown(trip.date_debut)), 60000)
    // Pré-remplir le tel depuis localStorage
    try { const saved = localStorage.getItem('crew-tel'); if (saved) setTel(saved) } catch {}
    return ()=>clearInterval(t)
  },[trip.date_debut])
  const listeActive = autorises.length > 0

  function formatTel(val: string): string {
    const d = val.replace(/\D/g,'').slice(0,10)
    if (d.length<=3) return d
    if (d.length<=6) return `${d.slice(0,3)} ${d.slice(3)}`
    return `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
  }

  function onChangeTel(val: string) {
    const f = formatTel(val)
    setTel(f)
    if (f.replace(/\D/g,'').length === 10) try { localStorage.setItem('crew-tel', f) } catch {}
  }

  function valider(nom: string) {
    if (!listeActive) return nom
    const proche = findClosestPrenom(nom, autorises.map(a=>a.prenom))
    if (!proche) return null
    return proche
  }

  function onChangePrenom(val: string) {
    setPrenom(val)
    setErreur(null)
    setSuggestion(null)
    if (!listeActive || val.trim().length < 2) return
    const proche = findClosestPrenom(val, autorises.map(a=>a.prenom))
    if (proche && proche.toLowerCase() !== val.toLowerCase()) setSuggestion(proche)
  }

  async function rejoindre(nomFinal?: string) {
    const nom = (nomFinal || prenom).trim()
    if (!nom) return
    setLoading(true); setErreur(null); setSuggestion(null)

    // Charger tous les membres existants du trip
    const { data: membresExistants } = await supabase.from('membres')
      .select('*').eq('trip_id', trip.id)

    // 1. Validation liste autorisée EN PREMIER (sécurité)
    if (listeActive) {
      const valide = valider(nom)
      if (!valide) {
        setErreur("Votre prénom n'est pas sur la liste. Contactez l'organisateur.")
        setLoading(false); return
      }
    }

    // 2. Fuzzy match sur les membres existants (reconnexion)
    if (membresExistants && membresExistants.length > 0) {
      const prenomsMembres = membresExistants.map((m: {prenom: string}) => m.prenom)
      const match = findClosestPrenom(nom, prenomsMembres)
      if (match) {
        const membreExistant = membresExistants.find((m: {prenom: string}) => m.prenom === match)
        if (membreExistant) {
          // Mettre à jour le tel si fourni
          const digits = tel.replace(/\D/g,'')
          if (digits.length === 10) {
            await supabase.from('membres').update({ tel: digits }).eq('id', membreExistant.id)
          }
          setLoading(false)
          onJoin({...membreExistant, is_createur: membreExistant.is_createur ?? false})
          return
        }
      }
    }

    // 3. Nouveau membre
    const isFirst = (membresExistants?.length ?? 0) === 0
    const couleur = COULEURS_MEMBRES[Math.floor(Math.random()*COULEURS_MEMBRES.length)]
    const digits = tel.replace(/\D/g,'')
    const { data, error } = await supabase.from('membres')
      .insert({trip_id:trip.id, prenom:nom, couleur, is_createur:isFirst, tel: digits.length===10?digits:null})
      .select().single()
    if (!error && data) onJoin(data)
    else { setErreur('Erreur de connexion. Réessayez.' + (error ? ' (' + error.message + ')' : '')); setLoading(false) }
  }

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:60,marginBottom:10}}>{TRIP_ICONS[trip.type]||'🏕'}</div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#fff',letterSpacing:'-.03em',lineHeight:1.15,marginBottom:6}}>{trip.nom}</h1>
          {trip.destination && <p style={{fontSize:14,color:'rgba(255,255,255,.55)',marginBottom:4}}>📍 {trip.destination}</p>}
          {trip.date_debut && (
            <p style={{fontSize:13,color:'rgba(255,255,255,.45)'}}>
              {fmt(trip.date_debut)}{trip.date_fin?` → ${fmt(trip.date_fin)}`:''}
            </p>
          )}
          {cd && (
            <div style={{marginTop:14,display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.1)',borderRadius:20,padding:'7px 16px'}}>
              <span style={{fontSize:14,color:'rgba(255,255,255,.85)',fontWeight:600}}>⏳ {cd}</span>
            </div>
          )}
        </div>
        <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
          <p style={{fontSize:14,color:'rgba(255,255,255,.6)',textAlign:'center',marginBottom:16,lineHeight:1.5}}>
            Entrez votre Prénom et Nom pour accéder au trip
          </p>
          <input className="input" placeholder="Prénom et Nom" value={prenom}
            onChange={e=>onChangePrenom(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&rejoindre()}
            autoFocus
            style={{textAlign:'center',fontSize:18,fontWeight:600,marginBottom:10,
              background:'rgba(255,255,255,.08)',border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
          />
          {/* Champ tel — caché quand une suggestion est affichée */}
          {!suggestion && (
            <input className="input" type="tel" placeholder="ex : 418 000 0000 (optionnel)"
              value={tel} onChange={e=>onChangeTel(e.target.value)}
              style={{textAlign:'center',fontSize:15,marginBottom:10,letterSpacing:1,
                background:'rgba(255,255,255,.06)',border:`1.5px solid ${tel && tel.replace(/\D/g,'').length===10?'#4ade80':'rgba(255,255,255,.1)'}`,
                color:'rgba(255,255,255,.8)'}}
            />
          )}
          {suggestion && (
            <div style={{background:'rgba(255,255,255,.08)',borderRadius:10,padding:'10px 14px',marginBottom:10,border:'1px solid rgba(255,255,255,.15)'}}>
              <p style={{fontSize:13,color:'rgba(255,255,255,.7)',marginBottom:8}}>
                Vouliez-vous dire <strong style={{color:'#fff'}}>{suggestion}</strong> ?
              </p>
              <div style={{display:'flex',gap:8}}>
                <button onClick={()=>rejoindre(suggestion)}
                  style={{flex:1,padding:'8px',borderRadius:8,border:'none',background:'#fff',color:'var(--forest)',fontWeight:700,fontSize:13,cursor:'pointer'}}>
                  Oui, c'est moi
                </button>
                <button onClick={()=>setSuggestion(null)}
                  style={{padding:'8px 12px',borderRadius:8,border:'1px solid rgba(255,255,255,.2)',background:'transparent',color:'rgba(255,255,255,.6)',fontSize:13,cursor:'pointer'}}>
                  Non
                </button>
              </div>
            </div>
          )}
          {erreur && (
            <div style={{background:'rgba(248,113,113,.15)',border:'1px solid rgba(248,113,113,.3)',borderRadius:10,padding:'10px 14px',marginBottom:10}}>
              <p style={{fontSize:13,color:'#fca5a5',textAlign:'center'}}>{erreur}</p>
            </div>
          )}
          <button className="btn" onClick={()=>rejoindre()} disabled={loading||!prenom.trim()}
            style={{background:loading||!prenom.trim()?'rgba(255,255,255,.15)':'#fff',
              color:loading||!prenom.trim()?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700}}>
            {loading?'Connexion…':'Entrer dans le trip →'}
          </button>
        </div>
        <p style={{fontSize:12,color:'rgba(255,255,255,.25)',marginTop:18,textAlign:'center'}}>
          Pas de compte requis.{listeActive?' Liste de participants restreinte.':' Entrez votre Prénom et Nom.'}
        </p>
      </div>
    </main>
  )
}
