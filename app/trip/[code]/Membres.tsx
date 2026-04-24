'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import type { Membre, Trip, ParticipantAutorise } from '@/lib/types'
import { normalizeName, normalizeTel, formatNomComplet, hashNip, isValidNip } from '@/lib/types'
import { apiManageAutorises, apiDeleteMemberSafe, apiUpdateTripFields, apiUpdateMember, apiDeleteTripFull, apiSaveNip } from '@/lib/api'
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
  const [newNom, setNewNom] = useState('')
  const [newTel, setNewTel] = useState('')
  const [showDelete, setShowDelete] = useState(false)
  const [deleteConfirm, setDeleteConfirm] = useState('')
  const [deleting, setDeleting] = useState(false)
  const [editingPrenom, setEditingPrenom] = useState(false)
  const [newPrenomSelf, setNewPrenomSelf] = useState('')
  const [newNomSelf, setNewNomSelf] = useState('')
  const [savingPrenom, setSavingPrenom] = useState(false)
  const [editingNip, setEditingNip] = useState(false)
  const [newNip, setNewNip] = useState('')
  const [savingNip, setSavingNip] = useState(false)
  const [nipError, setNipError] = useState<string|null>(null)
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

    // Generer le QR code au mount pour tous les membres.
    // - Createur: permet au bouton "QR Code" d'ouvrir la modal instantanement
    // - Participant: affiche le QR d'office pour aider un autre participant
    //   deja ajoute a la liste a se connecter rapidement (telephone a telephone)
    if (typeof window !== 'undefined') {
      const url = `${window.location.origin}/install`
      QRCode.toDataURL(url, { width: 512, margin: 2, color: { dark: '#0F2D0F', light: '#ffffff' } })
        .then(d => setQrDataUrl(d))
        .catch(() => {})
    }
  },[trip.id, trip.code])

  function copyLink() {
    navigator.clipboard.writeText(`${window.location.origin}/install`)
    setCopied(true); setTimeout(()=>setCopied(false),3000)
  }
  function openTexto() {
    const url = `${window.location.origin}/install`
    const body = `Je t'invite au trip ${trip.nom} sur Crew Trips. Installe l'app ici: ${url}`
    window.location.href = `sms:&body=${encodeURIComponent(body)}`
  }
  function openMail() {
    const url = `${window.location.origin}/install`
    const subject = `Invitation : ${trip.nom} (Crew Trips)`
    const body = `Je t'invite au trip ${trip.nom}.\n\nInstalle l'app ici : ${url}\n\nCrew Trips regroupe les infos du voyage — vols, lodge, chat. Aucun compte requis. L'invitation au trip apparaitra automatiquement apres creation de ton identite.`
    window.location.href = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`
  }
  async function openQRModal() {
    // Si deja genere (cas normal), juste ouvrir la modal
    if (qrDataUrl) { setShowQR(true); return }
    // Fallback si la generation au mount a echoue
    const url = `${window.location.origin}/install`
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
    const prenomClean = newPrenom.trim()
    const nomClean = newNom.trim()
    const telClean = normalizeTel(newTel)
    if (!prenomClean || !nomClean) { alert('Prénom et nom de famille requis.'); return }
    if (newTel && telClean.length !== 10) { alert('Le téléphone doit contenir 10 chiffres ou être vide.'); return }

    // Détection homonymes parfaits (même prénom + même nom)
    const homonymes = autorises.filter(a =>
      normalizeName(a.prenom) === normalizeName(prenomClean)
      && normalizeName(a.nom || '') === normalizeName(nomClean)
    )

    if (homonymes.length > 0) {
      // Cas homonyme : les deux DOIVENT avoir un téléphone différent
      if (!telClean) {
        alert(`Un autre participant porte déjà le prénom et nom "${prenomClean} ${nomClean}".\n\nPour permettre la connexion des deux, vous devez fournir un téléphone pour ce nouveau participant.`)
        return
      }
      const existantSansTel = homonymes.find(h => !normalizeTel(h.tel || ''))
      if (existantSansTel) {
        alert(`Un autre participant porte déjà le prénom et nom "${prenomClean} ${nomClean}" sans téléphone.\n\nAjoutez d'abord un téléphone pour cet autre participant, puis réessayez.`)
        return
      }
      const conflit = homonymes.find(h => normalizeTel(h.tel || '') === telClean)
      if (conflit) { alert('Ce téléphone est déjà utilisé par un homonyme.'); return }
    }

    // Phase 2 : RPC manage_autorises avec fallback direct
    let data: ParticipantAutorise | null = null
    const rpc = await apiManageAutorises(trip.code, trip.id, {
      action: 'add',
      prenom: prenomClean,
      nom: nomClean,
      tel: telClean || null,
    })
    if (rpc.success && rpc.id) {
      data = { id: rpc.id, trip_id: trip.id, prenom: prenomClean, nom: nomClean, tel: telClean || null } as ParticipantAutorise
    } else {
      const { data: d } = await supabase.from('participants_autorises')
        .insert({
          trip_id: trip.id,
          prenom: prenomClean,
          nom: nomClean,
          tel: telClean || null
        })
        .select().single()
      data = d
    }
    if (data) {
      setAutorises(p => [...p, data])
      setNewPrenom(''); setNewNom(''); setNewTel('')
    }
  }

  async function retirerAutorise(id: string, prenom: string, nom: string) {
    // Phase 2 : RPC manage_autorises avec fallback direct
    const rpc = await apiManageAutorises(trip.code, trip.id, { action: 'delete', id })
    if (!rpc.success) {
      await supabase.from('participants_autorises').delete().eq('id', id)
    }
    setAutorises(p=>p.filter(a=>a.id!==id))
    // Déconnecter le membre actif correspondant (jamais le créateur)
    const m = membres.find(m =>
      normalizeName(m.prenom) === normalizeName(prenom)
      && normalizeName(m.nom || '') === normalizeName(nom)
    )
    if (m && !m.is_createur) {
      // Phase 2 : RPC delete_member_safe avec fallback direct
      const rpcDel = await apiDeleteMemberSafe(trip.code, m.id)
      if (!rpcDel.success) {
        await supabase.from('membres').delete().eq('id', m.id)
      }
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
    if (!confirm(`Retirer ${formatNomComplet(m.prenom, m.nom)} du trip ?`)) return
    // Phase 2 : RPC delete_member_safe avec fallback direct
    const rpc = await apiDeleteMemberSafe(trip.code, m.id)
    if (!rpc.success) {
      await supabase.from('membres').delete().eq('id', m.id)
    }
    setMembres(p=>p.filter(x=>x.id!==m.id))
  }

  async function togglePermission(key: 'can_delete'|'can_edit'|'can_post_photos') {
    const oldVal = trip[key]
    const newVal = !oldVal
    // Optimistic : on met à jour l'UI tout de suite
    onTripUpdate({[key]:newVal})
    try {
      // Phase 2 : RPC update_trip_fields avec fallback direct
      const rpc = await apiUpdateTripFields(trip.code, trip.id, { [key]: newVal })
      if (!rpc.success) {
        const { error } = await supabase.from('trips').update({[key]:newVal}).eq('id',trip.id)
        if (error) throw error
      }
    } catch (e: unknown) {
      // Rollback
      onTripUpdate({[key]:oldVal})
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    }
  }

  async function savePrenom() {
    const prenomClean = newPrenomSelf.trim()
    const nomClean = newNomSelf.trim()
    if (!prenomClean) { setEditingPrenom(false); return }
    if (prenomClean === membre.prenom && nomClean === (membre.nom || '')) { setEditingPrenom(false); return }
    setSavingPrenom(true)
    // Phase 2 : RPC update_member avec fallback direct
    const rpc = await apiUpdateMember(trip.code, membre.id, { prenom: prenomClean, nom: nomClean })
    if (!rpc.success) {
      await supabase.from('membres').update({ prenom: prenomClean, nom: nomClean }).eq('id', membre.id)
    }
    // Mettre à jour le localStorage + liste locale + localStorage crew-prenom/crew-nom
    try {
      const stored = localStorage.getItem(`crew2-${trip.code}`)
      if (stored) {
        const m = JSON.parse(stored)
        m.prenom = prenomClean
        m.nom = nomClean
        localStorage.setItem(`crew2-${trip.code}`, JSON.stringify(m))
      }
      localStorage.setItem('crew-prenom', prenomClean)
      localStorage.setItem('crew-nom', nomClean)
    } catch {}
    setMembres(p => p.map(m => m.id === membre.id ? { ...m, prenom: prenomClean, nom: nomClean } : m))
    setSavingPrenom(false)
    setEditingPrenom(false)
  }

  async function saveNip() {
    // Permet au membre courant de creer (si nip NULL) ou modifier son NIP.
    // Pas de double saisie - l'utilisateur voit le NIP en clair pendant
    // qu'il le tape, peut verifier visuellement avant d'enregistrer.
    //
    // IMPORTANT: le NIP est personnel a l'utilisateur (identifie par son tel),
    // pas specifique au trip. On propage donc le nouveau NIP a TOUTES les
    // lignes membres avec le meme tel (donc a tous les trips de l'utilisateur).
    // Coherent avec le modele "1 personne = 1 NIP unique".
    const nipClean = newNip.trim()
    if (!isValidNip(nipClean)) {
      setNipError('NIP requis (4 chiffres).')
      return
    }
    setSavingNip(true)
    setNipError(null)
    try {
      const nipHash = await hashNip(nipClean)
      const telDigits = normalizeTel(membre.tel || '')
      // Phase 2 : RPC save_nip propage à toutes les lignes du même tel.
      // Fallback direct si la RPC échoue (RLS pas encore active).
      const rpc = await apiSaveNip(telDigits, nipHash)
      if (!rpc.success) {
        if (!telDigits) {
          const { error } = await supabase.from('membres')
            .update({ nip: nipHash })
            .eq('id', membre.id)
          if (error) throw error
        } else {
          const { error } = await supabase.from('membres')
            .update({ nip: nipHash })
            .eq('tel', telDigits)
          if (error) throw error
        }
      }
      // Mise a jour locale du state (uniquement pour ce trip-ci, les autres
      // trips auront leur state mis a jour lors de leur prochain chargement)
      setMembres(p => p.map(m => m.id === membre.id ? { ...m, nip: nipHash } : m))
      setEditingNip(false)
      setNewNip('')
    } catch (e: unknown) {
      setNipError('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setSavingNip(false)
    }
  }

  async function generateShareToken() {
    if (generatingShare) return
    const oldToken = trip.share_token
    const newToken = crypto.randomUUID()
    // Optimistic
    setGeneratingShare(true)
    onTripUpdate({ share_token: newToken })
    try {
      // Phase 2 : RPC update_trip_fields avec fallback direct
      const rpc = await apiUpdateTripFields(trip.code, trip.id, { share_token: newToken })
      if (!rpc.success) {
        const { error } = await supabase.from('trips').update({ share_token: newToken }).eq('id', trip.id)
        if (error) throw error
      }
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
      // Phase 2 : RPC update_trip_fields avec fallback direct
      const rpc = await apiUpdateTripFields(trip.code, trip.id, { share_token: newToken })
      if (!rpc.success) {
        const { error } = await supabase.from('trips').update({ share_token: newToken }).eq('id', trip.id)
        if (error) throw error
      }
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
      // Phase 2 : RPC delete_trip_full (cascade côté serveur) avec fallback direct
      const rpc = await apiDeleteTripFull(trip.code, trip.id)
      if (!rpc.success) {
        // Fallback : Supprimer les tables liées avant le trip (au cas où CASCADE manquant en DB)
        await supabase.from('messages').delete().eq('trip_id', trip.id)
        await supabase.from('infos').delete().eq('trip_id', trip.id)
        await supabase.from('participants_autorises').delete().eq('trip_id', trip.id)
        await supabase.from('membres').delete().eq('trip_id', trip.id)
        const { error } = await supabase.from('trips').delete().eq('id', trip.id)
        if (error) throw new Error(error.message)
      }
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
      {/* Inviter des participants — createur seulement.
          Bloc traditionnel avec lien + 4 boutons (Copier / QR Code / Courriel / Texto).
          L'admin s'en sert pour envoyer l'invitation au nouveau participant. */}
      {isCreateur && (
      <div style={{background:'var(--forest)',borderRadius:18,padding:20,marginBottom:16,textAlign:'center'}}>
        <div style={{display:'inline-flex',alignItems:'center',justifyContent:'center',width:44,height:44,borderRadius:10,background:'#7C3AED',color:'#fff',marginBottom:6}}><SvgIcon name="link" size={24} /></div>
        <div style={{color:'#fff',fontWeight:700,fontSize:16,marginBottom:6}}>Inviter des participants</div>
        <div style={{color:'rgba(255,255,255,.55)',fontSize:13,marginBottom:14,lineHeight:1.5}}>
          Partagez ce lien — aucun compte requis.
        </div>
        <div style={{background:'rgba(255,255,255,.08)',borderRadius:10,padding:'8px 12px',fontSize:12,
          color:'rgba(255,255,255,.6)',fontFamily:'monospace',marginBottom:12,wordBreak:'break-all',
          border:'1px solid rgba(255,255,255,.12)'}}>
          {typeof window!=='undefined'?`${window.location.origin}/install`:`/trip/${trip.code}`}
        </div>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:8}}>
          <button onClick={copyLink} style={{gridColumn:'1 / -1',padding:'12px',borderRadius:10,border:'none',
            background:copied?'rgba(255,255,255,.92)':'#fff',
            color:'var(--forest)',fontWeight:700,fontSize:14,cursor:'pointer',transition:'background .2s',
            display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6}}>
            {copied?<><SvgIcon name="check" size={14} />Copié !</>:<><SvgIcon name="clipboard" size={14} />Copier le lien</>}
          </button>
          <button onClick={openQRModal} style={{padding:'11px',borderRadius:10,
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
      )}

      {/* QR code pour inviter un copain — participants (non createurs) seulement.
          Affiche le QR du trip d'office pour que le participant puisse le
          montrer a un autre participant DEJA ajoute a la liste, qui est a
          cote de lui (telephone a telephone). Pas de boutons de partage:
          c'est uniquement scanner-sur-place. */}
      {!isCreateur && (
        <div style={{background:'var(--forest)',borderRadius:18,padding:20,marginBottom:16,textAlign:'center'}}>
          <div style={{color:'#fff',fontWeight:700,fontSize:16,marginBottom:6}}>
            QR code pour aider un copain
          </div>
          <div style={{color:'rgba(255,255,255,.6)',fontSize:13,marginBottom:14,lineHeight:1.55,maxWidth:320,margin:'0 auto 14px'}}>
            Montrez ce code à quelqu'un pour qu'il installe Crew Trips. S'il a été ajouté à la liste des participants, l'invitation à ce trip apparaîtra automatiquement après sa création d'identité.
          </div>

          {qrDataUrl ? (
            <button onClick={openQRModal}
              style={{background:'#fff',borderRadius:12,padding:12,border:'none',cursor:'pointer',
                display:'block',margin:'0 auto'}}
              title="Cliquez pour agrandir">
              <img src={qrDataUrl} alt="QR code" style={{display:'block',width:180,height:180}} />
            </button>
          ) : (
            <div style={{background:'rgba(255,255,255,.08)',borderRadius:12,width:204,height:204,
              display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto',
              color:'rgba(255,255,255,.4)',fontSize:12}}>
              Génération du QR…
            </div>
          )}
        </div>
      )}

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
              ? 'Liste vide — tout le monde peut entrer. Ajoutez des participants pour restreindre l\'accès.'
              : `${autorises.length} participant${autorises.length>1?'s':''} autorisé${autorises.length>1?'s':''}.`}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:6,marginBottom:6}}>
            <input className="input" placeholder="Prénom" value={newPrenom}
              onChange={e=>setNewPrenom(e.target.value)}
              style={{fontSize:13,padding:'9px 12px'}} />
            <input className="input" placeholder="Nom de famille" value={newNom}
              onChange={e=>setNewNom(e.target.value)}
              onKeyDown={e=>e.key==='Enter'&&ajouterAutorise()}
              style={{fontSize:13,padding:'9px 12px'}} />
          </div>
          <div style={{display:'flex',gap:6,marginBottom:6}}>
            <input className="input" type="tel" placeholder="Téléphone (optionnel)"
              value={newTel}
              onChange={e=>{
                const d = e.target.value.replace(/\D/g,'').slice(0,10)
                const f = d.length<=3 ? d : d.length<=6 ? `${d.slice(0,3)} ${d.slice(3)}` : `${d.slice(0,3)} ${d.slice(3,6)} ${d.slice(6)}`
                setNewTel(f)
              }}
              onKeyDown={e=>e.key==='Enter'&&ajouterAutorise()}
              style={{flex:1,fontSize:13,padding:'9px 12px',letterSpacing:1}} />
            <button onClick={ajouterAutorise} disabled={!newPrenom.trim()||!newNom.trim()}
              style={{padding:'0 14px',borderRadius:10,border:'none',
                background:(newPrenom.trim()&&newNom.trim())?'var(--forest)':'var(--border)',
                color:'#fff',fontWeight:700,fontSize:16,cursor:'pointer'}}>+</button>
          </div>
          <div style={{fontSize:11,color:'var(--text-3)',marginBottom:10,lineHeight:1.5}}>
            Téléphone : à remplir seulement si deux participants portent exactement le même prénom et nom.
          </div>
          {autorises.length>0 && (
            <div style={{display:'flex',flexWrap:'wrap',gap:7}}>
              {autorises.map(a=>{
                const connecte = membres.some(m =>
                  normalizeName(m.prenom) === normalizeName(a.prenom)
                  && normalizeName(m.nom || '') === normalizeName(a.nom || '')
                )
                const aTel = !!normalizeTel(a.tel || '')
                return (
                  <div key={a.id} style={{display:'flex',alignItems:'center',gap:6,
                    background:connecte?'#F0FDF4':'var(--sand)',borderRadius:20,
                    padding:'5px 10px 5px 12px',border:`1px solid ${connecte?'#BBF7D0':'var(--border)'}`}}>
                    <span style={{width:7,height:7,borderRadius:'50%',
                      background:connecte?'#16A34A':'#D1D5DB',flexShrink:0}} />
                    <span style={{fontSize:13,fontWeight:600,color:'var(--text)'}}>{formatNomComplet(a.prenom, a.nom)}</span>
                    {aTel && (
                      <span title="Téléphone enregistré" style={{display:'inline-flex',color:'var(--text-3)'}}>
                        <SvgIcon name="chat" size={11} />
                      </span>
                    )}
                    <button onClick={()=>retirerAutorise(a.id,a.prenom,a.nom)}
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
              <div style={{fontWeight:700,fontSize:15,display:'flex',alignItems:'center',gap:7,flexWrap:'wrap'}}>
                {formatNomComplet(m.prenom, m.nom)}
                {m.is_createur && (
                  <span style={{fontSize:10,fontWeight:700,color:'#B45309',background:'#FFFBEB',
                    border:'1px solid #FDE68A',borderRadius:6,padding:'2px 6px',letterSpacing:'.04em'}}>
                    ADMINISTRATEUR
                  </span>
                )}
                {!m.nom && (
                  <span title="Nom de famille manquant — à compléter" style={{fontSize:10,fontWeight:700,color:'#DC2626',background:'#FEF2F2',
                    border:'1px solid #FECACA',borderRadius:6,padding:'2px 6px',letterSpacing:'.04em'}}>
                    ⚠ NOM MANQUANT
                  </span>
                )}
              </div>
              <div style={{fontSize:11,color:'var(--text-3)',marginTop:1}}>
                {m.id===membre.id ? 'Vous · ' : ''}
                Depuis {new Date(m.created_at).toLocaleDateString('fr-CA',{day:'numeric',month:'long'})}
              {m.id===membre.id && !editingPrenom && (
                <button onClick={()=>{setNewPrenomSelf(m.prenom);setNewNomSelf(m.nom||'');setEditingPrenom(true)}}
                  style={{background:"none",border:"none",padding:0,marginTop:3,cursor:"pointer",display:"flex",alignItems:"center",gap:5,color:"var(--green)"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="3" ry="3"/><path d="M8 16l2.5-.5 6.5-6.5a1.5 1.5 0 0 0-2.1-2.1L8.5 13.5 8 16z"/></svg>
                  <span style={{fontSize:11,fontWeight:600,textDecoration:"underline"}}>Modifier mon nom</span>
                </button>
              )}
              {m.id===membre.id && !editingNip && (
                <button onClick={()=>{setNewNip('');setNipError(null);setEditingNip(true)}}
                  style={{background:"none",border:"none",padding:0,marginTop:4,cursor:"pointer",display:"flex",alignItems:"center",gap:5,
                    color: m.nip ? "var(--green)" : "#DC2626"}}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                    <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  <span style={{fontSize:11,fontWeight:600,textDecoration:"underline"}}>
                    {m.nip ? 'Modifier mon NIP' : '⚠ Créer mon NIP'}
                  </span>
                </button>
              )}
              {m.id===membre.id && editingNip && (
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:8,padding:10,background:"var(--sand)",borderRadius:8,border:"1px solid var(--border)"}}>
                  <div style={{fontSize:11,color:"var(--text-2)",fontWeight:600,marginBottom:2}}>
                    {membre.nip ? 'Nouveau NIP (4 chiffres)' : 'Créez votre NIP (4 chiffres)'}
                  </div>
                  <input className="input" type="text" inputMode="numeric"
                    value={newNip} placeholder="••••" maxLength={4}
                    onChange={e=>{setNewNip(e.target.value.replace(/\D/g,'').slice(0,4));setNipError(null)}}
                    onKeyDown={e=>{if(e.key==="Enter"&&isValidNip(newNip)) saveNip(); if(e.key==="Escape") setEditingNip(false)}}
                    autoFocus
                    style={{fontSize:20,letterSpacing:8,textAlign:"center",fontWeight:700,padding:"8px 10px",
                      border: nipError ? "1.5px solid #DC2626" : isValidNip(newNip) ? "1.5px solid #16A34A" : "1px solid var(--border)"}} />
                  <div style={{fontSize:10,color:"var(--text-3)",lineHeight:1.4,fontStyle:"italic"}}>
                    ℹ️ Ce NIP sera utilisé sur tous vos trips.
                  </div>
                  {nipError && (
                    <div style={{fontSize:11,color:"#DC2626",lineHeight:1.4}}>{nipError}</div>
                  )}
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={saveNip} disabled={savingNip||!isValidNip(newNip)}
                      style={{flex:1,padding:"8px 12px",borderRadius:8,border:"none",
                        background: isValidNip(newNip) ? "var(--forest)" : "var(--border)",
                        color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      {savingNip?"…":"Enregistrer"}
                    </button>
                    <button onClick={()=>{setEditingNip(false);setNewNip('');setNipError(null)}}
                      style={{padding:"8px 12px",borderRadius:8,border:"1px solid var(--border)",
                        background:"transparent",color:"var(--text-2)",fontSize:12,cursor:"pointer"}}>
                      Annuler
                    </button>
                  </div>
                </div>
              )}
              {m.id===membre.id && editingPrenom && (
                <div style={{display:"flex",flexDirection:"column",gap:6,marginTop:6}}>
                  <div style={{display:"flex",gap:6}}>
                    <input className="input" value={newPrenomSelf}
                      placeholder="Prénom"
                      onChange={e=>setNewPrenomSelf(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter") savePrenom(); if(e.key==="Escape") setEditingPrenom(false)}}
                      autoFocus style={{flex:1,fontSize:13,padding:"6px 10px"}} />
                    <input className="input" value={newNomSelf}
                      placeholder="Nom de famille"
                      onChange={e=>setNewNomSelf(e.target.value)}
                      onKeyDown={e=>{if(e.key==="Enter") savePrenom(); if(e.key==="Escape") setEditingPrenom(false)}}
                      style={{flex:1,fontSize:13,padding:"6px 10px"}} />
                  </div>
                  <div style={{display:"flex",gap:6}}>
                    <button onClick={savePrenom} disabled={savingPrenom||!newPrenomSelf.trim()}
                      style={{flex:1,padding:"7px 12px",borderRadius:8,border:"none",background:"var(--forest)",
                        color:"#fff",fontSize:12,fontWeight:600,cursor:"pointer"}}>
                      {savingPrenom?"…":"Enregistrer"}
                    </button>
                    <button onClick={()=>setEditingPrenom(false)}
                      style={{padding:"7px 12px",borderRadius:8,border:"1px solid var(--border)",
                        background:"transparent",color:"var(--text-2)",fontSize:12,cursor:"pointer"}}>
                      Annuler
                    </button>
                  </div>
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
            const participants = autorises.map(a=>formatNomComplet(a.prenom, a.nom))
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
