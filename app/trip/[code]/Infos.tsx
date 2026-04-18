'use client'
import { useEffect, useState, useRef, useCallback, useMemo } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, getCat, getCatSvg } from '@/lib/types'
import { isPdf, countdown, getLodgeLabel, getPermisLabel, getCatLabel, getCatPlaceholders, withRetry } from '@/lib/utils'
import { useNavFiltre } from '@/lib/useNavFiltre'
import type { InfoCard, Membre, Trip } from '@/lib/types'
import InfoCardView from './InfoCardView'
import { SvgIcon } from '@/lib/svgIcons'

const CAT_ORDER = ['transport','lodge','permis','equipement','infos','itineraire','meteo','resto','liens']
// Ordre d'affichage des chips dans les sheets Ajouter/Modifier — même ordre que les filtres
const CHIP_ORDER = ['itineraire','transport','lodge','permis','equipement','infos','meteo','resto','liens']

function formatSize(b: number) {
  if (b < 1024) return `${b} B`
  if (b < 1048576) return `${(b/1024).toFixed(0)} KB`
  return `${(b/1048576).toFixed(1)} MB`
}

export default function Infos({ trip, membre, onTripUpdate }: { trip: Trip, membre: Membre, onTripUpdate?: (u: Partial<Trip>) => void }) {
  const isCreateur = membre.is_createur
  const canDelete = isCreateur || trip.can_delete
  const canEdit = isCreateur || trip.can_edit

  // Navigation
  const { filtre, setFiltre, pushFiltre, pushFiltreAndNavigate } = useNavFiltre()

  // Cards
  const [cards, setCards] = useState<InfoCard[]>([])

  // PDF viewer
  const [pdfViewer, setPdfViewer] = useState<{url:string,nom:string}|null>(null)

  // Sheet ajouter
  const [sheetOpen, setSheetOpen] = useState(false)
  const [cat, setCat] = useState('transport')
  const [titre, setTitre] = useState('')
  const [contenu, setContenu] = useState('')
  const [lien, setLien] = useState('')
  const [pdfFile, setPdfFile] = useState<File|null>(null)
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Sheet modifier card
  const [editCard, setEditCard] = useState<InfoCard|null>(null)
  const [editCat, setEditCat] = useState('transport')
  const [editTitre, setEditTitre] = useState('')
  const [editContenu, setEditContenu] = useState('')
  const [editLien, setEditLien] = useState('')
  const [editPdfFile, setEditPdfFile] = useState<File|null>(null)
  const [editFichierRemoved, setEditFichierRemoved] = useState(false)
  const [editUploading, setEditUploading] = useState(false)
  const [savingEdit, setSavingEdit] = useState(false)
  const editFileRef = useRef<HTMLInputElement>(null)

  // Lodge
  const [lodge, setLodge] = useState({
    nom: trip.lodge_nom||'', adresse: trip.lodge_adresse||'',
    tel: trip.lodge_tel||'', wifi: trip.lodge_wifi||'',
    code: trip.lodge_code||'', arrivee: trip.lodge_arrivee||''
  })
  const [savingLodge, setSavingLodge] = useState(false)
  const [lodgeOpen, setLodgeOpen] = useState(false)
  const [editLodge, setEditLodge] = useState(false)

  // Modifier trip
  const [editTrip, setEditTrip] = useState(false)
  const [editNom, setEditNom] = useState(trip.nom)
  const [editDest, setEditDest] = useState(trip.destination||'')
  const [editD1, setEditD1] = useState(trip.date_debut?.slice(0,10)||'')
  const [editD2, setEditD2] = useState(trip.date_fin?.slice(0,10)||'')
  const [savingTrip, setSavingTrip] = useState(false)

  // Misc
  const [copied, setCopied] = useState(false)
  const [cd, setCd] = useState(()=>countdown(trip.date_debut))

  // Countdown
  useEffect(() => {
    setCd(countdown(trip.date_debut))
    const t = setInterval(()=>setCd(countdown(trip.date_debut)), 60000)
    return ()=>clearInterval(t)
  }, [trip.date_debut])

  // Charger les cards
  useEffect(() => {
    supabase.from('infos').select('id,trip_id,categorie,titre,contenu,lien,fichier_url,membre_prenom,created_at')
      .eq('trip_id', trip.id)
      .order('created_at', {ascending:true})
      .then(({data, error}) => {
        if (!error && data) setCards(data)
      })
  }, [trip.id])

  // Cards filtrées/triées — memo sur [cards, filtre] pour éviter le recalcul à chaque render
  const filtered = useMemo(() => {
    if (filtre !== 'all') return cards.filter(c => c.categorie === filtre)
    return [...cards].sort((a, b) => {
      const ai = CAT_ORDER.indexOf(a.categorie)
      const bi = CAT_ORDER.indexOf(b.categorie)
      if (ai !== bi) return ai - bi
      return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
    })
  }, [cards, filtre])

  // Upload fichier
  const uploadFichier = useCallback(async (file: File): Promise<string|null> => {
    const ext = file.name.split('.').pop() || 'bin'
    const path = `${trip.id}/docs/${Date.now()}-${membre.prenom.toLowerCase().replace(/\s/g,'')}.${ext}`
    const { error } = await supabase.storage.from('trip-photos').upload(path, file, {
      contentType: file.type || 'application/octet-stream'
    })
    if (error) { alert('Erreur upload : ' + error.message); return null }
    return supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl
  }, [trip.id, membre.prenom])

  // Ajouter une card — optimistic : la card apparaît immédiatement,
  // rollback si Supabase échoue.
  async function save() {
    if (!titre.trim()) return
    setSaving(true)
    try {
      // Upload fichier d'abord (bloquant : on ne peut pas être optimistic sur une URL inconnue)
      let fichier_url: string|null = null
      if (pdfFile) {
        setUploading(true)
        fichier_url = await uploadFichier(pdfFile)
        setUploading(false)
        if (!fichier_url) return
      }

      // Card optimiste : id temporaire, on l'affiche tout de suite
      const tempId = `temp-${Date.now()}`
      const optimisticCard: InfoCard = {
        id: tempId,
        trip_id: trip.id,
        categorie: cat,
        titre: titre.trim(),
        contenu: contenu.trim() || undefined,
        lien: lien.trim() || undefined,
        fichier_url: fichier_url || undefined,
        membre_prenom: undefined,
        created_at: new Date().toISOString(),
      }
      setCards(p => [...p, optimisticCard])
      // Snapshot pour rollback des champs si échec
      const snapshot = { titre, contenu, lien, pdfFile, cat }
      setTitre(''); setContenu(''); setLien(''); setPdfFile(null)
      setSheetOpen(false)

      try {
        const { data, error } = await withRetry(() => supabase.from('infos').insert({
          trip_id: trip.id, categorie: cat, titre: snapshot.titre.trim(),
          contenu: snapshot.contenu.trim()||null, lien: snapshot.lien.trim()||null, fichier_url,
          membre_prenom: null,
        }).select().single())
        if (error) throw error
        // Remplacer la temp par la vraie card
        setCards(p => p.map(c => c.id === tempId ? data : c))
      } catch (e: any) {
        // Rollback : retirer la card optimiste, restaurer le sheet avec les valeurs
        setCards(p => p.filter(c => c.id !== tempId))
        setCat(snapshot.cat)
        setTitre(snapshot.titre)
        setContenu(snapshot.contenu)
        setLien(snapshot.lien)
        setPdfFile(snapshot.pdfFile)
        setSheetOpen(true)
        alert('Erreur lors de l\'ajout : ' + e.message)
      }
    } finally {
      setSaving(false)
    }
  }

  // Modifier une card — useCallback pour stabiliser la réf passée à InfoCardView
  const openEdit = useCallback((card: InfoCard) => {
    setEditCard(card)
    setEditCat(card.categorie)
    setEditTitre(card.titre)
    setEditContenu(card.contenu||'')
    setEditLien(card.lien||'')
    setEditPdfFile(null)
    setEditFichierRemoved(false)
  }, [])

  async function updateCard() {
    if (!editCard || !editTitre.trim()) return
    setSavingEdit(true)
    try {
      // Upload fichier d'abord si nouveau
      let fichier_url = editFichierRemoved ? null : (editCard.fichier_url ?? null)
      if (editPdfFile) {
        setEditUploading(true)
        const uploaded = await uploadFichier(editPdfFile)
        setEditUploading(false)
        if (!uploaded) return
        fichier_url = uploaded
      }

      // Snapshot pour rollback
      const originalCard = editCard
      const optimisticCard: InfoCard = {
        ...editCard,
        categorie: editCat,
        titre: editTitre.trim(),
        contenu: editContenu.trim() || undefined,
        lien: editLien.trim() || undefined,
        fichier_url: fichier_url || undefined,
        membre_prenom: isCreateur ? undefined : membre.prenom,
      }

      // Appliquer immédiatement + fermer le sheet
      setCards(p => p.map(c => c.id === originalCard.id ? optimisticCard : c))
      setEditCard(null); setEditPdfFile(null); setEditFichierRemoved(false)

      try {
        const { data, error } = await withRetry(() => supabase.from('infos').update({
          categorie: optimisticCard.categorie, titre: optimisticCard.titre,
          contenu: optimisticCard.contenu ?? null, lien: optimisticCard.lien ?? null,
          fichier_url: optimisticCard.fichier_url ?? null,
          membre_prenom: optimisticCard.membre_prenom ?? null,
        }).eq('id', originalCard.id).select().single())
        if (error) throw error
        // Supabase peut renvoyer des valeurs normalisées (timestamps, trimmed...) : on resync
        setCards(p => p.map(c => c.id === originalCard.id ? data : c))
      } catch (e: any) {
        // Rollback : restaurer la card d'origine
        setCards(p => p.map(c => c.id === originalCard.id ? originalCard : c))
        alert('Erreur lors de la modification : ' + e.message)
      }
    } finally {
      setSavingEdit(false)
    }
  }

  // Ref miroir du state cards — permet a removeCard d'acceder au state
  // courant sans passer par un updater React (qui peut etre rejoue en StrictMode).
  const cardsRef = useRef<InfoCard[]>(cards)
  useEffect(() => { cardsRef.current = cards }, [cards])

  // Supprimer une card — optimistic : la card disparaît immédiatement,
  // rollback (ré-insertion) si Supabase échoue.
  const removeCard = useCallback(async (id: string) => {
    if (!confirm('Supprimer cette info ? Cette action est irréversible.')) return
    // Capture synchrone depuis la ref — pas d'updater React, donc pas de double-run StrictMode
    const currentCards = cardsRef.current
    const idx = currentCards.findIndex(c => c.id === id)
    if (idx === -1) return
    const snapshotCard = currentCards[idx]
    const snapshotIndex = idx

    // Optimistic UI : retirer la card
    setCards(p => p.filter(c => c.id !== id))

    try {
      const { error } = await withRetry(() => supabase.from('infos').delete().eq('id', id))
      if (error) throw error
    } catch (e: any) {
      // Rollback : ré-insérer la card à sa position
      setCards(p => {
        const next = [...p]
        next.splice(snapshotIndex, 0, snapshotCard)
        return next
      })
      alert('Erreur lors de la suppression : ' + e.message)
    }
  }, [])

  // Sauvegarder Lodge
  async function saveLodge() {
    setSavingLodge(true)
    try {
      const { error } = await withRetry(() => supabase.from('trips').update({
        lodge_nom: lodge.nom||null, lodge_adresse: lodge.adresse||null,
        lodge_tel: lodge.tel||null, lodge_wifi: lodge.wifi||null,
        lodge_code: lodge.code||null, lodge_arrivee: lodge.arrivee||null,
      }).eq('id', trip.id))
      if (error) throw error
      setEditLodge(false)
    } catch (e: any) {
      alert('Erreur sauvegarde lodge : ' + e.message)
    } finally {
      setSavingLodge(false)
    }
  }

  // Modifier trip
  async function saveTrip() {
    if (!editNom.trim()) return
    setSavingTrip(true)
    try {
      const { error } = await withRetry(() => supabase.from('trips').update({
        nom: editNom.trim(), destination: editDest.trim()||null,
        date_debut: editD1||null, date_fin: editD2||null,
      }).eq('id', trip.id))
      if (error) throw error
      onTripUpdate?.({ nom: editNom.trim(), destination: editDest.trim()||undefined, date_debut: editD1||undefined, date_fin: editD2||undefined })
      setEditTrip(false)
    } catch (e: any) {
      alert('Erreur sauvegarde trip : ' + e.message)
    } finally {
      setSavingTrip(false)
    }
  }

  // Copier le lien
  function copyLink() {
    navigator.clipboard.writeText(window.location.href)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  // Ouvrir PDF — useCallback (stabilise la réf passée à InfoCardView)
  const openPdf = useCallback((url: string, nom: string) => {
    const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
    if (isMobile) {
      pushFiltre()
      window.open(url, '_blank')
    } else {
      pushFiltre()
      setPdfViewer({ url, nom })
    }
  }, [pushFiltre])

  const haslodge = lodge.nom || lodge.adresse || lodge.tel || lodge.wifi || lodge.code || lodge.arrivee
  const fmtDate = (d?: string) => d ? new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', {day:'numeric',month:'long',year:'numeric'}) : ''
  const tripDate = fmtDate(trip.date_debut)
  const tripDateFin = fmtDate(trip.date_fin)

  return (
    <>
      {/* PDF Viewer desktop */}
      {pdfViewer && (
        <div style={{position:'fixed',inset:0,zIndex:100,display:'flex',flexDirection:'column',background:'#111'}}>
          <div style={{display:'flex',alignItems:'center',gap:10,padding:'10px 14px',background:'#1a1a1a',flexShrink:0}}>
            <button onClick={()=>{
              setPdfViewer(null)
              const saved = sessionStorage.getItem('crew-trips-filtre')
              if (saved) { setFiltre(saved); sessionStorage.removeItem('crew-trips-filtre') }
            }} style={{background:'rgba(255,255,255,.1)',border:'none',color:'#fff',borderRadius:8,padding:'7px 12px',cursor:'pointer',fontSize:13,fontWeight:600}}>
              ← Retour
            </button>
            <div style={{flex:1,fontSize:13,color:'#ccc',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>
              📄 {pdfViewer.nom}
            </div>
            <a href={pdfViewer.url} target="_blank" rel="noreferrer"
              style={{background:'rgba(255,255,255,.1)',border:'none',color:'#fff',borderRadius:8,padding:'7px 12px',fontSize:13,fontWeight:600,textDecoration:'none'}}>
              ↗ Ouvrir
            </a>
          </div>
          <iframe src={pdfViewer.url} style={{flex:1,border:'none',width:'100%'}} title={pdfViewer.nom} />
        </div>
      )}

      {/* Header */}
      <div style={{background:'var(--forest)',padding:'12px 16px 16px',color:'#fff'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:12}}>
          <a href="/mes-trips" style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'7px 12px',color:'rgba(255,255,255,.75)',fontSize:12,textDecoration:'none',display:'flex',alignItems:'center',gap:4,fontWeight:600}}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5M12 5l-7 7 7 7"/></svg>
            Mes trips
          </a>
          <div style={{display:'flex',gap:8}}>
            {isCreateur && (
              <button onClick={()=>setEditTrip(true)} style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'7px 11px',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center'}}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
            )}
            <button onClick={copyLink} style={{background:copied?'rgba(255,255,255,.2)':'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'7px 12px',color:'#fff',fontSize:12,fontWeight:600,cursor:'pointer'}}>
              {copied ? '✓' : '🔗 Inviter'}
            </button>
            <button onClick={()=>window.open(`/trip/${trip.code}/print`,'_blank')} style={{background:'rgba(255,255,255,.1)',border:'1px solid rgba(255,255,255,.2)',borderRadius:10,padding:'7px 11px',color:'#fff',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M6 9V3h12v6"/><path d="M6 18v3h12v-3"/><rect x="2" y="9" width="20" height="9" rx="2"/><circle cx="17" cy="13.5" r="1.2" fill="currentColor" stroke="none"/></svg>
            </button>
          </div>
        </div>
        <div>
          <div style={{fontSize:12,color:'rgba(255,255,255,.5)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:4}}>{trip.destination || 'Crew Trip'}</div>
          <div style={{fontSize:22,fontWeight:800,letterSpacing:'-.02em',lineHeight:1.2}}>{trip.nom}</div>
          {tripDate && <div style={{fontSize:13,color:'rgba(255,255,255,.5)',marginTop:5}}>{tripDate}{tripDateFin ? ` → ${tripDateFin}` : ''}</div>}
        </div>
        {cd && (
          <div style={{marginTop:10,background:'rgba(255,255,255,.08)',borderRadius:8,padding:'8px 12px',fontSize:13,color:'rgba(255,255,255,.8)',fontWeight:600,display:'flex',alignItems:'center',gap:6}}>
            <SvgIcon name="hourglass" size={14} /> {cd}
          </div>
        )}
      </div>

      {/* Wrapper sticky : header Lodge (compact) + filtres */}
      <div style={{position:'sticky',top:0,zIndex:20,background:'#fff',borderBottom:'1px solid var(--border)'}}>
        {/* Header Lodge (toujours visible) */}
        <div style={{padding:'14px 16px',borderBottom:'1px solid var(--border-light, var(--border))'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer'}} onClick={()=>setLodgeOpen(o=>!o)}>
            <div style={{fontWeight:700,fontSize:14,display:'inline-flex',alignItems:'center',gap:8}}>
              <span style={{display:'inline-flex',width:26,height:26,borderRadius:7,background:'#16A34A',color:'#fff',alignItems:'center',justifyContent:'center'}}>{getCatSvg('lodge', 15, trip.type)}</span>
              {getLodgeLabel(trip.type).label}
              <span style={{display:'inline-flex',alignItems:'center',padding:'2px 7px',borderRadius:6,fontSize:9,fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em',background:'rgba(22,163,74,.1)',color:'#16A34A',border:'1px solid rgba(22,163,74,.3)'}}>Principal</span>
            </div>
            <div style={{display:'flex',alignItems:'center',gap:8}}>
              {isCreateur && (
                <button onClick={e=>{e.stopPropagation();setEditLodge(!editLodge);setLodgeOpen(true)}}
                  style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px',fontSize:12,fontWeight:600,color:'var(--text-2)',cursor:'pointer'}}>
                  {editLodge?'Fermer':haslodge?'Modifier':'+ Ajouter'}
                </button>
              )}
              <span style={{color:'var(--text-3)',transition:'transform .2s',display:'inline-flex',alignItems:'center',transform:lodgeOpen?'rotate(180deg)':'rotate(0deg)'}}><SvgIcon name="chevronDown" size={18} /></span>
            </div>
          </div>
        </div>

        {/* Filtres */}
        <div style={{padding:'10px 14px'}}>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:6,marginBottom:6}}>
            <FilterBtn active={filtre==='all'} onClick={()=>setFiltre('all')} color="#6B7280" activeColor="#1A4A1A" activeStyle="solid" icon={getCatSvg('all')}>Tout</FilterBtn>
            {['itineraire','transport','lodge','permis'].map(id=>{const c=CATEGORIES.find(x=>x.id===id)!;return(
              <FilterBtn key={id} active={filtre===id} onClick={()=>setFiltre(id)} color={c.color} icon={getCatSvg(id, 16, trip.type)}>
                {id==='itineraire'?'Itinéraire':id==='transport'?'Vols':id==='lodge'?getLodgeLabel(trip.type).label:getPermisLabel(trip.type)}
              </FilterBtn>
            )})}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:6}}>
            {['equipement','infos','meteo','resto','liens'].map(id=>{const c=CATEGORIES.find(x=>x.id===id)!;return(
              <FilterBtn key={id} active={filtre===id} onClick={()=>setFiltre(id)} color={c.color} icon={getCatSvg(id, 16, trip.type)}>
                {id==='equipement'?'Équipements':id==='infos'?'Infos':id==='meteo'?'Météo':id==='resto'?'Restos':'Liens'}
              </FilterBtn>
            )})}
          </div>
        </div>
      </div>

      {/* Détails Lodge (hors sticky, scrollable) */}
      {lodgeOpen && (
        <div style={{background:'#fff',borderBottom:'1px solid var(--border)',padding:'14px 16px'}}>
          {!editLodge && haslodge && (
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
              {lodge.nom && <LodgeItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L2 12h3v8h5v-6h4v6h5v-8h3L12 3z"/></svg>} label="Nom" val={lodge.nom} />}
              {lodge.adresse && <LodgeItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>} label="Adresse" val={lodge.adresse} />}
              {lodge.tel && <LodgeItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg>} label="Téléphone" val={lodge.tel} link={`tel:${lodge.tel}`} />}
              {lodge.wifi && <LodgeItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg>} label="WiFi" val={lodge.wifi} />}
              {lodge.arrivee && <LodgeItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg>} label="Arrivée" val={lodge.arrivee} />}
              {lodge.code && <LodgeItem icon={<svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>} label="Départ" val={lodge.code} />}
            </div>
          )}
          {!editLodge && !haslodge && isCreateur && (
            <button onClick={()=>setEditLodge(true)} style={{width:'100%',padding:'10px',borderRadius:8,border:'1.5px dashed var(--border)',background:'transparent',color:'var(--text-3)',fontSize:13,cursor:'pointer'}}>
              + Ajouter les infos du {getLodgeLabel(trip.type).label.toLowerCase()}
            </button>
          )}
          {editLodge && (
            <div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:10,marginBottom:12}}>
                {[
                  {key:'nom', label:'Nom du Lodge', ph:`Ex: Babine Norlakes`},
                  {key:'adresse', label:'Adresse', ph:'Ex: Smithers, BC'},
                  {key:'tel', label:'Téléphone', ph:'+1 250 000 0000'},
                  {key:'wifi', label:'WiFi', ph:'Ex: fishing2025'},
                  {key:'arrivee', label:"Heure d'arrivée", ph:'Ex: 14h00 le 8 juin'},
                  {key:'code', label:'Heure de départ', ph:'Ex: 10h00 le 25 avril'},
                ].map(({key,label,ph}) => (
                  <div key={key}>
                    <div style={{fontSize:11,fontWeight:700,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:5}}>{label}</div>
                    <input className="input" placeholder={ph} value={(lodge as any)[key]}
                      onChange={e=>setLodge(p=>({...p,[key]:e.target.value}))} style={{padding:'9px 11px',fontSize:13}} />
                  </div>
                ))}
              </div>
              <button className="btn btn-primary" onClick={saveLodge} disabled={savingLodge} style={{padding:'10px',fontSize:13}}>
                {savingLodge?'Sauvegarde…':'Sauvegarder'}
              </button>
            </div>
          )}
        </div>
      )}

      {/* Cards */}
      <div style={{padding:'14px 14px 100px',display:'flex',flexDirection:'column',gap:10}}>
        {filtered.length === 0 ? (
          <div className="empty">
            {filtre==='all' ? (
              <span style={{display:'inline-flex',width:64,height:64,borderRadius:16,background:'#1A4A1A',color:'#fff',alignItems:'center',justifyContent:'center',marginBottom:14}}>
                <SvgIcon name="clipboard" size={32} />
              </span>
            ) : (
              <span style={{display:'inline-flex',width:64,height:64,borderRadius:16,background:getCat(filtre).color,color:'#fff',alignItems:'center',justifyContent:'center',marginBottom:14}}>
                {getCatSvg(filtre, 32, trip.type)}
              </span>
            )}
            <div>Aucune info ici pour l&apos;instant.<br/>Appuyez sur <strong>+</strong> pour ajouter.</div>
          </div>
        ) : filtered.map(card => (
          <InfoCardView key={card.id} card={card}
            canDelete={canDelete} canEdit={canEdit} isCreateur={isCreateur}
            collapsed={filtre==='all'} currentFiltre={filtre} tripType={trip.type}
            onDelete={()=>removeCard(card.id)}
            onEdit={()=>openEdit(card)}
            onOpenPdf={openPdf}
            onCardClick={filtre==='all' ? ()=>{
              window.history.pushState({...window.history.state, filtre:'all'}, '')
              setFiltre(card.categorie)
              setTimeout(()=>{
                const el = document.getElementById(card.id)
                if (el) window.scrollTo({top: el.getBoundingClientRect().top + window.scrollY - 160, behavior:'smooth'})
              }, 80)
            } : undefined}
          />
        ))}
      </div>

      {/* FAB */}
      <button className="fab" onClick={()=>{if(filtre!=='all')setCat(filtre);setSheetOpen(true)}} aria-label="Ajouter">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
        </svg>
      </button>

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
            <input className="input" type="date" value={editD1} onChange={e=>setEditD1(e.target.value)} style={{flex:1}} />
            <input className="input" type="date" value={editD2} onChange={e=>setEditD2(e.target.value)} style={{flex:1}} />
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
        <div className="field"><label>Catégorie</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:6}}>
            {CHIP_ORDER.map(id=>{const c=CATEGORIES.find(x=>x.id===id)!;const active=editCat===c.id;return(
              <button key={c.id} onClick={()=>setEditCat(c.id)} style={{
                padding:'7px 3px',borderRadius:14,
                border:`${active?2:1.5}px solid ${active?c.color:'var(--border)'}`,
                background:active?`${c.color}15`:'transparent',
                color:active?c.color:'var(--text-2)',fontSize:10,fontWeight:600,cursor:'pointer',
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,
                lineHeight:1.15,minWidth:0
              }}>
                <span style={{width:22,height:22,borderRadius:6,background:c.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{getCatSvg(c.id, 13, trip.type)}</span>
                <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{getChipLabel(c.id, trip.type)}</span>
              </button>
            )})}
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
          <input ref={editFileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}} onChange={e=>setEditPdfFile(e.target.files?.[0]||null)} />
          {editCard?.fichier_url && !editPdfFile && !editFichierRemoved && (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,padding:'10px 14px',border:'1.5px solid var(--border)',marginBottom:8}}>
              <span style={{fontSize:20}}>{isPdf(editCard.fichier_url)?'📄':'🖼️'}</span>
              <div style={{flex:1,fontSize:12,color:'var(--text-2)',whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>Fichier actuel</div>
              <button onClick={()=>editFileRef.current?.click()} style={{background:'none',border:'1px solid var(--border)',borderRadius:7,padding:'4px 10px',fontSize:12,fontWeight:600,color:'var(--text-2)',cursor:'pointer',flexShrink:0}}>Remplacer</button>
              <button onClick={()=>setEditFichierRemoved(true)} style={{background:'none',border:'1px solid #FCA5A5',borderRadius:7,padding:'4px 10px',fontSize:12,fontWeight:600,color:'#DC2626',cursor:'pointer',flexShrink:0}}>Supprimer</button>
            </div>
          )}
          {editPdfFile ? (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,padding:'10px 14px',border:'1.5px solid var(--border)'}}>
              <span style={{fontSize:24}}>📄</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{editPdfFile.name}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>{formatSize(editPdfFile.size)}</div>
              </div>
              <button onClick={()=>setEditPdfFile(null)} style={{background:'none',border:'none',fontSize:18,color:'var(--text-3)',cursor:'pointer'}}>×</button>
            </div>
          ) : !editCard?.fichier_url && (
            <button onClick={()=>editFileRef.current?.click()} style={{background:'transparent',border:'2px dashed var(--border)',color:'var(--text-2)',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              📎 Choisir un PDF ou une photo
            </button>
          )}
        </div>
        {editUploading && <div style={{textAlign:'center',fontSize:13,color:'var(--text-3)',marginBottom:12,padding:'10px',background:'var(--sand)',borderRadius:10,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%'}}><SvgIcon name="hourglass" size={14} /> Upload en cours…</div>}
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
        <div className="field"><label>Catégorie</label>
          <div style={{display:'grid',gridTemplateColumns:'repeat(5,minmax(0,1fr))',gap:6}}>
            {/* Case vide en première position (haut-gauche) pour rythme visuel */}
            <div style={{visibility:'hidden'}} aria-hidden="true" />
            {CHIP_ORDER.map(id=>{const c=CATEGORIES.find(x=>x.id===id)!;const active=cat===c.id;return(
              <button key={c.id} onClick={()=>setCat(c.id)} style={{
                padding:'7px 3px',borderRadius:14,
                border:`${active?2:1.5}px solid ${active?c.color:'var(--border)'}`,
                background:active?`${c.color}15`:'transparent',
                color:active?c.color:'var(--text-2)',fontSize:10,fontWeight:600,cursor:'pointer',
                display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,
                lineHeight:1.15,minWidth:0
              }}>
                <span style={{width:22,height:22,borderRadius:6,background:c.color,color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>{getCatSvg(c.id, 13, trip.type)}</span>
                <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{getChipLabel(c.id, trip.type)}</span>
              </button>
            )})}
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
        <div className="field">
          <label>Document PDF (optionnel)</label>
          <input ref={fileRef} type="file" accept="application/pdf,image/*" style={{display:'none'}} onChange={e=>setPdfFile(e.target.files?.[0]||null)} />
          {pdfFile ? (
            <div style={{display:'flex',alignItems:'center',gap:10,background:'var(--sand)',borderRadius:10,padding:'10px 14px',border:'1.5px solid var(--border)'}}>
              <span style={{fontSize:24}}>📄</span>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:600,whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{pdfFile.name}</div>
                <div style={{fontSize:11,color:'var(--text-3)'}}>{formatSize(pdfFile.size)}</div>
              </div>
              <button onClick={()=>setPdfFile(null)} style={{background:'none',border:'none',fontSize:18,color:'var(--text-3)',cursor:'pointer'}}>×</button>
            </div>
          ) : (
            <button onClick={()=>fileRef.current?.click()} style={{background:'transparent',border:'2px dashed var(--border)',color:'var(--text-2)',fontSize:14,fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:8}}>
              📎 Choisir un PDF ou une photo
            </button>
          )}
        </div>
        {uploading && <div style={{textAlign:'center',fontSize:13,color:'var(--text-3)',marginBottom:12,padding:'10px',background:'var(--sand)',borderRadius:10,display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6,width:'100%'}}><SvgIcon name="hourglass" size={14} /> Upload en cours…</div>}
        <button className="btn btn-primary" onClick={save} disabled={saving||!titre.trim()}>
          {saving?(uploading?'Upload…':'Ajout…'):'Ajouter'}
        </button>
        <button className="btn btn-ghost" style={{marginTop:8}} onClick={()=>setSheetOpen(false)}>Annuler</button>
      </div>
    </>
  )
}

function LodgeItem({icon,label,val,link}:{icon:React.ReactNode,label:string,val:string,link?:string}) {
  return (
    <div style={{background:'var(--sand)',borderRadius:10,padding:'9px 12px'}}>
      <div style={{fontSize:11,color:'var(--text-3)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.05em',marginBottom:3,display:'inline-flex',alignItems:'center',gap:5}}>
        <span style={{display:'inline-flex',alignItems:'center',color:'var(--text-3)'}}>{icon}</span>
        {label}
      </div>
      {link
        ? <a href={link} style={{fontSize:13,fontWeight:600,color:'var(--green)',textDecoration:'none'}}>{val}</a>
        : <div style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{val}</div>}
    </div>
  )
}

function FilterBtn({active,onClick,color,activeColor,activeStyle,icon,children}:{active:boolean,onClick:()=>void,color?:string,activeColor?:string,activeStyle?:'tinted'|'solid',icon?:React.ReactNode,children:React.ReactNode}) {
  const pillColor = color || 'var(--forest)'
  // activeColor override pour la couleur d'état actif (ex: "Tout" a pastille grise mais état actif vert)
  const selColor = activeColor || pillColor
  const solid = activeStyle === 'solid'
  return (
    <button onClick={onClick} style={{
      padding:'7px 3px',borderRadius:14,
      border:`${active?2:1.5}px solid ${active?selColor:'var(--border)'}`,
      background: active ? (solid ? selColor : `${selColor}15`) : 'transparent',
      color: active ? (solid ? '#fff' : selColor) : 'var(--text-2)',
      fontSize:10,fontWeight:600,cursor:'pointer',
      display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:4,
      lineHeight:1.15,minWidth:0
    }}>
      {icon && (
        <span style={{
          width:22,height:22,borderRadius:6,
          background: (active && solid) ? 'rgba(255,255,255,.2)' : pillColor,
          color:'#fff',
          display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0
        }}>{icon}</span>
      )}
      <span style={{whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis',maxWidth:'100%'}}>{children}</span>
    </button>
  )
}

// Label court pour les chips verticales des sheets (Ajouter/Modifier)
function getChipLabel(id: string, tripType?: string): string {
  switch (id) {
    case 'itineraire': return 'Itinéraire'
    case 'transport':  return 'Vols'
    case 'lodge':
      switch (tripType) {
        case 'ski': case 'velo': return 'Hôtel'
        case 'hike': return 'Refuge'
        case 'yoga': case 'soleil': return 'Resort'
        default: return 'Lodge'
      }
    case 'permis':
      switch (tripType) {
        case 'ski': return 'Billets'
        case 'peche': return 'Permis'
        default: return 'Accès'
      }
    case 'equipement': return 'Équip.'
    case 'infos':      return 'Infos'
    case 'meteo':      return 'Météo'
    case 'resto':      return 'Restos'
    case 'liens':      return 'Liens'
    default: return ''
  }
}
