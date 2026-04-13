'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, getCat } from '@/lib/types'
import type { InfoCard, Membre, Trip } from '@/lib/types'

function countdown(d?: string) {
  if (!d) return null
  const diff = Math.ceil((new Date(d).getTime() - Date.now()) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return "C'est aujourd'hui !"
  return `${diff}j avant le départ`
}

function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

function isPdf(url?: string) {
  if (!url) return false
  return url.toLowerCase().includes('.pdf') || url.includes('application/pdf')
}

function ago(ts: string) {
  const d = Date.now() - new Date(ts).getTime()
  if (d < 3600000) return `${Math.floor(d/60000)}min`
  if (d < 86400000) return `${Math.floor(d/3600000)}h`
  return new Date(ts).toLocaleDateString('fr-CA',{day:'numeric',month:'short'})
}

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}

export default function Infos({ trip, membre }: { trip: Trip, membre: Membre }) {
  const [cards, setCards] = useState<InfoCard[]>([])
  const [filtre, setFiltre] = useState<string>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editLodge, setEditLodge] = useState(false)
  const [cat, setCat] = useState('transport')
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [lien, setLien] = useState('')
  const [pdfFile, setPdfFile] = useState<File|null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [pdfViewer, setPdfViewer] = useState<{url:string,nom:string}|null>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const [lodge, setLodge] = useState({
    nom: trip.lodge_nom||'', adresse: trip.lodge_adresse||'',
    tel: trip.lodge_tel||'', wifi: trip.lodge_wifi||'',
    code: trip.lodge_code||'', arrivee: trip.lodge_arrivee||''
  })
  const [savingLodge, setSavingLodge] = useState(false)
  const [copied, setCopied] = useState(false)
  const cd = countdown(trip.date_debut)

  useEffect(() => {
    supabase.from('infos').select('*').eq('trip_id', trip.id)
      .order('created_at', {ascending:false})
      .then(({data}) => data && setCards(data))
  }, [trip.id])

  const filtered = filtre === 'all' ? cards : cards.filter(c => c.categorie === filtre)

  async function uploadPdf(file: File): Promise<string|null> {
    setUploading(true)
    const ext = file.name.split('.').pop() || 'pdf'
    const path = `${trip.id}/docs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g,'_')}`
    const { error } = await supabase.storage.from('trip-photos').upload(path, file, {
      contentType: 'application/pdf', upsert: false
    })
    setUploading(false)
    if (error) { alert('Erreur upload: ' + error.message); return null }
    const { data: { publicUrl } } = supabase.storage.from('trip-photos').getPublicUrl(path)
    return publicUrl
  }

  async function save() {
    if (!titre.trim()) return
    setSaving(true)
    let fichierUrl: string|null = null
    let fichierNom: string|null = null
    let fichierTaille: number|null = null

    if (pdfFile) {
      fichierUrl = await uploadPdf(pdfFile)
      if (!fichierUrl) { setSaving(false); return }
      fichierNom = pdfFile.name
      fichierTaille = pdfFile.size
    }

    const { data, error } = await supabase.from('infos').insert({
      trip_id: trip.id, categorie: cat, titre: titre.trim(),
      contenu: contenu.trim()||null,
      lien: lien.trim()||null,
      fichier_url: fichierUrl,
      fichier_nom: fichierNom,
      fichier_taille: fichierTaille,
      membre_prenom: membre.prenom,
    }).select().single()
    if (!error && data) {
      setCards(p => [data, ...p])
      setTitre(''); setContenu(''); setLien(''); setPdfFile(null)
      setSheetOpen(false)
    }
    setSaving(false)
  }

  async function saveLodge() {
    setSavingLodge(true)
    await supabase.from('trips').update({
      lodge_nom: lodge.nom||null, lodge_adresse: lodge.adresse||null,
      lodge_tel: lodge.tel||null, lodge_wifi: lodge.wifi||null,
      lodge_code: lodge.code||null, lodge_arrivee: lodge.arrivee||null,
    }).eq('id', trip.id)
    setSavingLodge(false)
    setEditLodge(false)
  }

  async function removeCard(id: string) {
    await supabase.from('infos').delete().eq('id', id)
    setCards(p => p.filter(c => c.id !== id))
  }

  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  const haslodge = lodge.nom || lodge.adresse || lodge.tel || lodge.wifi || lodge.code || lodge.arrivee
  const tripDate = trip.date_debut ? new Date(trip.date_debut).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'}) : ''
  const tripDateFin = trip.date_fin ? new Date(trip.date_fin).toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'}) : ''

  return (
    <>
      {/* PDF Viewer Sheet */}
      {pdfViewer && (
        <>
          <div className="overlay open" onClick={() => setPdfViewer(null)} />
          <div className="sheet open" style={{height:'92dvh',display:'flex',flexDirection:'column',padding:0}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'14px 16px',borderBottom:'1px solid var(--border)',flexShrink:0}}>
              <div style={{fontWeight:700,fontSize:15,flex:1,minWidth:0,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                📄 {pdfViewer.nom}
              </div>
              <div style={{display:'flex',gap:8,flexShrink:0}}>
                <a href={pdfViewer.url} target="_blank" rel="noreferrer"
                  style={{fontSize:13,fontWeight:600,color:'var(--green)',background:'var(--sand)',padding:'6px 12px',borderRadius:8,textDecoration:'none'}}>
                  ↗ Ouvrir
                </a>
                <button onClick={() => setPdfViewer(null)}
                  style={{background:'none',border:'none',fontSize:22,color:'var(--text-3)',cursor:'pointer',lineHeight:1}}>×</button>
              </div>
            </div>
            <iframe src={`${pdfViewer.url}#toolbar=0`} style={{flex:1,border:'none',width:'100%'}}
              title={pdfViewer.nom} />
          </div>
        </>
      )}

      {/* Header trip */}
      <div style={{background:'var(--forest)',padding:'18px 16px 16px',color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:10}}>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:13,color:'rgba(255,255,255,.5)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>
              {trip.destination || 'Crew Trip'}
            </div>
            <div style={{fontSize:20,fontWeight:800,letterSpacing:'-.02em',lineHeight:1.2,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              {trip.nom}
            </div>
            {tripDate && (
              <div style={{fontSize:13,color:'rgba(255,255,255,.5)',marginTop:4}}>
                {tripDate}{tripDateFin ? ` → ${tripDateFin}` : ''}
              </div>
            )}
          </div>
          <button onClick={copyLink} style={{background:copied?'rgba(255,255,255,.2)':'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'8px 14px',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',flexShrink:0,marginLeft:12,transition:'background .2s'}}>
            {copied ? '✓ Copié !' : '🔗 Inviter'}
          </button>
        </div>
        {cd && (
          <div style={{background:'rgba(255,255,255,.08)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'rgba(255,255,255,.8)',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
            ⏳ {cd}
          </div>
        )}
      </div>

      {/* Section Lodge */}
      <div style={{background:'#fff',borderBottom:'1px solid var(--border)',padding:'14px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:haslodge||editLodge?12:0}}>
          <div style={{fontWeight:700,fontSize:14}}>🏕 Le Lodge</div>
          <button onClick={()=>setEditLodge(!editLodge)}
            style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px',fontSize:12,fontWeight:600,color:'var(--text-2)',cursor:'pointer'}}>
            {editLodge?'Fermer':haslodge?'Modifier':'+ Ajouter'}
          </button>
        </div>
        {!editLodge && haslodge && (
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {lodge.nom && <LodgeItem icon="🏠" label="Nom" val={lodge.nom} />}
            {lodge.adresse && <LodgeItem icon="📍" label="Adresse" val={lodge.adresse} />}
            {lodge.tel && <LodgeItem icon="📞" label="Téléphone" val={lodge.tel} link={`tel:${lodge.tel}`} />}
            {lodge.wifi && <LodgeItem icon="📶" label="WiFi" val={lodge.wifi} />}
            {lodge.code && <LodgeItem icon="🔑" label="Code d'accès" val={lodge.code} />}
            {lodge.arrivee && <LodgeItem icon="🕐" label="Arrivée" val={lodge.arrivee} />}
          </div>
        )}
        {editLodge && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              {[
                {k:'nom',label:'Nom du Lodge',ph:'Ex: Babine Norlakes'},
                {k:'adresse',label:'Adresse',ph:'Ex: Smithers, BC'},
                {k:'tel',label:'Téléphone',ph:'+1 250 000 0000'},
                {k:'wifi',label:'WiFi',ph:'Ex: fishing2025'},
                {k:'code',label:"Code d'accès",ph:'Ex: 4521#'},
                {k:'arrivee',label:"Heure d'arrivée",ph:'Ex: 14h le 8 juin'},
              ].map(f=>(
                <div key={f.k}>
                  <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>{f.label}</div>
                  <input className="input" placeholder={f.ph} value={lodge[f.k as keyof typeof lodge]}
                    onChange={e=>setLodge(p=>({...p,[f.k]:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
                </div>
              ))}
            </div>
            <button className="btn btn-primary" onClick={saveLodge} disabled={savingLodge} style={{padding:'10px',fontSize:13}}>
              {savingLodge?'Sauvegarde…':'Sauvegarder'}
            </button>
          </div>
        )}
      </div>

      {/* Filtres */}
      <div style={{background:'#fff',borderBottom:'1px solid var(--border)',overflowX:'auto',display:'flex',gap:6,padding:'10px 14px',position:'sticky',top:0,zIndex:20}}>
        <FilterBtn active={filtre==='all'} onClick={()=>setFiltre('all')}>Tout</FilterBtn>
        {CATEGORIES.map(c=>(
          <FilterBtn key={c.id} active={filtre===c.id} onClick={()=>setFiltre(c.id)} color={c.color}>
            {c.icon} {c.label.split(' ')[0]}
          </FilterBtn>
        ))}
      </div>

      {/* Cards */}
      <div style={{padding:'14px 14px 100px',display:'flex',flexDirection:'column',gap:10}}>
        {filtered.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">{filtre==='all'?'📋':getCat(filtre).icon}</span>
            Aucune info ici.<br/>Appuyez sur <strong>+</strong> pour ajouter.
          </div>
        ) : filtered.map(card => (
          <InfoCardView key={card.id} card={card}
            onDelete={()=>removeCard(card.id)}
            onViewPdf={(url,nom)=>setPdfViewer({url,nom})} />
        ))}
      </div>

      <button className="fab" onClick={()=>setSheetOpen(true)}>+</button>

      {/* Sheet ajouter */}
      <div className={`overlay ${sheetOpen?'open':''}`} onClick={()=>setSheetOpen(false)} />
      <div className={`sheet ${sheetOpen?'open':''}`}>
        <div className="sheet-handle" />
        <div className="sheet-title">Ajouter une info</div>
        <div className="field">
          <label>Catégorie</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
            {CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setCat(c.id)}
                style={{padding:'7px 12px',borderRadius:20,border:`1.5px solid ${cat===c.id?c.color:'var(--border)'}`,
                  background:cat===c.id?c.bg:'transparent',color:cat===c.id?c.color:'var(--text-2)',
                  fontSize:13,fontWeight:600,cursor:'pointer'}}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field"><label>Titre</label>
          <input className="input" placeholder="Ex: Liste d'équipement pêche Spey" value={titre} onChange={e=>setTitre(e.target.value)} />
        </div>
        <div className="field"><label>Détails (optionnel)</label>
          <textarea className="input" rows={2} placeholder="Notes, instructions…" value={contenu} onChange={e=>setContenu(e.target.value)} />
        </div>
        <div className="field"><label>Lien externe (optionnel)</label>
          <input className="input" type="url" placeholder="https://… (PDF, YouTube, site web)" value={lien} onChange={e=>setLien(e.target.value)} />
        </div>

        {/* Upload PDF */}
        <div className="field">
          <label>Document PDF (optionnel)</label>
          <input ref={fileRef} type="file" accept="application/pdf,.pdf" style={{display:'none'}}
            onChange={e=>{ const f=e.target.files?.[0]; if(f){ if(f.size>10485760){alert('Max 10 MB');return;} setPdfFile(f) } }} />
          {pdfFile ? (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,padding:'10px 14px'}}>
              <span style={{fontSize:24}}>📄</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{pdfFile.name}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>{fmtBytes(pdfFile.size)}</div>
              </div>
              <button onClick={()=>{setPdfFile(null);if(fileRef.current)fileRef.current.value='';}}
                style={{background:'none',border:'none',fontSize:20,color:'var(--text-3)',cursor:'pointer'}}>×</button>
            </div>
          ) : (
            <button onClick={()=>fileRef.current?.click()}
              style={{width:'100%',padding:'12px',border:'1.5px dashed var(--border)',borderRadius:10,
                background:'var(--sand)',color:'var(--text-2)',fontSize:14,fontWeight:600,cursor:'pointer',
                display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              📎 Choisir un PDF <span style={{fontSize:11,color:'var(--text-3)',fontWeight:400}}>(max 10 MB)</span>
            </button>
          )}
        </div>

        <button className="btn btn-primary" onClick={save} disabled={saving||uploading||!titre.trim()}>
          {uploading?'Upload en cours…':saving?'Ajout…':'Ajouter'}
        </button>
        <button className="btn btn-ghost" style={{marginTop:8}} onClick={()=>{setSheetOpen(false);setPdfFile(null)}}>Annuler</button>
      </div>
    </>
  )
}

function LodgeItem({icon,label,val,link}:{icon:string,label:string,val:string,link?:string}) {
  return (
    <div style={{background:'var(--sand)',borderRadius:10,padding:'9px 12px'}}>
      <div style={{fontSize:11,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>{icon} {label}</div>
      {link ? <a href={link} style={{fontSize:13,fontWeight:600,color:'var(--green)',textDecoration:'none'}}>{val}</a>
        : <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{val}</div>}
    </div>
  )
}

function FilterBtn({active,onClick,color,children}:{active:boolean,onClick:()=>void,color?:string,children:React.ReactNode}) {
  return (
    <button onClick={onClick} style={{
      flexShrink:0,padding:'6px 13px',borderRadius:20,
      border:`1.5px solid ${active?(color||'var(--forest)'):'var(--border)'}`,
      background:active?(color||'var(--forest)'):'transparent',
      color:active?'#fff':'var(--text-2)',fontSize:12,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'
    }}>{children}</button>
  )
}

function InfoCardView({card,onDelete,onViewPdf}:{
  card:InfoCard, onDelete:()=>void, onViewPdf:(url:string,nom:string)=>void
}) {
  const c = getCat(card.categorie)
  const ytId = card.lien ? getYoutubeId(card.lien) : null
  const hasPdf = !!card.fichier_url || (card.lien && isPdf(card.lien))
  const pdfUrl = card.fichier_url || card.lien || ''
  const pdfNom = (card as any).fichier_nom || card.titre || 'Document'

  return (
    <div className="card">
      <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'13px 14px'}}>
        <div style={{width:40,height:40,borderRadius:10,background:c.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
          {c.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,color:c.color,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:4}}>{c.label}</div>
          <div style={{fontWeight:700,fontSize:15,letterSpacing:'-.01em',marginBottom:card.contenu?5:0}}>{card.titre}</div>
          {card.contenu && <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.55,whiteSpace:'pre-wrap',marginBottom:6}}>{card.contenu}</div>}

          {/* Bouton PDF */}
          {hasPdf && (
            <button onClick={()=>onViewPdf(pdfUrl, pdfNom)}
              style={{display:'inline-flex',alignItems:'center',gap:7,marginTop:4,marginBottom:4,
                padding:'9px 14px',borderRadius:10,border:'1.5px solid var(--border)',
                background:'var(--sand)',color:'var(--text)',fontWeight:600,fontSize:13,
                cursor:'pointer',width:'100%',justifyContent:'center'}}>
              <span style={{fontSize:18}}>📄</span>
              Voir le document
              <span style={{marginLeft:'auto',fontSize:18,color:'var(--text-3)'}}>›</span>
            </button>
          )}

          {/* Lien non-PDF et non-YouTube */}
          {card.lien && !ytId && !isPdf(card.lien) && (
            <a href={card.lien} target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:5,marginTop:6,fontSize:13,
                color:'var(--green)',fontWeight:600,textDecoration:'none',
                background:'var(--sand)',padding:'5px 10px',borderRadius:7}}>
              🔗 Ouvrir le lien ↗
            </a>
          )}

          {/* Aperçu YouTube */}
          {ytId && (
            <a href={card.lien!} target="_blank" rel="noreferrer"
              style={{display:'block',marginTop:10,borderRadius:10,overflow:'hidden',position:'relative'}}>
              <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                style={{width:'100%',display:'block',borderRadius:10}} />
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',justifyContent:'center',
                background:'rgba(0,0,0,.25)',borderRadius:10}}>
                <div style={{width:48,height:48,borderRadius:'50%',background:'rgba(255,0,0,.85)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,color:'#fff'}}>▶</div>
              </div>
            </a>
          )}

          <div style={{fontSize:11,color:'var(--text-3)',marginTop:8}}>
            {card.membre_prenom} · {ago(card.created_at)}
            {(card as any).fichier_taille ? ` · ${fmtBytes((card as any).fichier_taille)}` : ''}
          </div>
        </div>
        <button onClick={onDelete} style={{background:'none',border:'none',color:'var(--border)',fontSize:20,cursor:'pointer',flexShrink:0,padding:2}}>×</button>
      </div>
    </div>
  )
}
