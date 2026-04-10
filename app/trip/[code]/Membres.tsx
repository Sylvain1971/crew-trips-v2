'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import type { Membre } from '@/lib/types'

const COULEURS_BG = ['#EFF6FF','#F0FDF4','#FFFBEB','#FFF1F2','#F5F3FF','#F0F9FF','#FFF7ED','#EEF2FF']

export default function Membres({ tripId, tripCode, membre }: { tripId: string, tripCode: string, membre: Membre }) {
  const [membres, setMembres] = useState<Membre[]>([])
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    supabase.from('membres').select('*').eq('trip_id', tripId)
      .order('created_at', {ascending:true})
      .then(({data}) => data && setMembres(data))
  }, [tripId])

  function copyLink() {
    const url = `${window.location.origin}/trip/${tripCode}`
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 3000)
  }

  function share() {
    const url = `${window.location.origin}/trip/${tripCode}`
    if (navigator.share) {
      navigator.share({ title: 'Crew Trips', text: 'Rejoins notre trip !', url })
    } else {
      copyLink()
    }
  }

  return (
    <div style={{padding:'20px 16px 100px'}}>
      {/* Inviter section */}
      <div style={{background:'var(--forest)',borderRadius:18,padding:20,marginBottom:20,textAlign:'center'}}>
        <div style={{fontSize:32,marginBottom:8}}>🔗</div>
        <div style={{color:'#fff',fontWeight:700,fontSize:17,marginBottom:6,letterSpacing:'-.02em'}}>Inviter des participants</div>
        <div style={{color:'rgba(255,255,255,.6)',fontSize:13,marginBottom:16,lineHeight:1.5}}>
          Partagez ce lien dans Messenger, WhatsApp ou par texte.<br/>
          Aucun compte requis — juste cliquer et entrer son prénom.
        </div>
        <div style={{background:'rgba(255,255,255,.08)',borderRadius:10,padding:'10px 14px',
          fontSize:13,color:'rgba(255,255,255,.7)',fontFamily:'monospace',marginBottom:14,
          wordBreak:'break-all',border:'1px solid rgba(255,255,255,.15)'}}>
          {typeof window !== 'undefined' ? `${window.location.origin}/trip/${tripCode}` : `crew-trips.vercel.app/trip/${tripCode}`}
        </div>
        <div style={{display:'flex',gap:10}}>
          <button onClick={copyLink}
            style={{flex:1,padding:'12px',borderRadius:10,border:'1.5px solid rgba(255,255,255,.25)',
              background: copied ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.1)',
              color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',transition:'background .2s'}}>
            {copied ? '✓ Lien copié !' : '📋 Copier le lien'}
          </button>
          <button onClick={share}
            style={{flex:1,padding:'12px',borderRadius:10,border:'none',
              background:'#fff',color:'var(--forest)',fontWeight:700,fontSize:14,cursor:'pointer'}}>
            ↗ Partager
          </button>
        </div>
      </div>

      {/* Liste membres */}
      <div style={{fontWeight:700,fontSize:16,marginBottom:14,letterSpacing:'-.02em'}}>
        Participants ({membres.length})
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8}}>
        {membres.map((m, i) => (
          <div key={m.id} className="card" style={{display:'flex',alignItems:'center',gap:14,padding:'13px 15px'}}>
            <div style={{width:44,height:44,borderRadius:14,background:COULEURS_BG[i%COULEURS_BG.length],
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:20,fontWeight:800,color:m.couleur,flexShrink:0}}>
              {m.prenom[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:16,letterSpacing:'-.01em'}}>{m.prenom}</div>
              <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>
                Membre depuis {new Date(m.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'long'})}
              </div>
            </div>
            {m.id === membre.id && (
              <div style={{background:'var(--sand)',borderRadius:7,padding:'3px 9px',fontSize:11,fontWeight:700,color:'var(--text-2)'}}>
                Vous
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
