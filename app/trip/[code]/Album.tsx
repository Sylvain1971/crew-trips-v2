'use client'
import { useEffect, useState, useRef, useCallback, memo } from 'react'
import dynamic from 'next/dynamic'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/imageCompression'
import { downloadAlbumAsZip } from '@/lib/downloadAlbum'
import { canShareFiles, shareAllTogether, shareOneByOne } from '@/lib/shareFiles'
import { apiPostMessage, apiDeleteMessages, apiUpdateTripFields } from '@/lib/api'
import type { Message, Membre, Trip } from '@/lib/types'
import { formatNomComplet } from '@/lib/types'
import { SvgIcon } from '@/lib/svgIcons'

// Lightbox chargee uniquement quand on ouvre une photo (evite ~18KB gzip de
// react-zoom-pan-pinch dans le bundle initial de la grille)
const Lightbox = dynamic(() => import('./Lightbox'), { ssr: false })

const MAX_PHOTOS = 100
const WARN_THRESHOLD = 90
const LONG_PRESS_MS = 500

// Transformation Supabase : thumbnail pour la grille (perf)
const thumbUrl = (url: string, w = 600) => {
  // Skip pour blob: URLs (photos optimistes pending upload) — leur query-string casserait le blob
  if (url.startsWith('blob:')) return url
  return url.includes('?') ? url : `${url}?width=${w}&quality=75`
}

type PendingPhoto = { file: File; preview: string }

// Type local étendu : Message + flag optimistic pending
type AlbumPhoto = Message & { _pending?: boolean }

// Tuile photo memoizee : ne re-render que si ses propres props changent.
// Critique a 100 photos : evite 100 re-renders quand on toggle selection / ouvre lightbox.
type PhotoTileProps = {
  photo: AlbumPhoto
  idx: number
  isSelected: boolean
  isMine: boolean
  selectionMode: boolean
  onPointerDown: (id: string) => void
  onPointerUp: () => void
  onClick: (photo: AlbumPhoto, idx: number) => void
}
const PhotoTile = memo(function PhotoTile({
  photo, idx, isSelected, isMine, selectionMode,
  onPointerDown, onPointerUp, onClick,
}: PhotoTileProps) {
  const pending = photo._pending
  return (
    <div
      onPointerDown={() => { if (!pending) onPointerDown(photo.id) }}
      onPointerUp={onPointerUp}
      onPointerLeave={onPointerUp}
      onPointerCancel={onPointerUp}
      onClick={() => { if (!pending) onClick(photo, idx) }}
      style={{
        position: 'relative',
        aspectRatio: '1 / 1',
        background: '#e5e5e5',
        cursor: 'pointer',
        overflow: 'hidden',
        userSelect: 'none',
        WebkitUserSelect: 'none',
        WebkitTouchCallout: 'none',
      }}>
      <img
        src={thumbUrl(photo.image_url!, 400)}
        alt={photo.contenu || ''}
        loading="lazy"
        draggable={false}
        style={{
          width: '100%', height: '100%', objectFit: 'cover', display: 'block',
          opacity: selectionMode && !isSelected ? 0.5 : 1,
          transition: 'opacity .15s',
        }}
      />
      {selectionMode && (
        <div style={{
          position: 'absolute', top: 6, right: 6,
          width: 22, height: 22, borderRadius: '50%',
          background: isSelected ? 'var(--forest)' : 'rgba(255,255,255,.7)',
          border: isSelected ? '2px solid #fff' : '2px solid rgba(255,255,255,.9)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 13, fontWeight: 700,
          boxShadow: '0 1px 3px rgba(0,0,0,.3)',
        }}>
          {isSelected && '✓'}
        </div>
      )}
      {selectionMode && isMine && !isSelected && (
        <div style={{
          position: 'absolute', bottom: 4, left: 4,
          width: 6, height: 6, borderRadius: '50%',
          background: photo.membre_couleur || 'var(--forest)',
          boxShadow: '0 0 0 1.5px rgba(255,255,255,.9)',
        }} />
      )}
      {pending && (
        <div style={{
          position: 'absolute', inset: 0,
          background: 'rgba(0,0,0,.35)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          pointerEvents: 'none',
        }}>
          <div style={{
            width: 22, height: 22, borderRadius: '50%',
            border: '2.5px solid rgba(255,255,255,.35)',
            borderTopColor: '#fff',
            animation: 'crew-spin 0.8s linear infinite',
          }} />
        </div>
      )}
    </div>
  )
})

export default function Album({ tripId, trip, membre, onTripUpdate }: { tripId: string, trip: Trip, membre: Membre, onTripUpdate: (t: Partial<Trip>) => void }) {
  // can_post_photos: default true si undefined (retrocompat)
  const canPostPhotos = membre.is_createur || trip.can_post_photos !== false

  const [photos, setPhotos] = useState<AlbumPhoto[]>([])
  const [loading, setLoading] = useState(true)

  // Upload state
  const [pending, setPending] = useState<PendingPhoto[]>([])
  const [pendingCaption, setPendingCaption] = useState('')
  const [pendingIdx, setPendingIdx] = useState(0)
  const [sending, setSending] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  // Lightbox
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)

  // Mode selection
  const [selectionMode, setSelectionMode] = useState(false)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const longPressTimer = useRef<NodeJS.Timeout | null>(null)
  const longPressTriggered = useRef(false)

  // Tracking des blob URLs vivants pour cleanup fiable au unmount
  // (previews upload + photos optimistic pending). Necessaire car le
  // useEffect cleanup capture l'etat au mount (vide) s'il n'a pas de deps.
  const liveBlobUrls = useRef<Set<string>>(new Set())
  const trackBlob = useCallback((url: string) => { liveBlobUrls.current.add(url) }, [])
  const revokeBlob = useCallback((url: string) => {
    if (liveBlobUrls.current.has(url)) {
      try { URL.revokeObjectURL(url) } catch {}
      liveBlobUrls.current.delete(url)
    }
  }, [])

  // Partage (creator only) — sheet "Partager l'album"
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [generatingShare, setGeneratingShare] = useState(false)

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
      onTripUpdate({ share_token: oldToken })
      alert('Erreur lors de la génération du lien : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGeneratingShare(false)
    }
  }

  async function regenerateShareToken() {
    if (!confirm("Régénérer le lien ? L'ancien lien ne fonctionnera plus et toute personne qui l'a reçu perdra l'accès.")) return
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
      onTripUpdate({ share_token: oldToken })
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGeneratingShare(false)
    }
  }

  function copyShareLink() {
    if (!trip.share_token) return
    navigator.clipboard.writeText(`${window.location.origin}/album/${trip.share_token}`)
    setShareCopied(true); setTimeout(() => setShareCopied(false), 3000)
  }

  // Download tout en ZIP
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null)

  // Partage multi-photos (mode selection)
  const [sharing, setSharing] = useState(false)
  const [shareChoiceOpen, setShareChoiceOpen] = useState(false)

  async function downloadAll() {
    if (photos.length === 0) return
    if (downloadProgress) return // deja en cours
    const estMB = Math.round(photos.length * 0.4) // estimation ~400KB/photo compressee
    const confirmMsg = `Télécharger ${photos.length} photo${photos.length > 1 ? 's' : ''} en ZIP ?\n\nTaille estimée : ~${estMB} MB\n\nLe téléchargement peut prendre quelques minutes selon ta connexion.`
    if (!confirm(confirmMsg)) return

    setDownloadProgress({ done: 0, total: photos.length })
    try {
      await downloadAlbumAsZip(
        photos,
        trip.nom,
        (done, total) => setDownloadProgress({ done, total })
      )
    } catch (e: unknown) {
      alert('Erreur lors du téléchargement : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloadProgress(null)
    }
  }

  // Chargement initial : toutes les photos (max 100, order desc pour avoir les + recentes en haut)
  useEffect(() => {
    supabase
      .from('messages')
      .select('*')
      .eq('trip_id', tripId)
      .order('created_at', { ascending: false })
      .limit(MAX_PHOTOS)
      .then(({ data }) => {
        if (data) setPhotos(data as Message[])
        setLoading(false)
      })

    // Realtime : nouvelles photos + suppressions
    const ch = supabase
      .channel(`album-${tripId}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` }, p => {
        const newPhoto = p.new as Message
        setPhotos(prev => {
          // Eviter doublons (optimistic insert local)
          if (prev.some(x => x.id === newPhoto.id)) return prev
          return [newPhoto, ...prev]
        })
      })
      .on('postgres_changes', { event: 'DELETE', schema: 'public', table: 'messages', filter: `trip_id=eq.${tripId}` }, p => {
        const deletedId = (p.old as { id?: string })?.id
        if (!deletedId) return
        setPhotos(prev => prev.filter(x => x.id !== deletedId))
      })
      .subscribe()

    return () => { supabase.removeChannel(ch) }
  }, [tripId])

  // Cleanup fiable des blob URLs au unmount (uploads en cours, optimistic previews)
  useEffect(() => {
    const set = liveBlobUrls.current
    return () => {
      set.forEach(url => { try { URL.revokeObjectURL(url) } catch {} })
      set.clear()
    }
  }, [])

  // --- Upload multi-photos ---
  function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || [])
    e.target.value = ''
    if (files.length === 0) return

    const currentCount = photos.length
    if (currentCount >= MAX_PHOTOS) {
      alert(`Album plein (${MAX_PHOTOS} photos max). Supprime des photos pour en ajouter.`)
      return
    }

    // Tronquer la selection pour ne pas depasser MAX_PHOTOS
    const available = MAX_PHOTOS - currentCount
    const toAdd = files.slice(0, available)
    if (files.length > available) {
      alert(`Tu as sélectionné ${files.length} photos mais il ne reste que ${available} place(s). Les ${files.length - available} dernière(s) seront ignorée(s).`)
    }

    // Warning a l'approche de la limite
    if (currentCount + toAdd.length >= WARN_THRESHOLD && currentCount < WARN_THRESHOLD) {
      setTimeout(() => {
        alert(`Album presque plein (${currentCount + toAdd.length}/${MAX_PHOTOS} photos).`)
      }, 100)
    }

    const previews = toAdd.map(file => {
      const preview = URL.createObjectURL(file)
      trackBlob(preview)
      return { file, preview }
    })
    setPending(previews)
    setPendingIdx(0)
    setPendingCaption('')
  }

  function cancelPending() {
    pending.forEach(p => revokeBlob(p.preview))
    setPending([])
    setPendingIdx(0)
    setPendingCaption('')
  }

  async function uploadAllPending() {
    if (pending.length === 0 || sending) return
    setSending(true)

    // Snapshot des pending files + captions avant reset
    const pendingSnapshot = pending.map((p, i) => ({
      file: p.file,
      caption: i === pendingIdx ? pendingCaption.trim() : '',
      preview: p.preview, // URL.createObjectURL déjà créée dans pending
    }))

    try {
      // Compression parallèle
      const compressed = await Promise.all(pendingSnapshot.map(p => compressImage(p.file)))

      // Créer les photos optimistes immédiatement + fermer la sheet
      const tempPhotos: AlbumPhoto[] = compressed.map((file, i) => {
        const blobUrl = URL.createObjectURL(file)
        trackBlob(blobUrl)
        return {
          id: `temp-upload-${Date.now()}-${i}`,
          trip_id: tripId,
          contenu: pendingSnapshot[i].caption || undefined,
          image_url: blobUrl,
          membre_id: membre.id,
          membre_prenom: formatNomComplet(membre.prenom, membre.nom),
          membre_couleur: membre.couleur,
          created_at: new Date().toISOString(),
          _pending: true,
        }
      })

      // Optimistic : ajouter en tête + fermer la sheet d'envoi
      setPhotos(prev => [...tempPhotos.slice().reverse(), ...prev])
      cancelPending()

      // Upload + insert séquentiel en arrière-plan (garde l'ordre + évite rate limit)
      const failedIndexes: number[] = []
      for (let i = 0; i < compressed.length; i++) {
        const file = compressed[i]
        const caption = pendingSnapshot[i].caption
        const tempId = tempPhotos[i].id
        const blobUrl = tempPhotos[i].image_url
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${tripId}/album/${Date.now()}-${i}-${membre.prenom.toLowerCase().replace(/\s/g, '')}.${ext}`

        try {
          const { error: upErr } = await supabase.storage.from('trip-photos').upload(path, file, {
            contentType: file.type || 'image/jpeg',
          })
          if (upErr) throw upErr

          const image_url = supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl

          // Phase 2 : RPC post_message avec fallback direct
          let data: unknown
          const rpc = await apiPostMessage(trip.code, tripId, {
            type: 'photo',
            contenu: caption || null,
            image_url,
            membre_id: membre.id,
            membre_prenom: formatNomComplet(membre.prenom, membre.nom),
            membre_couleur: membre.couleur,
          })
          if (rpc.success && rpc.message) {
            data = rpc.message
          } else {
            const { data: d, error } = await supabase.from('messages').insert({
              trip_id: tripId,
              contenu: caption || null,
              image_url,
              membre_id: membre.id,
              membre_prenom: formatNomComplet(membre.prenom, membre.nom),
              membre_couleur: membre.couleur,
            }).select().single()
            if (error) throw error
            data = d
          }

          // Remplacer la temp par la vraie photo (avec vraie URL)
          setPhotos(prev => prev.map(p => p.id === tempId ? (data as Message) : p))
          // Libérer la blob URL
          revokeBlob(blobUrl)
        } catch (e) {
          console.error('Upload failed for photo', i, e)
          failedIndexes.push(i)
          // Retirer la temp qui a échoué
          setPhotos(prev => prev.filter(p => p.id !== tempId))
          revokeBlob(blobUrl)
        }
      }

      if (failedIndexes.length > 0) {
        alert(`Erreur lors de l'envoi de ${failedIndexes.length} photo${failedIndexes.length > 1 ? 's' : ''} sur ${compressed.length}.`)
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e)
      alert("Erreur lors de l'envoi : " + msg)
    } finally {
      setSending(false)
    }
  }

  // --- Selection / suppression batch ---
  function toggleSelection(id: string) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function exitSelectionMode() {
    setSelectionMode(false)
    setSelectedIds(new Set())
  }

  function enterSelectionMode(initialId?: string) {
    setSelectionMode(true)
    if (initialId) setSelectedIds(new Set([initialId]))
  }

  async function onShareSelected(mode: 'together' | 'one-by-one') {
    setShareChoiceOpen(false)
    const selected = photos.filter(p => selectedIds.has(p.id) && !p._pending)
    if (selected.length === 0) return
    setSharing(true)
    try {
      const ok = mode === 'together'
        ? await shareAllTogether(selected, trip.nom)
        : await shareOneByOne(selected, trip.nom)
      if (!ok) {
        alert("Partage impossible. Essaie l'autre mode, ou utilise le téléchargement ZIP.")
      } else {
        exitSelectionMode()
      }
    } finally {
      setSharing(false)
    }
  }

  function onShareClick() {
    const count = photos.filter(p => selectedIds.has(p.id) && !p._pending).length
    if (count === 0 || sharing) return
    if (!canShareFiles()) {
      alert("Ton navigateur ne supporte pas le partage direct. Utilise le téléchargement ZIP.")
      return
    }
    if (count === 1) {
      // Une seule photo : pas besoin de demander
      onShareSelected('together')
    } else {
      setShareChoiceOpen(true)
    }
  }

  async function deleteSelected() {
    // Permission: createur OU participant avec can_post_photos = true peut
    // supprimer N'IMPORTE QUELLE photo (pas seulement les siennes).
    // Coherent avec le modele "trip collaboratif" : si tu peux gerer l'album,
    // tu peux aussi supprimer. Le toggle 'Peuvent gerer l'album' dans
    // Permissions (onglet Membres) controle cette capacite pour les participants.
    const canDeleteAny = membre.is_createur || trip.can_post_photos !== false
    if (!canDeleteAny) {
      alert("Tu n'as pas la permission de supprimer des photos. Contacte l'administrateur du trip.")
      return
    }

    const toDelete = photos.filter(p => selectedIds.has(p.id) && !p._pending)
    if (toDelete.length === 0) return
    if (!confirm(`Supprimer ${toDelete.length} photo${toDelete.length > 1 ? 's' : ''} ?`)) return

    const ids = toDelete.map(m => m.id)
    // Snapshot pour rollback
    const snapshot = photos

    // Optimistic
    setPhotos(prev => prev.filter(p => !ids.includes(p.id)))
    exitSelectionMode()

    try {
      // Supprimer les fichiers storage (best-effort)
      const paths: string[] = []
      for (const m of toDelete) {
        const match = m.image_url?.match(/\/trip-photos\/(.+?)(\?|$)/)
        if (match) paths.push(decodeURIComponent(match[1]))
      }
      if (paths.length > 0) {
        await supabase.storage.from('trip-photos').remove(paths).catch(err => {
          console.warn('Storage remove failed (ignored):', err)
        })
      }

      // Supprimer les lignes DB
      // Phase 2 : RPC delete_messages avec fallback direct
      const rpc = await apiDeleteMessages(trip.code, tripId, ids)
      if (!rpc.success) {
        const { error } = await supabase.from('messages').delete().in('id', ids)
        if (error) throw error
      }
    } catch (e: unknown) {
      // Rollback
      setPhotos(snapshot)
      const msg = e instanceof Error ? e.message : String(e)
      alert('Erreur lors de la suppression : ' + msg)
    }
  }

  // --- Handlers tap/long-press sur une photo ---
  const onPhotoPointerDown = useCallback((id: string) => {
    longPressTriggered.current = false
    longPressTimer.current = setTimeout(() => {
      longPressTriggered.current = true
      enterSelectionMode(id)
      // Vibration legere si dispo (mobile)
      if ('vibrate' in navigator) navigator.vibrate(20)
    }, LONG_PRESS_MS)
  }, [])

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current)
      longPressTimer.current = null
    }
  }, [])

  const onPhotoClick = useCallback((photo: Message, idx: number) => {
    // Si le long-press a declenche, on ne fait rien (il a deja ouvert le mode selection)
    if (longPressTriggered.current) {
      longPressTriggered.current = false
      return
    }
    if (selectionMode) {
      toggleSelection(photo.id)
    } else {
      setLightboxIdx(idx)
    }
  }, [selectionMode])

  // --- Navigation lightbox ---
  const closeLightbox = () => { setLightboxIdx(null); setIsZoomed(false) }
  const lightboxPrev = () => { setLightboxIdx(i => i === null ? null : Math.max(0, i - 1)); setIsZoomed(false) }
  const lightboxNext = () => { setLightboxIdx(i => i === null ? null : Math.min(photos.length - 1, i + 1)); setIsZoomed(false) }

  const selectedCount = selectedIds.size
  // Qui peut supprimer: createur OU participant avec can_post_photos=true
  // (coherent avec le toggle "Peuvent gerer l'album" dans Permissions)
  const canDeleteAny = membre.is_createur || trip.can_post_photos !== false

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', position: 'relative', background: 'var(--sand)' }}>

      {/* Barre du mode selection (apparait au-dessus de la grille) */}
      {selectionMode && (
        <div style={{
          position: 'sticky', top: 0, zIndex: 30,
          background: 'rgba(255,255,255,.97)', backdropFilter: 'blur(10px)',
          borderBottom: '1px solid var(--border)',
          padding: '10px 14px',
          display: 'flex', alignItems: 'center', gap: 10,
        }}>
          <button onClick={exitSelectionMode}
            style={{ background: 'none', border: 'none', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, cursor: 'pointer', padding: '4px 8px' }}>
            Annuler
          </button>
          <div style={{ flex: 1, fontSize: 13, color: 'var(--text-2)' }}>
            {selectedCount === 0 ? 'Sélectionnez des photos' : `${selectedCount} sélectionnée${selectedCount > 1 ? 's' : ''}`}
          </div>
          {selectedCount > 0 && canShareFiles() && (
            <button onClick={onShareClick} disabled={sharing}
              aria-label={`Partager ${selectedCount} photo${selectedCount > 1 ? 's' : ''}`}
              style={{ background: 'var(--forest)', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 12px', fontSize: 13, fontWeight: 600, cursor: sharing ? 'default' : 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              {sharing ? '…' : `Partager ${selectedCount}`}
            </button>
          )}
          {selectedCount > 0 && canDeleteAny && (
            <button onClick={deleteSelected}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Supprimer {selectedCount}
            </button>
          )}
        </div>
      )}

      {/* Toolbar haut : Partager (gauche, createur) + Telecharger (centre) + Selectionner (droite) */}
      {!selectionMode && canPostPhotos && (
        <div style={{ padding: '8px 14px 0', display: 'grid', gridTemplateColumns: '1fr auto 1fr', alignItems: 'center', gap: 8 }}>
          <div style={{ justifySelf: 'start' }}>
            <button onClick={() => setShareSheetOpen(true)} disabled={photos.length === 0}
              aria-label="Partager l'album"
              style={{ background: 'transparent', border: 'none',
                color: photos.length === 0 ? 'var(--text-3)' : 'var(--text-2)',
                fontSize: 13, fontWeight: 600,
                cursor: photos.length === 0 ? 'default' : 'pointer',
                opacity: photos.length === 0 ? 0.5 : 1,
                padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Partager
            </button>
          </div>
          <div style={{ justifySelf: 'center' }}>
            <button onClick={downloadAll} disabled={!!downloadProgress || photos.length === 0}
              aria-label="Télécharger tout"
              style={{ background: 'transparent', border: 'none',
                color: (downloadProgress || photos.length === 0) ? 'var(--text-3)' : 'var(--text-2)',
                fontSize: 13, fontWeight: 600,
                cursor: (downloadProgress || photos.length === 0) ? 'default' : 'pointer',
                opacity: photos.length === 0 ? 0.5 : 1,
                padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {downloadProgress
                ? `${downloadProgress.done}/${downloadProgress.total}…`
                : 'Télécharger'}
            </button>
          </div>
          <div style={{ justifySelf: 'end' }}>
            <button onClick={() => enterSelectionMode()} disabled={photos.length === 0}
              style={{ background: 'transparent', border: 'none',
                color: photos.length === 0 ? 'var(--text-3)' : 'var(--text-2)',
                fontSize: 13, fontWeight: 600,
                cursor: photos.length === 0 ? 'default' : 'pointer',
                opacity: photos.length === 0 ? 0.5 : 1,
                padding: '6px 10px' }}>
              Sélectionner
            </button>
          </div>
        </div>
      )}

      {/* Grille 3 colonnes pellicule iPhone */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px 100px' }}>
        {loading && (
          <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)', fontSize: 13 }}>
            Chargement…
          </div>
        )}

        {!loading && photos.length === 0 && (
          <div className="empty" style={{ padding: '60px 20px', textAlign: 'center' }}>
            <span style={{display:'inline-flex',width:64,height:64,borderRadius:16,background:'#E11D48',color:'#fff',alignItems:'center',justifyContent:'center',marginBottom:12}}>
              <SvgIcon name="camera" size={32} />
            </span>
            <div style={{ marginTop: 12, fontWeight: 600, color: 'var(--text-2)' }}>Album vide</div>
            {canPostPhotos && (
              <div style={{ marginTop: 6, fontSize: 13, color: 'var(--text-3)' }}>
                Appuie sur + pour ajouter les premières photos
              </div>
            )}
          </div>
        )}

        {!loading && photos.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
          }}>
            {photos.map((p, idx) => (
              <PhotoTile
                key={p.id}
                photo={p}
                idx={idx}
                isSelected={selectedIds.has(p.id)}
                isMine={p.membre_id === membre.id}
                selectionMode={selectionMode}
                onPointerDown={onPhotoPointerDown}
                onPointerUp={clearLongPress}
                onClick={onPhotoClick}
              />
            ))}
          </div>
        )}
      </div>

      {/* Bouton flottant + (upload) */}
      {canPostPhotos && !selectionMode && photos.length < MAX_PHOTOS && (
        <>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif,image/gif"
            multiple
            style={{ display: 'none' }}
            onChange={onPickFiles}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            aria-label="Ajouter des photos"
            style={{
              position: 'fixed',
              right: 18,
              bottom: `calc(env(safe-area-inset-bottom,0px) + 80px)`,
              width: 56, height: 56, borderRadius: '50%',
              background: 'var(--forest)',
              color: '#fff',
              border: 'none',
              boxShadow: '0 4px 12px rgba(0,0,0,.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer',
              zIndex: 35,
            }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="12" y1="5" x2="12" y2="19"/>
              <line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </>
      )}

      {/* Modal preview upload (apparait quand pending.length > 0) */}
      {pending.length > 0 && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)',
          zIndex: 100, display: 'flex', flexDirection: 'column',
          padding: 'env(safe-area-inset-top,0) 0 env(safe-area-inset-bottom,0)',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '12px 16px', color: '#fff',
          }}>
            <button onClick={cancelPending} disabled={sending}
              style={{ background: 'none', border: 'none', color: '#fff', fontSize: 15, cursor: sending ? 'default' : 'pointer', padding: 6 }}>
              Annuler
            </button>
            <div style={{ fontSize: 14, fontWeight: 600 }}>
              {pending.length === 1 ? '1 photo' : `${pending.length} photos`}
            </div>
            <button onClick={uploadAllPending} disabled={sending}
              style={{
                background: sending ? 'rgba(255,255,255,.2)' : 'var(--forest)',
                border: 'none', color: '#fff',
                borderRadius: 8, padding: '7px 16px',
                fontSize: 14, fontWeight: 600,
                cursor: sending ? 'default' : 'pointer',
              }}>
              {sending ? 'Ajout…' : 'Ajouter'}
            </button>
          </div>

          {/* Preview de la photo active */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 12, minHeight: 0 }}>
            <img src={pending[pendingIdx]?.preview} alt=""
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 8 }} />
          </div>

          {/* Strip de thumbnails si plusieurs photos */}
          {pending.length > 1 && (
            <div style={{
              display: 'flex', gap: 6, padding: '8px 12px',
              overflowX: 'auto', flexShrink: 0,
              WebkitOverflowScrolling: 'touch',
            }}>
              {pending.map((p, i) => (
                <button key={i} onClick={() => setPendingIdx(i)}
                  style={{
                    width: 56, height: 56, borderRadius: 6, overflow: 'hidden',
                    border: i === pendingIdx ? '2px solid #fff' : '2px solid transparent',
                    padding: 0, background: 'transparent', cursor: 'pointer', flexShrink: 0,
                  }}>
                  <img src={p.preview} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                </button>
              ))}
            </div>
          )}

          {/* Champ legende (s'applique a la photo active) */}
          <div style={{ padding: '10px 14px 16px', flexShrink: 0, background: 'rgba(0,0,0,.35)' }}>
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              marginBottom: 6,
            }}>
              <label style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,.95)',
              }}>
                <span style={{ fontSize: 14 }}>✏️</span>
                {pending.length > 1 ? `Légende — photo ${pendingIdx + 1}` : 'Légende'}
                <span style={{ fontSize: 11, fontWeight: 400, color: 'rgba(255,255,255,.55)' }}>
                  (optionnel)
                </span>
              </label>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,.55)', flexShrink: 0 }}>
                {pendingCaption.length}/200
              </span>
            </div>
            <textarea
              placeholder="Ajoute une légende pour cette photo…"
              value={pendingCaption}
              onChange={e => setPendingCaption(e.target.value)}
              disabled={sending}
              maxLength={200}
              rows={2}
              style={{
                width: '100%', padding: '12px 14px',
                borderRadius: 12, border: '1.5px solid rgba(255,255,255,.25)',
                background: 'rgba(255,255,255,.12)', color: '#fff',
                fontSize: 15, fontFamily: 'inherit', lineHeight: 1.4,
                outline: 'none', resize: 'none',
                minHeight: 56, maxHeight: 120,
                boxSizing: 'border-box',
              }}
              onFocus={e => { e.target.style.borderColor = 'rgba(255,255,255,.55)' }}
              onBlur={e => { e.target.style.borderColor = 'rgba(255,255,255,.25)' }}
            />
          </div>
        </div>
      )}

      {/* Lightbox plein ecran avec swipe entre photos (chargee dynamiquement) */}
      {lightboxIdx !== null && (
        <Lightbox
          photos={photos}
          lightboxIdx={lightboxIdx}
          isZoomed={isZoomed}
          onZoomChange={setIsZoomed}
          onClose={closeLightbox}
          onPrev={lightboxPrev}
          onNext={lightboxNext}
        />
      )}

      {/* Sheet choix mode de partage (apparait si 2+ photos selectionnees) */}
      {shareChoiceOpen && (
        <>
          <div className="overlay open" onClick={() => setShareChoiceOpen(false)} />
          <div className="sheet open" onClick={e => e.stopPropagation()} style={{ zIndex: 71 }}>
            <div className="sheet-handle" />
            <div className="sheet-title">
              Partager {photos.filter(p => selectedIds.has(p.id) && !p._pending).length} photos
            </div>
            <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
              Sur iOS, certaines apps (comme iMessage) acceptent mieux les photos une par une.
            </div>
            <button onClick={() => onShareSelected('together')} disabled={sharing}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                background: 'var(--forest)', color: '#fff',
                fontWeight: 600, fontSize: 15, cursor: sharing ? 'default' : 'pointer', marginBottom: 8 }}>
              Toutes en même temps
            </button>
            <button onClick={() => onShareSelected('one-by-one')} disabled={sharing}
              style={{ width: '100%', padding: '13px', borderRadius: 10, border: '1px solid var(--border)',
                background: '#fff', color: 'var(--text-1)',
                fontWeight: 600, fontSize: 15, cursor: sharing ? 'default' : 'pointer', marginBottom: 10 }}>
              Une par une
            </button>
            <button onClick={() => setShareChoiceOpen(false)}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </>
      )}

      {/* Sheet de partage — createur only */}
      {shareSheetOpen && (
        <>
          <div className="overlay open" onClick={() => setShareSheetOpen(false)} />
          <div className="sheet open" onClick={e => e.stopPropagation()} style={{ zIndex: 71 }}>
            <div className="sheet-handle" />
            <div className="sheet-title">Partager l&apos;album</div>
            {!trip.share_token && membre.is_createur && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
                  Génère un lien public en lecture seule. Toute personne avec ce lien pourra voir les photos sans avoir à rejoindre le trip.
                </div>
                <button onClick={generateShareToken} disabled={generatingShare}
                  style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                    background: generatingShare ? 'var(--border)' : 'var(--forest)',
                    color: '#fff', fontWeight: 600, fontSize: 15, cursor: generatingShare ? 'default' : 'pointer',
                    display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6 }}>
                  {generatingShare ? 'Génération…' : <><SvgIcon name="link" size={16} />Générer un lien de partage</>}
                </button>
              </>
            )}
            {!trip.share_token && !membre.is_createur && (
              <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
                Le créateur du trip n&apos;a pas encore activé le partage public de l&apos;album.
              </div>
            )}
            {trip.share_token && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 10, lineHeight: 1.5 }}>
                  Toute personne avec ce lien peut consulter l&apos;album en lecture seule.
                </div>
                <div style={{ background: 'var(--sand)', borderRadius: 10, padding: '10px 12px', fontSize: 12,
                  color: 'var(--text-2)', fontFamily: 'monospace', marginBottom: 12, wordBreak: 'break-all',
                  border: '1px solid var(--border)' }}>
                  {typeof window !== 'undefined' ? `${window.location.origin}/album/${trip.share_token}` : `/album/${trip.share_token}`}
                </div>
                <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                  <button onClick={copyShareLink}
                    style={{ flex: 1, padding: '12px', borderRadius: 10, border: 'none',
                      background: shareCopied ? 'var(--green)' : 'var(--forest)',
                      color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background .2s',
                      display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6 }}>
                    {shareCopied ? <><SvgIcon name="check" size={14} />Copié !</> : <><SvgIcon name="clipboard" size={14} />Copier le lien</>}
                  </button>
                  {membre.is_createur && (
                    <button onClick={regenerateShareToken} disabled={generatingShare}
                      style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
                        background: '#fff', color: 'var(--text-2)', fontWeight: 600, fontSize: 14,
                        cursor: generatingShare ? 'default' : 'pointer',
                        display:'inline-flex',alignItems:'center',justifyContent:'center',gap:6 }}>
                      {generatingShare ? '…' : <><SvgIcon name="refresh" size={14} />Régénérer</>}
                    </button>
                  )}
                </div>
              </>
            )}
            <button onClick={() => setShareSheetOpen(false)}
              style={{ width: '100%', padding: '12px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'transparent', color: 'var(--text-2)', fontWeight: 600, fontSize: 14, cursor: 'pointer' }}>
              Fermer
            </button>
          </div>
        </>
      )}

    </div>
  )
}
