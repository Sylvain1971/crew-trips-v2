'use client'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { downloadAlbumAsZip } from '@/lib/downloadAlbum'
import { toSignedUrlsBatch } from '@/lib/storage'
import type { Message, Trip } from '@/lib/types'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import { SvgIcon } from '@/lib/svgIcons'

// Thumbnail pour la grille (perf)
const thumbUrl = (url: string, w = 400) =>
  url.includes('?') ? url : `${url}?width=${w}&quality=75`

type ViewState = 'loading' | 'ready' | 'not_found'

export default function AlbumPublicPage({ params }: { params: Promise<{ token: string }> }) {
  const [state, setState] = useState<ViewState>('loading')
  const [trip, setTrip] = useState<Trip | null>(null)
  const [photos, setPhotos] = useState<Message[]>([])
  const [lightboxIdx, setLightboxIdx] = useState<number | null>(null)
  const [isZoomed, setIsZoomed] = useState(false)
  const [downloading, setDownloading] = useState(false)
  const [downloadProgress, setDownloadProgress] = useState<{ done: number; total: number } | null>(null)

  async function downloadAll() {
    if (photos.length === 0 || downloadProgress) return
    const estMB = Math.round(photos.length * 0.4)
    const confirmMsg = `Télécharger ${photos.length} photo${photos.length > 1 ? 's' : ''} en ZIP ?\n\nTaille estimée : ~${estMB} MB\n\nLe téléchargement peut prendre quelques minutes selon ta connexion.`
    if (!confirm(confirmMsg)) return
    setDownloadProgress({ done: 0, total: photos.length })
    try {
      await downloadAlbumAsZip(
        photos,
        trip?.nom || 'album',
        (done, total) => setDownloadProgress({ done, total })
      )
    } catch (e: unknown) {
      alert('Erreur : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloadProgress(null)
    }
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const { token } = await params
      if (cancelled) return

      const { data: t } = await supabase
        .from('trips')
        .select('*')
        .eq('share_token', token)
        .maybeSingle()

      if (cancelled) return
      if (!t) { setState('not_found'); return }

      const { data: p } = await supabase
        .from('messages')
        .select('*')
        .eq('trip_id', t.id)
        .order('created_at', { ascending: false })
        .limit(100)

      if (cancelled) return
      setTrip(t as Trip)
      // Phase 2 : bucket privé. Signer toutes les URL photos pour affichage.
      const photosList = (p || []) as Message[]
      const urls = photosList.map(ph => ph.image_url).filter((u): u is string => !!u)
      if (urls.length > 0) {
        const signed = await toSignedUrlsBatch(urls)
        let i = 0
        for (const ph of photosList) {
          if (ph.image_url) {
            ph.image_url = signed[i] || ph.image_url
            i++
          }
        }
      }
      setPhotos(photosList)
      setState('ready')
    })()
    return () => { cancelled = true }
  }, [params])

  const currentPhoto = lightboxIdx !== null ? photos[lightboxIdx] : null

  const closeLightbox = () => { setLightboxIdx(null); setIsZoomed(false) }
  const prev = () => { setLightboxIdx(i => i === null ? null : Math.max(0, i - 1)); setIsZoomed(false) }
  const next = () => { setLightboxIdx(i => i === null ? null : Math.min(photos.length - 1, i + 1)); setIsZoomed(false) }

  async function downloadCurrent() {
    if (!currentPhoto || downloading) return
    setDownloading(true)
    try {
      const url = currentPhoto.image_url
      // Extension depuis URL (avant ?query), fallback jpg
      const pathPart = url.split('?')[0]
      const ext = (pathPart.split('.').pop() || 'jpg').toLowerCase().slice(0, 5)
      const filename = `album-${(trip?.code || 'photo').toLowerCase()}-${currentPhoto.id.slice(0, 8)}.${ext}`

      const res = await fetch(url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const objectUrl = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = objectUrl
      a.download = filename
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(objectUrl)
    } catch (e: unknown) {
      alert('T\u00e9l\u00e9chargement impossible : ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  // --- Rendu : loading ---
  if (state === 'loading') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: 'var(--text-3)', fontSize: 14 }}>Chargement…</div>
      </div>
    )
  }

  // --- Rendu : not_found ---
  if (state === 'not_found') {
    return (
      <div style={{ minHeight: '100dvh', background: 'var(--sand)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ textAlign: 'center', maxWidth: 360 }}>
          <div style={{ display:'inline-flex', width:80, height:80, borderRadius:'50%', background:'rgba(107,114,128,.1)', color:'#6B7280', alignItems:'center', justifyContent:'center', marginBottom: 16 }}><SvgIcon name="lock" size={40} /></div>
          <div style={{ fontWeight: 700, fontSize: 18, marginBottom: 8, color: 'var(--text)' }}>
            Lien expiré ou inexistant
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-2)', lineHeight: 1.5 }}>
            Ce lien de partage n’est plus valide. Demande à la personne qui te l’a envoyé d’en générer un nouveau.
          </div>
        </div>
      </div>
    )
  }

  // --- Rendu : ready ---
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--sand)', display: 'flex', flexDirection: 'column' }}>

      {/* Header minimal */}
      <div style={{
        position: 'sticky', top: 0, zIndex: 10,
        background: 'var(--forest)', color: '#fff',
        padding: 'calc(14px + env(safe-area-inset-top,0px)) 16px 12px',
      }}>
        <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '.08em',
          color: 'rgba(255,255,255,.6)', textTransform: 'uppercase', marginBottom: 2 }}>
          Album partagé
        </div>
        <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, justifyContent: 'space-between' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-.01em',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {trip?.nom}
            </div>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,.55)', marginTop: 3 }}>
              {photos.length} photo{photos.length > 1 ? 's' : ''} · lecture seule
            </div>
          </div>
          {photos.length > 0 && (
            <button onClick={downloadAll} disabled={!!downloadProgress}
              aria-label="Télécharger tout"
              style={{ height: 34, padding: '0 12px', borderRadius: 17,
                border: '1px solid rgba(255,255,255,.25)',
                background: downloadProgress ? 'rgba(255,255,255,.1)' : 'rgba(255,255,255,.15)',
                color: '#fff', fontSize: 12, fontWeight: 600,
                cursor: downloadProgress ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                whiteSpace: 'nowrap' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
              </svg>
              {downloadProgress ? `${downloadProgress.done}/${downloadProgress.total}` : 'Tout'}
            </button>
          )}
        </div>
      </div>

      {/* Grille 3 colonnes */}
      <div style={{ flex: 1, padding: '8px 6px 40px' }}>
        {photos.length === 0 && (
          <div style={{ padding: '60px 20px', textAlign: 'center' }}>
            <div style={{ display:'inline-flex', color:'var(--text-3)' }}><SvgIcon name="camera" size={42} /></div>
            <div style={{ marginTop: 12, fontWeight: 600, color: 'var(--text-2)' }}>Aucune photo dans cet album</div>
          </div>
        )}
        {photos.length > 0 && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(3, 1fr)',
            gap: 2,
          }}>
            {photos.map((p, idx) => (
              <div key={p.id}
                onClick={() => setLightboxIdx(idx)}
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
                  src={thumbUrl(p.image_url, 400)}
                  alt={p.contenu || ''}
                  loading="lazy"
                  draggable={false}
                  style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {currentPhoto && (
        <div
          onClick={closeLightbox}
          style={{
            position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)',
            zIndex: 200, display: 'flex', flexDirection: 'column',
            paddingTop: 'env(safe-area-inset-top,0)',
            paddingBottom: 'env(safe-area-inset-bottom,0)',
          }}>

          {/* Header */}
          <div onClick={e => e.stopPropagation()}
            style={{ display: 'flex', alignItems: 'center', gap: 10,
              padding: '10px 16px', color: '#fff', flexShrink: 0 }}>
            <div style={{ width: 28, height: 28, borderRadius: '50%',
              background: currentPhoto.membre_couleur || '#888',
              color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 12, fontWeight: 700, flexShrink: 0 }}>
              {(currentPhoto.membre_prenom || '?')[0].toUpperCase()}
            </div>
            <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
              {currentPhoto.membre_prenom || 'Inconnu'}
            </div>
            <button onClick={downloadCurrent} disabled={downloading}
              aria-label="Télécharger"
              style={{ height: 36, padding: '0 14px', borderRadius: 18, border: 'none',
                background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 13, fontWeight: 600,
                cursor: downloading ? 'default' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6 }}>
              {downloading ? '…' : (<><span style={{ fontSize: 15 }}>↓</span> Telecharger</>)}
            </button>
            <button onClick={closeLightbox}
              aria-label="Fermer"
              style={{ width: 36, height: 36, borderRadius: '50%', border: 'none',
                background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>×</button>
          </div>

          {/* Photo zoom */}
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
            minHeight: 0, position: 'relative', overflow: 'hidden' }}>
            <TransformWrapper
              key={lightboxIdx}
              initialScale={1}
              minScale={1}
              maxScale={4}
              doubleClick={{ mode: 'toggle', step: 1.5 }}
              wheel={{ step: 0.15 }}
              pinch={{ step: 5 }}
              panning={{ velocityDisabled: true }}
              onTransform={(_ref: ReactZoomPanPinchRef, s: { scale: number; positionX: number; positionY: number }) => setIsZoomed(s.scale > 1.02)}
            >
              <TransformComponent
                wrapperStyle={{ width: '100%', height: '100%' }}
                contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
              >
                <img
                  src={currentPhoto.image_url}
                  alt={currentPhoto.contenu || ''}
                  onClick={e => e.stopPropagation()}
                  draggable={false}
                  style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 4,
                    userSelect: 'none', WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
                />
              </TransformComponent>
            </TransformWrapper>

            {!isZoomed && lightboxIdx !== null && lightboxIdx > 0 && (
              <button
                onClick={e => { e.stopPropagation(); prev() }}
                aria-label="Précédente"
                style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 22,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 5 }}>‹</button>
            )}
            {!isZoomed && lightboxIdx !== null && lightboxIdx < photos.length - 1 && (
              <button
                onClick={e => { e.stopPropagation(); next() }}
                aria-label="Suivante"
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                  width: 40, height: 40, borderRadius: '50%', border: 'none',
                  background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 22,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  zIndex: 5 }}>›</button>
            )}
          </div>

          {/* Légende */}
          {currentPhoto.contenu && (
            <div onClick={e => e.stopPropagation()}
              style={{ padding: '10px 16px 16px', color: '#fff',
                fontSize: 14, lineHeight: 1.5, flexShrink: 0,
                background: 'rgba(0,0,0,.3)' }}>
              {currentPhoto.contenu}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
