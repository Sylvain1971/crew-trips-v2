'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, getCat } from '@/lib/types'
import { getYoutubeId, isPdf, ago, countdown } from '@/lib/utils'
import type { InfoCard, Membre, Trip } from '@/lib/types'
import InfoCardView from './InfoCardView'

// Ordre fixe pour "Tout"
const CAT_ORDER = ['transport','lodge','permis','equipement','infos','liens']

function formatSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}

export default function Infos({ trip, membre }: { trip: Trip, membre: Membre }) {
  const isCreateur = membre.is_createur
  const canDelete = isCreateur || trip.can_delete
  const canEdit = isCreateur || trip.can_edit
  const [cards, setCards] = useState<InfoCard[]>([])
  const [filtre, setFiltre] = useState<string>('all')
  const [sheetOpen, setSheetOpen] = useState(false)
  const [editCard, setEditCard] = useState<InfoCard|null>(null)
  const [editLodge, setEditLodge] = useState(false)
  const [cat, setCat] = useState('transport')
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [lien, setLien] = useState('')
  // États pour l'édition d'une card existante
  const [editCat, setEditCat] = useState('transport')
  const [editTitre, setEditTitre] = useState('')
  const [editContenu, setEditContenu] = useState('')
  const [editLien, setEditLien] = useState('')
  const [editPdfFile, setEditPdfFile] = useState<File|null>(null)
  const [editUploading, setEditUploading] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const editFileRef = useRef<HTMLInputElement>(null)
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
  const [lodgeOpen, setLodgeOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const [cd, setCd] = useState(()=>countdown(trip.date_debut))
  useEffect(()=>{
    const t = setInterval(()=>setCd(countdown(trip.date_debut)), 60000)
    return ()=>clearInterval(t)
  },[trip.date_debut])

  useEffect(() => {
    supabase.from('infos').select('*').eq('trip_id', trip.id)
      .order('created_at', {ascending:true})
      .then(({data}) => data && setCards(data))
  }, [trip.id])

  // Trier par ordre fixe quand filtre = 'all'
  const filtered = (() => {
    if (filtre !== 'all') return cards.filter(c => c.categorie === filtre)
    const sorted = [...cards]
    sorted.sort((a, b) => {
      const ai = CAT_ORDER.indexOf(a.categorie)
      const bi = CAT_ORDER.indexOf(b.categorie)
      if (ai !== bi) return ai - bi
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
    return sorted
  })()

  async function uploadFichier(file: File): Promise<string|null> {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${trip.id}/docs/${Date.now()}-${membre.prenom.toLowerCase().replace(/\s/g,'')}.${ext}`
    const contentType = file.type || 'application/octet-stream'
    const { error } = await supabase.storage.from('trip-photos').upload(path, file, { contentType })
    if (error) { alert('Erreur upload: ' + error.message); return null }
    const { data } = supabase.storage.from('trip-photos').getPublicUrl(path)
    return data.publicUrl
  }

  async function save() {
    if (!titre.trim()) return
    setSaving(true)
    let fichier_url: string|null = null
    if (pdfFile) {
      setUploading(true)
      fichier_url = await uploadFichier(pdfFile)
      setUploading(false)
      if (!fichier_url) { setSaving(false); return }
    }
    const { data, error } = await supabase.from('infos').insert({
      trip_id: trip.id, categorie: cat, titre: titre.trim(),
      contenu: contenu.trim()||null,
      lien: lien.trim()||null,
      fichier_url,
      membre_prenom: membre.prenom,
    }).select().single()
    if (!error && data) {
      setCards(p => [...p, data])
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
    if (!confirm('Supprimer cette info ? Cette action est irréversible.')) return
    await supabase.from('infos').delete().eq('id', id)
    setCards(p => p.filter(c => c.id !== id))
  }

  function openEdit(card: InfoCard) {
    setEditCard(card)
    setEditCat(card.categorie)
    setEditTitre(card.titre)
    setEditContenu(card.contenu||'')
    setEditLien(card.lien||'')
    setEditPdfFile(null)
  }

  async function updateCard() {
    if (!editCard || !editTitre.trim()) return
    setSavingEdit(true)
    let fichier_url = editCard.fichier_url ?? null
    if (editPdfFile) {
      setEditUploading(true)
      const uploaded = await uploadFichier(editPdfFile)
      setEditUploading(false)
      if (!uploaded) { setSavingEdit(false); return }
      fichier_url = uploaded
    }
    const { data, error } = await supabase.from('infos').update({
      categorie: editCat,
      titre: editTitre.trim(),
      contenu: editContenu.trim()||null,
      lien: editLien.trim()||null,
      fichier_url,
    }).eq('id', editCard.id).select().single()
    if (!error && data) {
      setCards(p => p.map(c => c.id === editCard.id ? data : c))
      setEditCard(null)
      setEditPdfFile(null)
    }
    setSavingEdit(false)
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
      {/* PDF Viewer panneau */}
      {pdfViewer && (
        <div style={{position:'fixed',inset:0,zIndex:100,display:'flex',flexDirection:'column',background:'#111'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#1a1a1a',flexShrink:0}}>
            <button onClick={()=>setPdfViewer(null)}
              style={{background:'rgba(255,255,255,.1)',border:'none',color:'#fff',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              ← Retour
            </button>
            <div style={{flex:1,fontSize:13,color:'#ccc',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              📄 {pdfViewer.nom}
            </div>
            <a href={pdfViewer.url} target="_blank" rel="noreferrer"
              style={{background:'rgba(255,255,255,.1)',border:'none',color:'#fff',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:13,fontWeight:600,textDecoration:'none'}}>
              ↗ Ouvrir
            </a>
          </div>
          <iframe src={pdfViewer.url} style={{flex:1,border:'none',width:'100%'}} title={pdfViewer.nom} />
        </div>
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
          <button onClick={copyLink}
            style={{background:copied?'rgba(255,255,255,.2)':'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'8px 14px',color:'#fff',fontSize:13,fontWeight:600,cursor:'pointer',flexShrink:0,marginLeft:12,transition:'background .2s'}}>
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
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}
          onClick={()=>setLodgeOpen(o=>!o)}>
          <div style={{fontWeight:700,fontSize:14}}>🏕 Le Lodge</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {isCreateur && !lodgeOpen && (
              <button onClick={e=>{e.stopPropagation();setEditLodge(!editLodge);setLodgeOpen(true)}}
                style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px',
                  fontSize:12,fontWeight:600,color:'var(--text-2)',cursor:'pointer'}}>
                {haslodge?'Modifier':'+ Ajouter'}
              </button>
            )}
            <span style={{fontSize:18,color:'var(--text-3)',transition:'transform .2s',
              display:'inline-block',transform:lodgeOpen?'rotate(180deg)':'rotate(0deg)'}}>
              ⌄
            </span>
          </div>
        </div>
        {lodgeOpen && !editLodge && haslodge && (
          <div style={{marginTop:12,display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
            {lodge.nom && <LodgeItem icon="🏠" label="Nom" val={lodge.nom} />}
            {lodge.adresse && <LodgeItem icon="📍" label="Adresse" val={lodge.adresse} />}
            {lodge.tel && <LodgeItem icon="📞" label="Téléphone" val={lodge.tel} link={`tel:${lodge.tel}`} />}
            {lodge.wifi && <LodgeItem icon="📶" label="WiFi" val={lodge.wifi} />}
            {lodge.arrivee && <LodgeItem icon="🛬" label="Arrivée" val={lodge.arrivee} />}
            {lodge.code && <LodgeItem icon="🛫" label="Départ" val={lodge.code} />}
            {isCreateur && (
              <button onClick={()=>setEditLodge(true)}
                style={{gridColumn:'1/-1',marginTop:4,padding:'8px',borderRadius:8,
                  border:'1px solid var(--border)',background:'transparent',
                  color:'var(--text-2)',fontSize:12,fontWeight:600,cursor:'pointer'}}>
                ✏️ Modifier
              </button>
            )}
          </div>
        )}
        {lodgeOpen && !editLodge && !haslodge && isCreateur && (
          <div style={{marginTop:12}}>
            <button onClick={()=>setEditLodge(true)}
              style={{width:'100%',padding:'10px',borderRadius:8,border:'1.5px dashed var(--border)',
                background:'transparent',color:'var(--text-3)',fontSize:13,cursor:'pointer'}}>
              + Ajouter les infos du lodge
            </button>
          </div>
        )}
        {lodgeOpen && editLodge && (
          <div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              {[
                {k:'nom',label:'Nom du Lodge',ph:'Ex: Babine Norlakes'},
                {k:'adresse',label:'Adresse',ph:'Ex: Smithers, BC'},
                {k:'tel',label:'Téléphone',ph:'+1 250 000 0000'},
                {k:'wifi',label:'Mot de passe WiFi',ph:'Ex: fishing2025'},
                {k:'arrivee',label:"Heure d'arrivée",ph:'Ex: 14h00 le 8 juin'},
                {k:'code',label:'Heure de départ',ph:'Ex: 10h00 le 25 avril'},
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
      <div style={{background:'#fff',borderBottom:'1px solid var(--border)',padding:'10px 14px',position:'sticky',top:0,zIndex:20}}>
        <div style={{display:'flex',gap:6,marginBottom:6}}>
          <FilterBtn active={filtre==='all'} onClick={()=>setFiltre('all')}>Tout</FilterBtn>
          {['transport','lodge','permis','equipement'].map(id=>{const c=CATEGORIES.find(x=>x.id===id)!; return (
            <FilterBtn key={c.id} active={filtre===c.id} onClick={()=>setFiltre(c.id)} color={c.color}>
              {c.icon} {id==='transport'?'Vols':id==='lodge'?'Lodge':id==='permis'?'Permis':'Équipement'}
            </FilterBtn>
          )})}
        </div>
        <div style={{display:'flex',gap:6}}>
          {['infos','liens'].map(id=>{const c=CATEGORIES.find(x=>x.id===id)!; return (
            <FilterBtn key={c.id} active={filtre===c.id} onClick={()=>setFiltre(c.id)} color={c.color}>
              {c.icon} {id==='infos'?'Infos':'Liens'}
            </FilterBtn>
          )})}
        </div>
      </div>

      {/* Cards */}
      <div style={{padding:'14px 14px 100px',display:'flex',flexDirection:'column',gap:10}}>
        {filtered.length === 0 ? (
          <div className="empty">
            {filtre==='all' ? <span className="empty-icon">📋</span> : <span className="empty-icon">{getCat(filtre).icon}</span>}
            Aucune info ici pour l'instant.<br/>Appuyez sur <strong>+</strong> pour ajouter.
          </div>
        ) : filtered.map(card => (
          <InfoCardView key={card.id} card={card}
            canDelete={canDelete}
            canEdit={canEdit}
            isCreateur={isCreateur}
            onDelete={()=>removeCard(card.id)}
            onEdit={()=>openEdit(card)}
            onOpenPdf={(url,nom)=>setPdfViewer({url,nom})} />
        ))}
      </div>

      <button className="fab" onClick={()=>{if(filtre!=='all')setCat(filtre);setSheetOpen(true)}}>+</button>

      {/* Sheet modifier card */}
      <div className={`overlay ${editCard?'open':''}`} onClick={()=>setEditCard(null)} />
      <div className={`sheet ${editCard?'open':''}`}>
        <div className="sheet-handle" />
        <div className="sheet-title">Modifier</div>
        <div className="field">
          <label>Catégorie</label>
          <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
            {CATEGORIES.map(c=>(
              <button key={c.id} onClick={()=>setEditCat(c.id)}
                style={{padding:'7px 12px',borderRadius:20,border:`1.5px solid ${editCat===c.id?c.color:'var(--border)'}`,
                  background:editCat===c.id?c.bg:'transparent',color:editCat===c.id?c.color:'var(--text-2)',
                  fontSize:13,fontWeight:600,cursor:'pointer'}}>
                {c.icon} {c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field"><label>Titre</label>
          <input className="input" value={editTitre} onChange={e=>setEditTitre(e.target.value)} />
        </div>
        <div className="field"><label>Détails (optionnel)</label>
          <textarea className="input" rows={3} value={editContenu} onChange={e=>setEditContenu(e.target.value)} />
        </div>
        <div className="field"><label>Lien (optionnel)</label>
          <input className="input" type="url" placeholder="https://…" value={editLien} onChange={e=>setEditLien(e.target.value)} />
        </div>
        <div className="field">
          <label>Photo / PDF (optionnel)</label>
          <input ref={editFileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}}
            onChange={e=>setEditPdfFile(e.target.files?.[0]||null)} />
          {editCard?.fichier_url && !editPdfFile && (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,
              padding:'10px 14px',border:'1.5px solid var(--border)',marginBottom:8}}>
              <span style={{fontSize:20}}>{isPdf(editCard.fichier_url)?'📄':'🖼️'}</span>
              <div style={{flex:1,fontSize:12,color:'var(--text-2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
                Fichier actuel
              </div>
              <button onClick={()=>editFileRef.current?.click()}
                style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px',
                  fontSize:12,fontWeight:600,color:'var(--text-2)',cursor:'pointer',flexShrink:0}}>
                Remplacer
              </button>
            </div>
          )}
          {editPdfFile ? (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,padding:'10px 14px',border:'1.5px solid var(--border)'}}>
              <span style={{fontSize:24}}>📄</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{editPdfFile.name}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>{formatSize(editPdfFile.size)}</div>
              </div>
              <button onClick={()=>setEditPdfFile(null)}
                style={{background:'none',border:'none',fontSize:18,color:'var(--text-3)',cursor:'pointer'}}>×</button>
            </div>
          ) : !editCard?.fichier_url && (
            <button onClick={()=>editFileRef.current?.click()}
              style={{background:'transparent',border:'2px dashed var(--border)',color:'var(--text-2)',
                fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              📎 Choisir un PDF ou une photo
            </button>
          )}
        </div>
        {editUploading && (
          <div style={{textAlign:'center',fontSize:13,color:'var(--text-3)',marginBottom:12,padding:'10px',background:'var(--sand)',borderRadius:10}}>
            ⏳ Upload en cours…
          </div>
        )}
        <button className="btn btn-primary" onClick={updateCard} disabled={savingEdit||!editTitre.trim()}>
          {savingEdit?(editUploading?'Upload…':'Sauvegarde…'):'Sauvegarder'}
        </button>
        <button className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setEditCard(null)}>Annuler</button>
      </div>

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
          <input className="input" placeholder="Ex: Vol Air Canada YQB → YVR" value={titre} onChange={e=>setTitre(e.target.value)} />
        </div>
        <div className="field"><label>Détails (optionnel)</label>
          <textarea className="input" rows={3} placeholder="Numéro de vol, horaire, instructions…" value={contenu} onChange={e=>setContenu(e.target.value)} />
        </div>
        <div className="field"><label>Lien (optionnel)</label>
          <input className="input" type="url" placeholder="https://…" value={lien} onChange={e=>setLien(e.target.value)} />
        </div>

        {/* Upload PDF */}
        <div className="field">
          <label>Document PDF (optionnel)</label>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}}
            onChange={e=>setPdfFile(e.target.files?.[0]||null)} />
          {pdfFile ? (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,padding:'10px 14px',border:'1.5px solid var(--border)'}}>
              <span style={{fontSize:24}}>📄</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{pdfFile.name}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>{formatSize(pdfFile.size)}</div>
              </div>
              <button onClick={()=>setPdfFile(null)}
                style={{background:'none',border:'none',fontSize:18,color:'var(--text-3)',cursor:'pointer'}}>×</button>
            </div>
          ) : (
            <button onClick={()=>fileRef.current?.click()}
              style={{background:'transparent',border:'2px dashed var(--border)',color:'var(--text-2)',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              📎 Choisir un PDF ou une photo
            </button>
          )}
        </div>

        {uploading && (
          <div style={{textAlign:'center',fontSize:13,color:'var(--text-3)',marginBottom:12,padding:'10px',background:'var(--sand)',borderRadius:10}}>
            ⏳ Upload en cours…
          </div>
        )}
        <button className="btn btn-primary" onClick={save} disabled={saving||!titre.trim()}>
          {saving?(uploading?'Upload…':'Ajout…'):'Ajouter'}
        </button>
        <button className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setSheetOpen(false)}>Annuler</button>
      </div>
    </>
  )
}

function LodgeItem({icon,label,val,link}:{icon:string,label:string,val:string,link?:string}) {
  return (
    <div style={{background:'var(--sand)',borderRadius:10,padding:'9px 12px'}}>
      <div style={{fontSize:11,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3}}>{icon} {label}</div>
      {link
        ? <a href={link} style={{fontSize:13,fontWeight:600,color:'var(--green)',textDecoration:'none'}}>{val}</a>
        : <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{val}</div>}
    </div>
  )
}

function FilterBtn({active,onClick,color,children}:{active:boolean,onClick:()=>void,color?:string,children:React.ReactNode}) {
  return (
    <button onClick={onClick} style={{
      flexShrink:0,padding:'6px 10px',borderRadius:20,
      border:`1.5px solid ${active?(color||'var(--forest)'):'var(--border)'}`,
      background:active?(color||'var(--forest)'):'transparent',
      color:active?'#fff':'var(--text-2)',fontSize:11,fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'
    }}>{children}</button>
  )
}

