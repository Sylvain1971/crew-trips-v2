'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

function genCode() {
  return Array.from({length:6},()=>'abcdefghjkmnpqrstuvwxyz23456789'[Math.floor(Math.random()*32)]).join('')
}

export default function Home() {
  const router = useRouter()
  const [nom, setNom] = useState('')
  const [type, setType] = useState('peche')
  const [dest, setDest] = useState('')
  const [d1, setD1] = useState('')
  const [d2, setD2] = useState('')
  const [loading, setLoading] = useState(false)

  async function creer() {
    if (!nom.trim()) return
    setLoading(true)
    const code = genCode()
    const { error } = await supabase.from('trips').insert({
      code, nom: nom.trim(), type, destination: dest.trim()||null,
      date_debut: d1||null, date_fin: d2||null,
    })
    if (!error) router.push(`/trip/${code}`)
    else { alert('Erreur: ' + error.message); setLoading(false) }
  }

  return (
    <main style={{minHeight:'100dvh',display:'flex',flexDirection:'column',background:'var(--forest)'}}>
      <div style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'40px 20px 24px'}}>
        <div style={{textAlign:'center',marginBottom:40}}>
          <div style={{fontSize:56,marginBottom:12}}>🎣</div>
          <h1 style={{fontSize:32,fontWeight:800,color:'#fff',letterSpacing:'-.04em',lineHeight:1.1}}>Crew Trips</h1>
          <p style={{fontSize:15,color:'rgba(255,255,255,.55)',marginTop:10,lineHeight:1.5}}>
            Tout ce que ton groupe a besoin de savoir.<br/>Un seul lien.
          </p>
        </div>
        <div style={{width:'100%',maxWidth:420,background:'rgba(255,255,255,.06)',borderRadius:20,padding:24,border:'1px solid rgba(255,255,255,.1)'}}>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>NOM DU TRIP</label>
            <input className="input" placeholder="Ex: Babine River — Octobre 2025"
              value={nom} onChange={e=>setNom(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}
              onFocus={e=>{e.target.style.border='1.5px solid rgba(255,255,255,.4)'}}
              onBlur={e=>{e.target.style.border='1.5px solid rgba(255,255,255,.15)'}}
            />
          </div>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>ACTIVITÉ</label>
            <select className="input" value={type} onChange={e=>setType(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}>
              <option value="peche" style={{background:'#1a3a1a',color:'#fff'}}>🎣 Pêche à la mouche</option>
              <option value="ski" style={{background:'#1a3a1a',color:'#fff'}}>⛷ Ski alpin</option>
              <option value="motoneige" style={{background:'#1a3a1a',color:'#fff'}}>🛻 Motoneige</option>
              <option value="hike" style={{background:'#1a3a1a',color:'#fff'}}>🥾 Randonnée / Hike</option>
              <option value="velo" style={{background:'#1a3a1a',color:'#fff'}}>🚵 Vélo / Mountain Bike</option>
              <option value="chasse" style={{background:'#1a3a1a',color:'#fff'}}>🫎 Chasse</option>
              <option value="yoga" style={{background:'#1a3a1a',color:'#fff'}}>🧘 Yoga</option>
              <option value="autre" style={{background:'#1a3a1a',color:'#fff'}}>🏕 Autre</option>
            </select>
          </div>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>DESTINATION</label>
            <input className="input" placeholder="Ex: Rivière Babine, Colombie-Britannique"
              value={dest} onChange={e=>setDest(e.target.value)}
              style={{background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}
            />
          </div>
          <div className="field">
            <label style={{color:'rgba(255,255,255,.5)'}}>DATES</label>
            <div style={{display:'flex',gap:8}}>
              <input className="input" type="date" value={d1} onChange={e=>setD1(e.target.value)}
                style={{flex:1,background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}/>
              <input className="input" type="date" value={d2} onChange={e=>setD2(e.target.value)}
                style={{flex:1,background:'rgba(255,255,255,.08)',border:'1.5px solid rgba(255,255,255,.15)',color:'#fff'}}/>
            </div>
          </div>
          <button className="btn" onClick={creer} disabled={loading||!nom.trim()}
            style={{background:loading||!nom.trim()?'rgba(255,255,255,.15)':'#fff',color:loading||!nom.trim()?'rgba(255,255,255,.4)':'var(--forest)',fontWeight:700,marginTop:4}}>
            {loading ? 'Création en cours…' : 'Créer le trip →'}
          </button>
        </div>
        <p style={{fontSize:12,color:'rgba(255,255,255,.3)',marginTop:20,textAlign:'center',lineHeight:1.6}}>
          Un lien unique sera généré. Partagez-le dans Messenger.
        </p>
      </div>
    </main>
  )
}