'use client'
import { useEffect, useState, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { compressImage } from '@/lib/imageCompression'
import type { Message, Membre, Trip } from '@/lib/types'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'

const MAX_PHOTOS = 100
const WARN_THRESHOLD = 90
const LONG_PRESS_MS = 500

// Transformation Supabase : thumbnail pour la grille (perf)
const thumbUrl = (url: string, w = 600) =>
  url.includes('?') ? url : `${url}?width=${w}&quality=75`

type PendingPhoto = { file: File; preview: string }

export default function Album({ tripId, trip, membre, onTripUpdate }: { tripId: string, trip: Trip, membre: Membre, onTripUpdate: (t: Partial<Trip>) => void }) {
  // can_post_photos: default true si undefined (retrocompat)
  const canPostPhotos = membre.is_createur || trip.can_post_photos !== false

  const [photos, setPhotos] = useState<Message[]>([])
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

  // Partage (creator only) — sheet "Partager l'album"
  const [shareSheetOpen, setShareSheetOpen] = useState(false)
  const [shareCopied, setShareCopied] = useState(false)
  const [generatingShare, setGeneratingShare] = useState(false)

  async function generateShareToken() {
    if (generatingShare) return
    setGeneratingShare(true)
    try {
      const token = crypto.randomUUID()
      const { error } = await supabase.from('trips').update({ share_token: token }).eq('id', trip.id)
      if (error) throw error
      onTripUpdate({ share_token: token })
    } catch (e: unknown) {
      alert('Erreur lors de la génération du lien : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setGeneratingShare(false)
    }
  }

  async function regenerateShareToken() {
    if (!confirm("Régénérer le lien ? L'ancien lien ne fonctionnera plus et toute personne qui l'a reçu perdra l'accès.")) return
    if (generatingShare) return
    setGeneratingShare(true)
    try {
      const token = crypto.randomUUID()
      const { error } = await supabase.from('trips').update({ share_token: token }).eq('id', trip.id)
      if (error) throw error
      onTripUpdate({ share_token: token })
    } catch (e: unknown) {
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

  // Cleanup previews
  useEffect(() => {
    return () => {
      pending.forEach(p => URL.revokeObjectURL(p.preview))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

    const previews = toAdd.map(file => ({
      file,
      preview: URL.createObjectURL(file),
    }))
    setPending(previews)
    setPendingIdx(0)
    setPendingCaption('')
  }

  function cancelPending() {
    pending.forEach(p => URL.revokeObjectURL(p.preview))
    setPending([])
    setPendingIdx(0)
    setPendingCaption('')
  }

  async function uploadAllPending() {
    if (pending.length === 0 || sending) return
    setSending(true)
    try {
      // Compression parallele
      const compressed = await Promise.all(pending.map(p => compressImage(p.file)))

      // Upload + insert sequentiel (evite rate limit Supabase et garde l'ordre)
      for (let i = 0; i < compressed.length; i++) {
        const file = compressed[i]
        const caption = i === pendingIdx ? pendingCaption.trim() : ''
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `${tripId}/album/${Date.now()}-${i}-${membre.prenom.toLowerCase().replace(/\s/g, '')}.${ext}`

        const { error: upErr } = await supabase.storage.from('trip-photos').upload(path, file, {
          contentType: file.type || 'image/jpeg',
        })
        if (upErr) throw upErr

        const image_url = supabase.storage.from('trip-photos').getPublicUrl(path).data.publicUrl

        const { error } = await supabase.from('messages').insert({
          trip_id: tripId,
          contenu: caption || null,
          image_url,
          membre_id: membre.id,
          membre_prenom: membre.prenom,
          membre_couleur: membre.couleur,
        })
        if (error) throw error
      }

      cancelPending()
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

  async function deleteSelected() {
    // Filtrer sur les photos de l'utilisateur courant seulement
    const mine = photos.filter(p => selectedIds.has(p.id) && p.membre_id === membre.id)
    if (mine.length === 0) {
      alert("Tu ne peux supprimer que tes propres photos.")
      return
    }
    if (!confirm(`Supprimer ${mine.length} photo${mine.length > 1 ? 's' : ''} ?`)) return

    const ids = mine.map(m => m.id)
    // Snapshot pour rollback
    const snapshot = photos

    // Optimistic
    setPhotos(prev => prev.filter(p => !ids.includes(p.id)))
    exitSelectionMode()

    try {
      // Supprimer les fichiers storage (best-effort)
      const paths: string[] = []
      for (const m of mine) {
        const match = m.image_url?.match(/\/trip-photos\/(.+?)(\?|$)/)
        if (match) paths.push(decodeURIComponent(match[1]))
      }
      if (paths.length > 0) {
        await supabase.storage.from('trip-photos').remove(paths).catch(err => {
          console.warn('Storage remove failed (ignored):', err)
        })
      }

      // Supprimer les lignes DB
      const { error } = await supabase.from('messages').delete().in('id', ids)
      if (error) throw error
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

  const currentLightboxPhoto = lightboxIdx !== null ? photos[lightboxIdx] : null
  const selectedCount = selectedIds.size
  const selectedMineCount = photos.filter(p => selectedIds.has(p.id) && p.membre_id === membre.id).length

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
          {selectedMineCount > 0 && (
            <button onClick={deleteSelected}
              style={{ background: '#DC2626', color: '#fff', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              Supprimer {selectedMineCount}
            </button>
          )}
        </div>
      )}

      {/* Toolbar haut : Partager (createur) + Selectionner (hors mode selection) */}
      {!selectionMode && (membre.is_createur || photos.length > 0) && (
        <div style={{ padding: '8px 14px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8 }}>
          {membre.is_createur ? (
            <button onClick={() => setShareSheetOpen(true)}
              aria-label="Partager l'album"
              style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 10px', display: 'flex', alignItems: 'center', gap: 6 }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
                <polyline points="16 6 12 2 8 6"/>
                <line x1="12" y1="2" x2="12" y2="15"/>
              </svg>
              Partager
            </button>
          ) : <span />}
          {photos.length > 0 && (
            <button onClick={() => enterSelectionMode()}
              style={{ background: 'transparent', border: 'none', color: 'var(--text-2)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '6px 10px' }}>
              Sélectionner
            </button>
          )}
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
            <span className="empty-icon" style={{ fontSize: 42 }}>📷</span>
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
            {photos.map((p, idx) => {
              const isSelected = selectedIds.has(p.id)
              const isMine = p.membre_id === membre.id
              return (
                <div key={p.id}
                  onPointerDown={() => onPhotoPointerDown(p.id)}
                  onPointerUp={clearLongPress}
                  onPointerLeave={clearLongPress}
                  onPointerCancel={clearLongPress}
                  onClick={() => onPhotoClick(p, idx)}
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
                    src={thumbUrl(p.image_url!, 400)}
                    alt={p.contenu || ''}
                    loading="lazy"
                    draggable={false}
                    style={{
                      width: '100%', height: '100%', objectFit: 'cover', display: 'block',
                      opacity: selectionMode && !isSelected ? 0.5 : 1,
                      transition: 'opacity .15s',
                    }}
                  />
                  {/* Checkmark mode selection */}
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
                  {/* Indicateur "mes photos" en mode selection (pour qu'on sache lesquelles sont supprimables) */}
                  {selectionMode && isMine && !isSelected && (
                    <div style={{
                      position: 'absolute', bottom: 4, left: 4,
                      width: 6, height: 6, borderRadius: '50%',
                      background: p.membre_couleur || 'var(--forest)',
                      boxShadow: '0 0 0 1.5px rgba(255,255,255,.9)',
                    }} />
                  )}
                </div>
              )
            })}
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
              {sending ? 'Envoi…' : 'Envoyer'}
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

      {/* Lightbox plein ecran avec swipe entre photos */}
      {currentLightboxPhoto && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)',
            zIndex: 200, display: 'flex', flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top,0)',
            paddingBottom: 'env(safe-area-inset-bottom,0)',
          }}>

          {/* Header avec nom du membre + close */}
          <div onClick={e => e.stopPropagation()}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', color: '#fff', flexShrink: 0,
            }}>
            <div style={{
              width: 28, height: 28, borderRadius: '50%',
              background: `${currentLightboxPhoto.membre_couleur || '#888'}`,
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0,
            }}>
              {(currentLightboxPhoto.membre_prenom || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
              {currentLightboxPhoto.membre_prenom || 'Inconnu'}
            </div>
            <button onClick={closeLightbox}
              aria-label="Fermer"
              style={{
                width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>×</button>
          </div>

          {/* Photo avec zoom (react-zoom-pan-pinch : pinch mobile, double-tap, pan) */}
          <div
            style={{
              flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
              minHeight: 0, position: 'relative', overflow: 'hidden',
            }}>
            <TransformWrapper
              key={lightboxIdx}
              initialScale={1}
              minScale={1}
              maxScale={4}
              doubleClick={{ mode: 'toggle', step: 1.5 }}
              wheel={{ step: 0.15 }}
              pinch={{ step: 5 }}
              panning={{ velocityDisabled: true }}
              onTransform={(_ref: ReactZoomPanPinchRef, state: { scale: number; positionX: number; positionY: number }) => setIsZoomed(state.scale > 1.02)}
            >
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <img
                  src={currentLightboxPhoto.image_url!}
                  alt={currentLightboxPhoto.contenu || ''}
                  onClick={e => e.stopPropagation()}
                  draggable={false}
                  style={{
                    maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4,
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                    WebkitTouchCallout: 'none',
                  }}
                />
              </TransformComponent>
            </TransformWrapper>

            {/* Fleche precedente — cachee quand zoome */}
            {!isZoomed && lightboxIdx !== null && lightboxIdx > 0 && (
              <button
                onClick={e => { e.stopPropagation(); lightboxPrev() }}
                aria-label="Précédente"
                style={{
                  position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 22,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 5,
                }}>‹</button>
            )}

            {/* Fleche suivante — cachee quand zoome */}
            {!isZoomed && lightboxIdx !== null && lightboxIdx < photos.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); lightboxNext() }}
                aria-label="Suivante"
                style={{
                  position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 22,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 5,
                }}>›</button>
            )}
          </div>

          {/* Legende (si presente) */}
          {currentLightboxPhoto.contenu && (
            <div onClick={e => e.stopPropagation()}
              style={{
                padding: '10px 16px 16px', color: '#fff',
                fontSize: 14, lineHeight: 1.5, flexShrink: 0,
                background: 'rgba(0,0,0,.3)',
              }}>
              {currentLightboxPhoto.contenu}
            </div>
          )}
        </div>
      )}

      {/* Sheet de partage — createur only */}
      {shareSheetOpen && (
        <>
          <div className="overlay open" onClick={() => setShareSheetOpen(false)} />
          <div className="sheet open" onClick={e => e.stopPropagation()} style={{ zIndex: 71 }}>
            <div className="sheet-handle" />
            <div className="sheet-title">Partager l&apos;album</div>
            {!trip.share_token && (
              <>
                <div style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16, lineHeight: 1.5 }}>
                  Génère un lien public en lecture seule. Toute personne avec ce lien pourra voir les photos sans avoir à rejoindre le trip.
                </div>
                <button onClick={generateShareToken} disabled={generatingShare}
                  style={{ width: '100%', padding: '13px', borderRadius: 10, border: 'none',
                    background: generatingShare ? 'var(--border)' : 'var(--forest)',
                    color: '#fff', fontWeight: 600, fontSize: 15, cursor: generatingShare ? 'default' : 'pointer' }}>
                  {generatingShare ? 'Génération…' : '🔗 Générer un lien de partage'}
                </button>
              </>
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
                      color: '#fff', fontWeight: 600, fontSize: 14, cursor: 'pointer', transition: 'background .2s' }}>
                    {shareCopied ? '✓ Copié !' : '📋 Copier le lien'}
                  </button>
                  <button onClick={regenerateShareToken} disabled={generatingShare}
                    style={{ padding: '12px 16px', borderRadius: 10, border: '1px solid var(--border)',
                      background: '#fff', color: 'var(--text-2)', fontWeight: 600, fontSize: 14,
                      cursor: generatingShare ? 'default' : 'pointer' }}>
                    {generatingShare ? '…' : '🔄 Régénérer'}
                  </button>
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
