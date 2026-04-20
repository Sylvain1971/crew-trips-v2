'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Membre, Trip, ParticipantAutorise } from '@/lib/types'
import { SvgIcon } from '@/lib/svgIcons'
import QRCode from 'qrcode'

const COULEURS_BG = ['#EFF6FF','#F0FDF4','#FFFBEB','#FFF1F2','#F5F3FF','#F0F9FF','#FFF7ED','#EEF2FF']

export default function Membres({trip, membre, onTripUpdate}: {
  trip: Trip, membre: Membre, onTripUpdate: (t: Partial<Trip>) => void
}) {
  const [membres, setMembres] = useState<Membre[]>([])
  const [autorises, setAutorises] = useState<ParticipantAutorise[]>([])
  const [copied, setCopied] = useState(false)
  const [newPrenom, setNewPrenom] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editingPrenom, setEditingPrenom] = useState(false)
  const [newPrenomSelf, setNewPrenomSelf] = useState('')
  const [savingPrenom, setSavingPrenom] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [generatingShare, setGeneratingShare] = useState(false)
  const [showQR, setShowQR] = useState(false)
  const [qrDataUrl, setQrDataUrl] = useState('')
  const router = useRouter()
  const isCreateur = membre.is_createur

  useEffect(()=>{
    supabase.from('membres').select('*').eq('trip_id',trip.id).order('created_at',{ascending:true})
      .then(({data})=>data&&setMembres(data))
    supabase.from('participants_autorises').select('*').eq('trip_id',trip.id).order('prenom')
      .then(({data})=>data&&setAutorises(data))
  },[trip.id])

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/trip/${trip.code}`)
    setCopied(true); setTimeout(()=>setCopied(false),3000)
  }
  function openTexto() {
    const url = `${window.location.origin}/trip/${trip.code}`
    const body = `Je t'invite au trip ${trip.nom}. Voici le lien: ${url}`
    window.location.href = `sms:&body=${encodeURIComponent(body)}`
  }
  function openMail() {
    const url = `${window.location.origin}/trip/${trip.code}`
    const subject = `Invitation : ${trip.nom} (Crew Trips)`
    const body = `Je t'invite au trip ${trip.nom}.\n\n${url}\n\nCrew Trips regroupe les infos du voyage — vols, lodge, chat. Aucun compte requis.`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
  async function openQR() {
    const url = `${window.location.origin}/trip/${trip.code}`
    try {
      const dataUrl = await QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#0F2D0F', light: '#ffffff' } })
      setQrDataUrl(dataUrl)
      setShowQR(true)
    } catch {
      alert('Erreur lors de la generation du QR code')
    }
  }
  function downloadQR() {
    if (!qrDataUrl) return
    const a = document.createElement('a')
    a.href = qrDataUrl
    a.download = `crew-trips-${trip.code}.png`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
  }
  async function shareQR() {
    if (!qrDataUrl) return
    try {
      const res = await fetch(qrDataUrl)
      const blob = await res.blob()
      const file = new File([blob], `crew-trips-${trip.code}.png`, { type: 'image/png' })
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title: 'QR Crew Trips', text: `QR code pour rejoindre ${trip.nom}` })
      } else {
        downloadQR()
      }
    } catch {
      // User cancelled or error
    }
  }

  async function ajouterAutorise() {
    if (!newPrenom.trim()) return
    const {data} = await supabase.from('participants_autorises')
      .insert({trip_id:trip.id,prenom:newPrenom.trim()}).select().single()
    if (data) { setAutorises(p=>[...p,data]); setNewPrenom('') }
  }

  async function retirerAutorise(id: string, prenom: string) {
    await supabase.from('participants_autorises').delete().eq('id',id)
    setAutorises(p=>p.filter(a=>a.id!==id))
    // Déconnecter le membre actif correspondant (jamais le créateur)
    const m = membres.find(m=>m.prenom.toLowerCase()===prenom.toLowerCase())
    if (m && !m.is_createur) {
      await supabase.from('membres').delete().eq('id',m.id)
      setMembres(p=>p.filter(x=>x.id!==m.id))
      // Effacer du localStorage uniquement si c'est CE membre (pas le créateur connecté)
      if (typeof window !== 'undefined' && m.id !== membre.id) {
        try {
          const stored = localStorage.getItem(`crew2-${trip.code}`)
          if (stored) {
            const storedMembre = JSON.parse(stored)
            if (storedMembre?.id === m.id) localStorage.removeItem(`crew2-${trip.code}`)
          }
        } catch {}
      }
    }
  }

  async function retirerMembre(m: Membre) {
    if (m.is_createur) return
    if (!confirm(`Retirer ${m.prenom} du trip ?`)) return
    await supabase.from('membres').delete().eq('id',m.id)
    setMembres(p=>p.filter(x=>x.id!==m.id))
  }

  async function togglePermission(key: 'can_delete'|'can_edit'|'can_post_photos') {
    const oldVal = trip[key]
    const newVal = !oldVal
    // Optimistic : on met à jour l'UI tout de suite
    onTripUpdate({[key]:newVal})
    try {
      const { error } = await supabase.from('trips').update({[key]:newVal}).eq('id',trip.id)
      if (error) throw error
    } catch (e: unknown) {
      // Rollback
      onTripUpdate({[key]:oldVal})
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function savePrenom() {
    if (!newPrenomSelf.trim() || newPrenomSelf.trim() === membre.prenom) { setEditingPrenom(false); return }
    setSavingPrenom(true)
    await supabase.from('membres').update({ prenom: newPrenomSelf.trim() }).eq('id', membre.id)
    // Mettre à jour le localStorage et la liste locale
    try {
      const stored = localStorage.getItem(`crew2-${trip.code}`)
      if (stored) {
        const m = JSON.parse(stored)
        m.prenom = newPrenomSelf.trim()
        localStorage.setItem(`crew2-${trip.code}`, JSON.stringify(m))
      }
    } catch {}
    setMembres(p => p.map(m => m.id === membre.id ? { ...m, prenom: newPrenomSelf.trim() } : m))
    setSavingPrenom(false)
    setEditingPrenom(false)
  }

  async function generateShareToken() {
    if (generatingShare) return
    const oldToken = trip.share_token
    const newToken = crypto.randomUUID()
    // Optimistic
    setGeneratingShare(true)
    onTripUpdate({ share_token: newToken })
    try {
      const { error } = await supabase.from('trips').update({ share_token: newToken }).eq('id', trip.id)
      if (error) throw error
    } catch (e: unknown) {
      // Rollback
      onTripUpdate({ share_token: oldToken })
      alert('Erreur lors de la génération du lien : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGeneratingShare(false)
    }
  }

  async function regenerateShareToken() {
    if (!confirm('Régénérer le lien ? L\'ancien lien ne fonctionnera plus et toute personne qui l\'a reçu perdra l\'accès.')) return
    if (generatingShare) return
    const oldToken = trip.share_token
    const newToken = crypto.randomUUID()
    // Optimistic : mettre à jour tout de suite
    setGeneratingShare(true)
    onTripUpdate({ share_token: newToken })
    try {
      const { error } = await supabase.from('trips').update({ share_token: newToken }).eq('id', trip.id)
      if (error) throw error
    } catch (e: unknown) {
      // Rollback
      onTripUpdate({ share_token: oldToken })
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGeneratingShare(false)
    }
  }

  function copyShareLink() {
    if (!trip.share_token) return
    navigator.clipboard.writeText(`${window.location.origin}/album/${trip.share_token}`)
    setShareCopied(true); setTimeout(()=>setShareCopied(false),3000)
  }

  async function supprimerTrip() {
    if (deleteConfirm !== trip.nom) return
    setDeleting(true)
    try {
      // Supprimer les tables liées avant le trip (au cas où CASCADE manquant en DB)
      await supabase.from('messages').delete().eq('trip_id', trip.id)
      await supabase.from('infos').delete().eq('trip_id', trip.id)
      await supabase.from('participants_autorises').delete().eq('trip_id', trip.id)
      await supabase.from('membres').delete().eq('trip_id', trip.id)
      const { error } = await supabase.from('trips').delete().eq('id', trip.id)
      if (error) throw new Error(error.message)
      // Nettoyer localStorage
      try {
        localStorage.removeItem(`crew2-${trip.code}`)
        const raw = localStorage.getItem('crew-mes-trips')
        if (raw) {
          const saved = JSON.parse(raw).filter((t: {code:string}) => t.code !== trip.code)
          localStorage.setItem('crew-mes-trips', JSON.stringify(saved))
        }
        // Effacer lastTripCode SW — evite redirect vers trip supprime
        if ('serviceWorker' in navigator && navigator.serviceWorker.controller) {
          navigator.serviceWorker.controller.postMessage({ type: 'CLEAR_LAST_TRIP' })
        }
      } catch {}
      router.push('/mes-trips')
    } catch (err) {
      alert('Erreur lors de la suppression. Réessayez.')
      console.error('supprimerTrip:', err)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div style={{padding:'16px 16px 100px'}}>
      {/* Inviter */}
      <div style={{background:'var(--forest)',borderRadius:18,padding:20,marginBottom:16,textAlign:'center'}}>
        <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:10,background:'#7C3AED',color:'#fff',marginBottom:6}}><SvgIcon name="link" size={24} /></div>
        <div style={{color:'#fff',fontWeight:700,fontSize:16,marginBottom:6}}>Inviter des participants</div>
        <div style={{color:'rgba(255,255,255,.55)',fontSize:13,marginBottom:14,lineHeight:1.5}}>
          Partagez ce lien — aucun compte requis.
        </div>
        <div style={{background:'rgba(255,255,255,.08)',borderRadius:10,padding:'8px 12px',fontSize:12,
          color:'rgba(255,255,255,.6)',fontFamily:'monospace',marginBottom:12,wordBreak:'break-all',
          border:'1px solid rgba(255,255,255,.12)'}}>
          {typeof window!=='undefined'?`${window.location.origin}/trip/${trip.code}`:`/trip/${trip.code}`}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <button onClick={copyLink} style={{gridColumn:'1 / -1',padding:'12px',borderRadius:10,border:'none',
            background:copied?'rgba(255,255,255,.92)':'#fff',
            color:'var(--forest)',fontWeight:700,fontSize:14,cursor:'pointer',transition:'background .2s',
            display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
            {copied?<><SvgIcon name="check" size={14} />Copié !</>:<><SvgIcon name="clipboard" size={14} />Copier le lien</>}
          </button>
          <button onClick={openQR} style={{padding:'11px',borderRadius:10,
            border:'1.5px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.08)',
            color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',transition:'background .2s',
            display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <SvgIcon name="qrcode" size={14} />QR Code
          </button>
          <button onClick={openMail} style={{padding:'11px',borderRadius:10,
            border:'1.5px solid rgba(255,255,255,.2)',background:'rgba(255,255,255,.08)',
            color:'#fff',fontWeight:600,fontSize:14,cursor:'pointer',transition:'background .2s',
            display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <SvgIcon name="mail" size={14} />Courriel
          </button>
          <button onClick={openTexto} style={{gridColumn:'1 / -1',padding:'12px',borderRadius:10,border:'none',
            background:'var(--green)',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',transition:'background .2s',
            display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
            <SvgIcon name="chat" size={14} />Texto
          </button>
        </div>
      </div>

      {/* Partager l'album — créateur seulement */}
      {isCreateur && (
        <div className="card" style={{marginBottom:16,padding:'14px 16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:trip.share_token?10:12}}>
            <div style={{fontWeight:700,fontSize:14,display:'flex',alignItems:'center',gap:7}}>
              <span style={{display:'inline-flex',color:'#E11D48'}}><SvgIcon name="camera" size={16} /></span> Partager l&apos;album
            </div>
          </div>
          {!trip.share_token && (
            <>
              <div style={{fontSize:12,color:'var(--text-3)',marginBottom:10,lineHeight:1.5}}>
                Génère un lien public en lecture seule pour partager l&apos;album avec quelqu&apos;un qui n&apos;est pas dans le trip.
              </div>
              <button onClick={generateShareToken} disabled={generatingShare}
                style={{width:'100%',padding:'11px',borderRadius:10,border:'none',
                  background:generatingShare?'var(--border)':'var(--forest)',
                  color:'#fff',fontWeight:600,fontSize:14,cursor:generatingShare?'default':'pointer',
                  display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
                {generatingShare?'Génération…':<><SvgIcon name="link" size={16} />Générer un lien de partage</>}
              </button>
            </>
          )}
          {trip.share_token && (
            <>
              <div style={{fontSize:12,color:'var(--text-3)',marginBottom:8,lineHeight:1.5}}>
                Toute personne avec ce lien peut consulter l&apos;album en lecture seule.
              </div>
              <div style={{background:'var(--sand)',borderRadius:10,padding:'8px 12px',fontSize:12,
                color:'var(--text-2)',fontFamily:'monospace',marginBottom:10,wordBreak:'break-all',
                border:'1px solid var(--border)'}}>
                {typeof window!=='undefined'?`${window.location.origin}/album/${trip.share_token}`:`/album/${trip.share_token}`}
              </div>
              <div style={{display:'flex',gap:8}}>
                <button onClick={copyShareLink}
                  style={{flex:1,padding:'10px',borderRadius:10,border:'none',
                    background:shareCopied?'var(--green)':'var(--forest)',
                    color:'#fff',fontWeight:600,fontSize:13,cursor:'pointer',transition:'background .2s',
                    display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  {shareCopied?<><SvgIcon name="check" size={14} />Copié !</>:<><SvgIcon name="clipboard" size={14} />Copier le lien</>}
                </button>
                <button onClick={regenerateShareToken} disabled={generatingShare}
                  style={{padding:'10px 14px',borderRadius:10,border:'1px solid var(--border)',
                    background:'#fff',color:'var(--text-2)',fontWeight:600,fontSize:13,
                    cursor:generatingShare?'default':'pointer',
                    display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
                  {generatingShare?'…':<><SvgIcon name="refresh" size={14} />Régénérer</>}
                </button>
              </div>
            </>
          )}
        </div>
      )}

      {/* Participants autorisés — créateur seulement */}
      {isCreateur && (
        <div className="card" style={{marginBottom:16,padding:'14px 16px'}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:4,display:'inline-flex',alignItems:'center',gap:7}}>
            <span style={{display:'inline-flex',color:'#B45309'}}><SvgIcon name="lock" size={16} /></span> Participants autorisés
          </div>
          <div style={{fontSize:12,color:'var(--text-3)',marginBottom:12,lineHeight:1.5}}>
            {autorises.length===0
              ? 'Liste vide — tout le monde peut entrer. Ajoutez des prénoms pour restreindre l\'accès.'
              : `${autorises.length} prénom${autorises.length>1?'s':''} autorisé${autorises.length>1?'s':''}.`}
          </div>
          <div style={{display:'flex',gap:8,marginBottom:10}}>
            <input className="input" placeholder="Prénom à autoriser" value={newPrenom}
              onChange={e=>setNewPrenom(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&ajouterAutorise()}
              style={{flex:1,fontSize:13,padding:'9px 12px'}} />
            <button onClick={ajouterAutorise} disabled={!newPrenom.trim()}
              style={{padding:'0 14px',borderRadius:10,border:'none',
                background:newPrenom.trim()?'var(--forest)':'var(--border)',
                color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>+</button>
          </div>
          {autorises.length>0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
              {autorises.map(a=>{
                const connecte = membres.some(m=>m.prenom.toLowerCase()===a.prenom.toLowerCase())
                return (
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:6,
                    background:connecte?'#F0FDF4':'var(--sand)',borderRadius:20,
                    padding:'5px 10px 5px 12px',border:`1px solid ${connecte?'#BBF7D0':'var(--border)'}`}}>
                    <span style={{width:7,height:7,borderRadius:'50%',
                      background:connecte?'#16A34A':'#D1D5DB',flexShrink:0}} />
                    <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{a.prenom}</span>
                    <button onClick={()=>retirerAutorise(a.id,a.prenom)}
                      style={{background:'none',border:'none',color:'var(--text-3)',
                        fontSize:16,cursor:'pointer',padding:'0 2px',lineHeight:1}}>×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Permissions — créateur seulement */}
      {isCreateur && (
        <div className="card" style={{marginBottom:16,padding:'14px 16px'}}>
          <div style={{fontWeight:700,fontSize:14,marginBottom:12,display:'inline-flex',alignItems:'center',gap:7}}>
            <span style={{display:'inline-flex',color:'#6B7280'}}><SvgIcon name="settings" size={16} /></span> Permissions des participants
          </div>
          {([
            {key:'can_delete' as const, label:'Peuvent supprimer des cards', desc:'Les participants peuvent effacer des infos'},
            {key:'can_edit' as const,   label:'Peuvent modifier des cards',   desc:'Les participants peuvent éditer des infos'},
            {key:'can_post_photos' as const, label:"Peuvent gérer l'album", desc:"Les participants peuvent ajouter, partager et télécharger les photos"},
          ]).map(p=>(
            <div key={p.key} style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              padding:'10px 0',borderBottom:'1px solid var(--border-light)'}}>
              <div>
                <div style={{fontSize:14,fontWeight:600}}>{p.label}</div>
                <div style={{fontSize:12,color:'var(--text-3)',marginTop:2}}>{p.desc}</div>
              </div>
              <button onClick={()=>togglePermission(p.key)}
                style={{width:44,height:26,borderRadius:13,border:'none',cursor:'pointer',
                  background:(trip[p.key] !== false)?'var(--green)':'#D1D5DB',transition:'background .2s',
                  position:'relative',flexShrink:0}}>
                <span style={{position:'absolute',top:3,borderRadius:'50%',width:20,height:20,
                  background:'#fff',transition:'left .2s',
                  left:trip[p.key]?'calc(100% - 23px)':'3px'}} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Membres actifs */}
      <div style={{fontWeight:700,fontSize:15,marginBottom:12,letterSpacing:'-.01em'}}>
        Membres connectés ({membres.length})
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:8,marginBottom:24}}>
        {membres.map((m,i)=>(
          <div key={m.id} className="card" style={{display:'flex',alignItems:'center',gap:12,padding:'12px 14px'}}>
            <div style={{width:42,height:42,borderRadius:13,background:COULEURS_BG[i%COULEURS_BG.length],
              display:'flex',alignItems:'center',justifyContent:'center',
              fontSize:18,fontWeight:800,color:m.couleur,flexShrink:0}}>
              {m.prenom[0].toUpperCase()}
            </div>
            <div style={{flex:1}}>
              <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:7}}>
                {m.prenom}
                {m.is_createur && (
                  <span style={{fontSize:10,fontWeight:700,color:'#B45309',background:'#FFFBEB',
                    border:'1px solid #FDE68A',borderRadius:6,padding:'2px 6px',letterSpacing:'.04em'}}>
                    ADMINISTRATEUR
                  </span>
                )}
              </div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:1}}>
                {m.id===membre.id ? 'Vous · ' : ''}
                Depuis {new Date(m.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'long'})}
              {m.id===membre.id && !editingPrenom && (
                <button onClick={()=>{setNewPrenomSelf(m.prenom);setEditingPrenom(true)}}
                  style={{background:"none",border:"none",padding:0,marginTop:3,cursor:"pointer",display:"flex",alignItems:"center",gap:5,color:"var(--green)"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><path d="M8 16l2.5-.5 6.5-6.5a1.5 1.5 0 0 0-2.1-2.1L8.5 13.5 8 16z"/></svg>
                  <span style={{fontSize:11,fontWeight:600,textDecoration:"underline"}}>Modifier le nom</span>
                </button>
              )}
              {m.id===membre.id && editingPrenom && (
                <div style={{display:"flex",gap:6,marginTop:6,alignItems:"center"}}>
                  <input className="input" value={newPrenomSelf}
                    onChange={e=>setNewPrenomSelf(e.target.value)}
                    onKeyDown={e=>{if(e.key==="Enter") savePrenom(); if(e.key==="Escape") setEditingPrenom(false)}}
                    autoFocus style={{flex:1,fontSize:13,padding:"6px 10px"}} />
                  <button onClick={savePrenom} disabled={savingPrenom||!newPrenomSelf.trim()}
                    style={{padding:"6px 12px",borderRadius:8,border:"none",background:"var(--forest)",
                      color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer",flexShrink:0}}>
                    {savingPrenom?"…":"OK"}
                  </button>
                  <button onClick={()=>setEditingPrenom(false)}
                    style={{padding:"6px 10px",borderRadius:8,border:"1px solid var(--border)",
                      background:"transparent",color:"var(--text-2)",fontSize:12,cursor:"pointer",flexShrink:0}}>
                    ✕
                  </button>
                </div>
              )}
              </div>
            </div>
            {isCreateur && !m.is_createur && (
              <button onClick={()=>retirerMembre(m)}
                style={{background:'#FEF2F2',border:'1px solid #FECACA',borderRadius:8,
                  padding:'5px 10px',fontSize:12,fontWeight:600,color:'#DC2626',cursor:'pointer'}}>
                Retirer
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Dupliquer le trip — créateur seulement */}
      {isCreateur && (
        <div style={{marginBottom:16}}>
          <button onClick={()=>{
            const participants = autorises.map(a=>a.prenom)
            const params = new URLSearchParams({
              nom: trip.nom,
              type: trip.type,
              dest: trip.destination||'',
              participants: participants.join(','),
              sourceCode: trip.code,
            })
            try { sessionStorage.setItem('crew-creator-validated', '1') } catch {}
            router.push('/nouveau?' + params.toString())
          }}
            style={{width:'100%',padding:'12px',borderRadius:10,border:'1.5px solid var(--forest)',
              background:'transparent',color:'var(--forest)',fontWeight:600,fontSize:14,cursor:'pointer',
              display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
            <SvgIcon name="clipboard" size={16} /> Dupliquer ce trip
          </button>
        </div>
      )}

      {/* Supprimer le trip — créateur seulement */}
      {isCreateur && (
        <div style={{borderTop:'1px solid var(--border)',paddingTop:20}}>
          {!showDelete ? (
            <button onClick={()=>setShowDelete(true)}
              style={{width:'100%',padding:'12px',borderRadius:10,border:'1.5px solid #FECACA',
                background:'transparent',color:'#DC2626',fontWeight:600,fontSize:14,cursor:'pointer',
                display:'inline-flex',alignItems:'center',justifyContent:'center',gap:8}}>
              <SvgIcon name="trash" size={16} /> Supprimer ce trip
            </button>
          ) : (
            <div style={{background:'#FEF2F2',borderRadius:12,padding:16,border:'1.5px solid #FECACA'}}>
              <div style={{fontWeight:700,fontSize:14,color:'#DC2626',marginBottom:4,display:'inline-flex',alignItems:'center',gap:7}}>
                <span style={{display:'inline-flex',color:'#DC2626'}}><SvgIcon name="alert" size={16} /></span> Supprimer ce trip ?
              </div>
              <div style={{fontSize:13,color:'#B91C1C',marginBottom:12,lineHeight:1.5}}>
                Cette action est irréversible. Tapez <strong>"{trip.nom}"</strong> pour confirmer.
              </div>
              <input className="input" placeholder={trip.nom} value={deleteConfirm}
                onChange={e=>setDeleteConfirm(e.target.value)}
                style={{marginBottom:10,fontSize:13}} />
              <div style={{display:'flex',gap:8}}>
                <button onClick={supprimerTrip} disabled={deleteConfirm!==trip.nom||deleting}
                  style={{flex:1,padding:'11px',borderRadius:10,border:'none',
                    background:deleteConfirm===trip.nom?'#DC2626':'#FECACA',
                    color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer'}}>
                  {deleting?'Suppression…':'Supprimer définitivement'}
                </button>
                <button onClick={()=>{setShowDelete(false);setDeleteConfirm('')}}
                  style={{padding:'11px 16px',borderRadius:10,border:'1px solid var(--border)',
                    background:'#fff',color:'var(--text-2)',fontWeight:600,fontSize:14,cursor:'pointer'}}>
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {/* QR Code modal */}
      {showQR && (
        <div onClick={()=>setShowQR(false)}
          style={{position:'fixed',inset:0,background:'rgba(0,0,0,.85)',zIndex:1000,
            display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:20}}>
          <div onClick={e=>e.stopPropagation()}
            style={{background:'#fff',borderRadius:20,padding:24,maxWidth:400,width:'100%',textAlign:'center'}}>
            <div style={{fontSize:18,fontWeight:700,color:'#0F2D0F',marginBottom:4}}>Scanner pour rejoindre</div>
            <div style={{fontSize:13,color:'#6b7280',marginBottom:16}}>{trip.nom}</div>
            {qrDataUrl && (
              <img src={qrDataUrl} alt="QR code" style={{width:'100%',maxWidth:320,height:'auto',display:'block',margin:'0 auto 16px',borderRadius:12}} />
            )}
            <div style={{fontSize:12,color:'#6b7280',marginBottom:16,lineHeight:1.5}}>
              L&apos;invité scanne ce code avec l&apos;appareil photo de son iPhone pour ouvrir directement dans Safari.
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8,marginBottom:8}}>
              <button onClick={shareQR}
                style={{padding:'11px',borderRadius:10,border:'none',background:'var(--forest)',color:'#fff',fontWeight:700,fontSize:14,cursor:'pointer',
                  display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <SvgIcon name="link" size={14} />Partager
              </button>
              <button onClick={downloadQR}
                style={{padding:'11px',borderRadius:10,border:'1.5px solid var(--border)',background:'#fff',color:'var(--text-1)',fontWeight:600,fontSize:14,cursor:'pointer',
                  display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <SvgIcon name="download" size={14} />Télécharger
              </button>
            </div>
            <button onClick={()=>setShowQR(false)}
              style={{width:'100%',padding:'11px',borderRadius:10,border:'none',background:'transparent',color:'#6b7280',fontWeight:600,fontSize:13,cursor:'pointer'}}>
              Fermer
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
