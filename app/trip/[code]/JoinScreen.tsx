'use client'
import { useState } from 'react'
import { supabase } from '@/lib/supabase'
import { COULEURS_MEMBRES } from '@/lib/types'
import type { Trip, Membre } from '@/lib/types'

const ICONS: Record<string,string> = { peche:'🎣', ski:'⛷', chasse:'🦌', autre:'🏕' }

function fmt(d?: string) {
  if (!d) return ''
  return new Date(d).toLocaleDateString('fr-CA', { day:'numeric', month:'long', year:'numeric' })
}

function countdown(d?: string) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return "C'est aujourd'hui ! 🎉"
  return `${diff} jour${diff>1?'s':''} avant le départ`
}

export default function JoinScreen({ trip, onJoin }: { trip: Trip, onJoin: (m: Membre) => void }) {
  const [prenom, setPrenom] = useState('')
  const [loading, setLoading] = useState(false)
  const cd = countdown(trip.date_debut)

  async function rejoindre() {
    if (!prenom.trim()) return
    setLoading(true)
    const { data: existing } = await supabase.from('membres')
      .select('*').eq('trip_id', trip.id).ilike('prenom', prenom.trim()).single()
    if (existing) { onJoin(existing); return }
    const couleur = COULEURS_MEMBRES[Math.floor(Math.random() * COULEURS_MEMBRES.length)]
    const { data, error } = await supabase.from('membres')
      .insert({ trip_id: trip.id, prenom: prenom.trim(), couleur })
      .select().single()
    if (!error && data) onJoin(data)
    else { alert('Erreur de connexion.'); setLoading(false) }
  }

  return (
    <main style={{minHeight:'100dvh',background:'var(--forest)',display:'flex',flexDirection:'column'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'32px 20px'}}>
        <div style={{textAlign:'center',marginBottom:36}}>
          <div style={{fontSize:60,marginBottom:10}}>{ICONS[trip.type]||'🏕'}</div>
          <h1 style={{fontSize:26,fontWeight:800,color:'#fff',letterSpacing:'-.03em',lineHeight:1.15,marginBottom:6}}>
            {trip.nom}
          </h1>
          {trip.destination && (
            <p style={{fontSize:14,color:'rgba(255,255,255,.55)',marginBottom:4}}>📍 {trip.destination}</p>
          )}
          {trip.date_debut && (
            <p style={{fontSize:13,color:'rgba(255,255,255,.45)'}}>
              {fmt(trip.date_debut)}{trip.date_fin ? ` → ${fmt(trip.date_fin)}` : ''}
            </p>
          )}
          {cd && (
            <div style={{marginTop:14,display:'inline-flex',alignItems:'center',gap:6,background:'rgba(255,255,255,.1)',borderRadius:20,padding:'7px 16px'}}>
              <span style={{fontSize:14,color:'rgba(255,255,255,.85)',fontWeight:600}}>⏳ {cd}</span>
            </div>
          )}
        </div>
        <div style={{width:'100%',maxWidth:360,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
          <p style={{fontSize:14,color:'rgba(255,255,255,.6)',textAlign:'center',marginBottom:18,lineHeight:1.5}}>
            Entrez votre prénom pour accéder au trip
          </p>
          <input className="input" placeholder="Votre prénom" value={prenom}
            onChange={e=>setPrenom(e.target.value)}
            onKeyDown={e=>e.key==='Enter'&&rejoindre()}
            autoFocus
            style={{textAlign:'center',fontSize:18,fontWeight:600,
              background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff',marginBottom:12}}
          />
          <button className="btn" onClick={rejoindre} disabled={loading||!prenom.trim()}
            style={{background:loading||!prenom.trim()?'rgba(255,255,255,.15)':'#fff',
              color:loading||!prenom.trim()?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700}}>
            {loading ? 'Connexion…' : 'Entrer dans le trip →'}
          </button>
        </div>
        <p style={{fontSize:12,color:'rgba(255,255,255,.25)',marginTop:18,textAlign:'center'}}>
          Pas de compte requis. Juste votre prénom.
        </p>
      </div>
    </main>
  )
}
