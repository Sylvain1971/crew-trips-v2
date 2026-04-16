'use client'
import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, getCat } from '@/lib/types'
import { getYoutubeId, isPdf, ago, countdown, getLodgeLabel, getPermisLabel, getCatLabel, getCatPlaceholders } from '@/lib/utils'
import type { InfoCard, Membre, Trip } from '@/lib/types'
import InfoCardView from './InfoCardView'

// Ordre fixe pour "Tout"
const CAT_ORDER = ['transport','lodge','permis','equipement','infos','itineraire','meteo','resto','liens']


function formatSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}

export default function Infos({ trip, membre, onTripUpdate }: { trip: Trip, membre: Membre, onTripUpdate?: (u: Partial<Trip>) => void }) {
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
  const [editTrip, setEditTrip] = useState(false)
  const [editNom, setEditNom] = useState(trip.nom)
  const [editDest, setEditDest] = useState(trip.destination||'')
  const [editD1, setEditD1] = useState(trip.date_debut?.slice(0,10)||'')
  const [editD2, setEditD2] = useState(trip.date_fin?.slice(0,10)||'')
  const [savingTrip, setSavingTrip] = useState(false)
  const [cd, setCd] = useState(()=>countdown(trip.date_debut))
  useEffect(()=>{
    setCd(countdown(trip.date_debut))
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
      membre_prenom: null,
    }).select().single()
    if (!error && data) {
      setCards(p => [...p, data])
      setTitre(''); setContenu(''); setLien(''); setPdfFile(null)
      setSheetOpen(false)
    } else if (error) {
      alert('Erreur lors de l\'ajout. Réessayez.')
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
      membre_prenom: isCreateur ? null : membre.prenom,
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

  async function saveTrip() {
    if (!editNom.trim()) return
    setSavingTrip(true)
    const updates: Partial<Trip> = {
      nom: editNom.trim(),
      destination: editDest.trim()||undefined,
      date_debut: editD1||undefined,
      date_fin: editD2||undefined,
    }
    await supabase.from('trips').update({
      nom: editNom.trim(),
      destination: editDest.trim()||null,
      date_debut: editD1||null,
      date_fin: editD2||null,
    }).eq('id', trip.id)
    onTripUpdate?.(updates)
    setSavingTrip(false)
    setEditTrip(false)
  }

  const haslodge = lodge.nom || lodge.adresse || lodge.tel || lodge.wifi || lodge.code || lodge.arrivee
  const tripDate = trip.date_debut ? new Date(trip.date_debut + 'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'}) : ''
  const tripDateFin = trip.date_fin ? new Date(trip.date_fin + 'T00:00:00').toLocaleDateString('fr-CA',{day:'numeric',month:'long',year:'numeric'}) : ''

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
      <div style={{background:'var(--forest)',padding:'12px 16px 16px',color:'#fff'}}>

        {/* Ligne 1 : navigation + actions */}
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <a href="/mes-trips"
            style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,
              padding:'7px 12px',color:'rgba(255,255,255,.75)',fontSize:12,textDecoration:'none',
              display:'flex',alignItems:'center',gap:4,cursor:'pointer',fontWeight:600}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Mes trips
          </a>
          <div style={{display:'flex',gap:8}}>
            {isCreateur && (
              <button onClick={()=>setEditTrip(true)}
                style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,
                  padding:'7px 11px',color:'#fff',fontSize:13,cursor:'pointer',display:'flex',alignItems:'center'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
              </button>
            )}
            <button onClick={copyLink}
              style={{background:copied?'rgba(255,255,255,.2)':'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',
                borderRadius:10,padding:'7px 12px',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              {copied ? '✓' : '🔗 Inviter'}
            </button>
            <button onClick={()=>window.open(`/trip/${trip.code}/print`,'_blank')}
              style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,
                padding:'7px 11px',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M6 9V3h12v6"/><path d="M6 18v3h12v-3"/>
                <rect x="2" y="9" width="20" height="9" rx="2"/>
                <circle cx="17" cy="13.5" r="1.2" fill="currentColor" stroke="none"/>
              </svg>
            </button>
          </div>
        </div>

        {/* Ligne 2 : titre complet */}
        <div>
          <div style={{fontSize:12,color:'rgba(255,255,255,.5)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>
            {trip.destination || 'Crew Trip'}
          </div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.02em',lineHeight:1.2,color:'#fff'}}>
            {trip.nom}
          </div>
          {tripDate && (
            <div style={{fontSize:13,color:'rgba(255,255,255,.5)',marginTop:5}}>
              {tripDate}{tripDateFin ? ` → ${tripDateFin}` : ''}
            </div>
          )}
        </div>

        {cd && (
          <div style={{marginTop:10,background:'rgba(255,255,255,.08)',borderRadius:8,padding:'8px 12px',
            fontSize:13,color:'rgba(255,255,255,.8)',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
            ⏳ {cd}
          </div>
        )}
      </div>

      {/* Section Lodge */}
      <div style={{background:'#fff',borderBottom:'1px solid var(--border)',padding:'14px 16px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}}
          onClick={()=>setLodgeOpen(o=>!o)}>
          <div style={{fontWeight:700,fontSize:14}}>{getLodgeLabel(trip.type).icon} {getLodgeLabel(trip.type).label}</div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            {isCreateur && (
              <button onClick={e=>{e.stopPropagation();setEditLodge(!editLodge);setLodgeOpen(true)}}
                style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px',
                  fontSize:12,fontWeight:600,color:'var(--text-2)',cursor:'pointer'}}>
                {editLodge?'Fermer':haslodge?'Modifier':'+ Ajouter'}
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
                  color:'var(--text-2)',fontSize:12,fontWeight:600,cursor:'pointer',
                  display:'flex',alignItems:'center',justifyContent:'center',gap:6}}>
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                  <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                </svg>
                Modifier
              </button>
            )}
          </div>
        )}
        {lodgeOpen && !editLodge && !haslodge && isCreateur && (
          <div style={{marginTop:12}}>
            <button onClick={()=>setEditLodge(true)}
              style={{width:'100%',padding:'10px',borderRadius:8,border:'1.5px dashed var(--border)',
                background:'transparent',color:'var(--text-3)',fontSize:13,cursor:'pointer'}}>
              + Ajouter les infos du {getLodgeLabel(trip.type).label.toLowerCase()}
            </button>
          </div>
        )}
        {lodgeOpen && editLodge && (
          <div style={{marginTop:12}}>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Nom du Lodge</div>
                <input className="input" placeholder={getLodgeLabel(trip.type).label === 'Lodge' ? 'Ex: Babine Norlakes' : `Ex: ${getLodgeLabel(trip.type).label} Mont-Blanc`} value={lodge.nom}
                  onChange={e=>setLodge(p=>({...p,nom:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Adresse</div>
                <input className="input" placeholder="Ex: Smithers, BC" value={lodge.adresse}
                  onChange={e=>setLodge(p=>({...p,adresse:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Téléphone</div>
                <input className="input" placeholder="+1 250 000 0000" value={lodge.tel}
                  onChange={e=>setLodge(p=>({...p,tel:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Mot de passe WiFi</div>
                <input className="input" placeholder="Ex: fishing2025" value={lodge.wifi}
                  onChange={e=>setLodge(p=>({...p,wifi:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Heure d'arrivée</div>
                <input className="input" placeholder="Ex: 14h00 le 8 juin" value={lodge.arrivee}
                  onChange={e=>setLodge(p=>({...p,arrivee:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
              </div>
              <div>
                <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>Heure de départ</div>
                <input className="input" placeholder="Ex: 10h00 le 25 avril" value={lodge.code}
                  onChange={e=>setLodge(p=>({...p,code:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
              </div>
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
              {c.icon} {id==='transport'?'Vols':id==='lodge'?getLodgeLabel(trip.type).label:id==='permis'?getPermisLabel(trip.type):'Équipement'}
            </FilterBtn>
          )})}
        </div>
        <div style={{display:'flex',gap:6}}>
          {['infos','itineraire','meteo','resto','liens'].map(id=>{const c=CATEGORIES.find(x=>x.id===id)!; return (
            <FilterBtn key={c.id} active={filtre===c.id} onClick={()=>setFiltre(c.id)} color={c.color}>
              {c.icon} {id==='infos'?'Infos':id==='itineraire'?'Itinéraire':id==='meteo'?'Météo':id==='resto'?'Restos':'Liens'}
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
            collapsed={filtre==='all'}
            tripType={trip.type}
            onDelete={()=>removeCard(card.id)}
            onEdit={()=>openEdit(card)}
            onOpenPdf={(url,nom)=>setPdfViewer({url,nom})}
            onCardClick={filtre==='all' ? ()=>{
              setFiltre(card.categorie)
              setTimeout(()=>{
                document.getElementById(card.id)?.scrollIntoView({behavior:'smooth',block:'center'})
              }, 80)
            } : undefined} />
        ))}
      </div>

      <button className="fab" onClick={()=>{if(filtre!=='all')setCat(filtre);setSheetOpen(true)}}>+</button>

      {/* Sheet modifier trip */}
      <div className={`overlay ${editTrip?'open':''}`} onClick={()=>setEditTrip(false)} />
      <div className={`sheet ${editTrip?'open':''}`}>
        <div className="sheet-handle" />
        <div className="sheet-title">Modifier le trip</div>
        <div className="field"><label>Nom du trip</label>
          <input className="input" value={editNom} onChange={e=>setEditNom(e.target.value)} />
        </div>
        <div className="field"><label>Destination</label>
          <input className="input" placeholder="Ex: Rivière Babine, BC" value={editDest} onChange={e=>setEditDest(e.target.value)} />
        </div>
        <div className="field"><label>Dates</label>
          <div style={{display:'flex',gap:8}}>
            <input className="input" type="date" value={editD1} onChange={e=>setEditD1(e.target.value)} style={{flex:1,colorScheme:'dark'}} />
            <input className="input" type="date" value={editD2} onChange={e=>setEditD2(e.target.value)} style={{flex:1,colorScheme:'dark'}} />
          </div>
        </div>
        <button className="btn btn-primary" onClick={saveTrip} disabled={savingTrip||!editNom.trim()}>
          {savingTrip?'Sauvegarde…':'Sauvegarder'}
        </button>
        <button className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setEditTrip(false)}>Annuler</button>
      </div>

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
                {c.icon} {getCatLabel(c.id, trip.type) || c.label}
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
                {c.icon} {getCatLabel(c.id, trip.type) || c.label}
              </button>
            ))}
          </div>
        </div>
        <div className="field"><label>Titre</label>
          <input className="input" placeholder={getCatPlaceholders(cat, trip.type).titre} value={titre} onChange={e=>setTitre(e.target.value)} />
        </div>
        <div className="field"><label>Détails (optionnel)</label>
          <textarea className="input" rows={3} placeholder={getCatPlaceholders(cat, trip.type).details} value={contenu} onChange={e=>setContenu(e.target.value)} />
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

