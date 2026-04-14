'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { COULEURS_MEMBRES, findClosestPrenom } from '@/lib/types'
import type { Trip, Membre, ParticipantAutorise } from '@/lib/types'

const ICONS: Record<string,string> = { 
  peche:'🎣', ski:'⛷', motoneige:'🗻',
  hike:'🥾', velo:'🚵', chasse:'🫎', yoga:'🧘', autre:'🏕' 
}

function fmt(d?: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'})
}
function countdown(d?: string) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime()-Date.now())/86400000)
  if (diff<0) return null
  if (diff===0) return "C'est aujourd'hui ! 🎉"
  return `${diff} jour${diff>1?'s':''} avant le départ`
}

export default function JoinScreen({trip,autorises,onJoin}:{
  trip:Trip, autorises:ParticipantAutorise[], onJoin:(m:Membre)=>void
}) {
  const [prenom, setPrenom] = useState('')
  const [suggestion, setSuggestion] = useState<string|null>(null)
  const [erreur, setErreur] = useState<string|null>(null)
  const [loading, setLoading] = useState(false)
  const cd = countdown(trip.date_debut)
  const listeActive = autorises.length > 0

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
    if (listeActive) {
      const valide = valider(nom)
      if (!valide) {
        setErreur("Votre prénom n'est pas sur la liste. Contactez l'organisateur.")
        setLoading(false); return
      }
    }
    const { data: existing } = await supabase.from('membres')
      .select('*').eq('trip_id',trip.id).ilike('prenom',nom).maybeSingle()
    if (existing) { setLoading(false); onJoin({...existing, is_createur: existing.is_createur ?? false}); return }
    const { count } = await supabase.from('membres')
      .select('id', {count:'exact',head:true}).eq('trip_id',trip.id)
    const isFirst = (count ?? 0) === 0
    const couleur = COULEURS_MEMBRES[Math.floor(Math.random()*COULEURS_MEMBRES.length)]
    const { data, error } = await supabase.from('membres')
      .insert({trip_id:trip.id, prenom:nom, couleur, is_createur:isFirst})
      .select().single()
    if (!error && data) onJoin(data)
    else { setErreur('Erreur de connexion. Réessayez.' + (error ? ' (' + error.message + ')' : '')); setLoading(false) }
  }

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
        <div style={{textAlign:'center',marginBottom:32}}>
          <div style={{fontSize:60,marginBottom:10}}>{ICONS[trip.type]||'🏕'}</div>
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
            Entrez votre prénom et nom pour accéder au trip
          </p>
          <input className="input" placeholder="Prénom et nom" value={prenom}
            onChange={e=>onChangePrenom(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&rejoindre()}
            autoFocus
            style={{textAlign:'center',fontSize:18,fontWeight:600,marginBottom:10,
              background:'rgba(255,255,255,.08)',border:`1.5px solid ${erreur?'#f87171':'rgba(255,255,255,.15)'}`,color:'#fff'}}
          />
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
          Pas de compte requis.{listeActive?' Liste de participants restreinte.':' Entrez votre prénom.'}
        </p>
      </div>
    </main>
  )
}
