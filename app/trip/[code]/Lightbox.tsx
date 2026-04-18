'use client'
import { useEffect, useRef } from 'react'
import { TransformWrapper, TransformComponent, type ReactZoomPanPinchRef } from 'react-zoom-pan-pinch'
import type { Message } from '@/lib/types'

// Type local etendu (aligne avec Album.tsx)
type AlbumPhoto = Message & { _pending?: boolean }

// Transformation Supabase : thumbnail pour la lightbox (optimisation perf mobile)
const thumbUrl = (url: string, w = 1600) => {
  if (url.startsWith('blob:')) return url
  return url.includes('?') ? url : `${url}?width=${w}&quality=75`
}

type LightboxProps = {
  photos: AlbumPhoto[]
  lightboxIdx: number
  isZoomed: boolean
  onZoomChange: (zoomed: boolean) => void
  onClose: () => void
  onPrev: () => void
  onNext: () => void
}

export default function Lightbox({
  photos, lightboxIdx, isZoomed, onZoomChange, onClose, onPrev, onNext,
}: LightboxProps) {
  const transformRef = useRef<ReactZoomPanPinchRef | null>(null)

  // Reset zoom quand on change de photo (sans re-mount du TransformWrapper)
  useEffect(() => {
    if (transformRef.current) {
      transformRef.current.resetTransform()
    }
  }, [lightboxIdx])

  const currentPhoto = photos[lightboxIdx]
  if (!currentPhoto) return null

  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed', inset: 0, background: 'rgba(0,0,0,.95)',
        zIndex: 200, display: 'flex', flexDirection: 'column',
        paddingTop: 'env(safe-area-inset-top,0)',
        paddingBottom: 'env(safe-area-inset-bottom,0)',
      }}>

      {/* Header : avatar + nom membre + close */}
      <div onClick={e => e.stopPropagation()}
        style={{
          display: 'flex', alignItems: 'center', gap: 10,
          padding: '10px 16px', color: '#fff', flexShrink: 0,
        }}>
        <div style={{
          width: 28, height: 28, borderRadius: '50%',
          background: `${currentPhoto.membre_couleur || '#888'}`,
          color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 12, fontWeight: 700, flexShrink: 0,
        }}>
          {(currentPhoto.membre_prenom || '?')[0].toUpperCase()}
        </div>
        <div style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>
          {currentPhoto.membre_prenom || 'Inconnu'}
        </div>
        <button onClick={onClose}
          aria-label="Fermer"
          style={{
            width: 36, height: 36, borderRadius: '50%', border: 'none',
            background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 20,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>×</button>
      </div>

      {/* Photo avec zoom (react-zoom-pan-pinch) */}
      <div
        style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
          minHeight: 0, position: 'relative', overflow: 'hidden',
        }}>
        <TransformWrapper
          ref={transformRef}
          initialScale={1}
          minScale={1}
          maxScale={4}
          doubleClick={{ mode: 'toggle', step: 1.5 }}
          wheel={{ step: 0.15 }}
          pinch={{ step: 5 }}
          panning={{ velocityDisabled: true }}
          onTransform={(_ref: ReactZoomPanPinchRef, state: { scale: number; positionX: number; positionY: number }) => onZoomChange(state.scale > 1.02)}
        >
          <TransformComponent
            wrapperStyle={{ width: '100%', height: '100%' }}
            contentStyle={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          >
            <img
              src={thumbUrl(currentPhoto.image_url!, 1600)}
              alt={currentPhoto.contenu || ''}
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

        {/* Fleche precedente : cachee quand zoome */}
        {!isZoomed && lightboxIdx > 0 && (
          <button
            onClick={e => { e.stopPropagation(); onPrev() }}
            aria-label="Précédente"
            style={{
              position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)',
              width: 40, height: 40, borderRadius: '50%', border: 'none',
              background: 'rgba(255,255,255,.15)', color: '#fff', fontSize: 22,
              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              zIndex: 5,
            }}>‹</button>
        )}

        {/* Fleche suivante : cachee quand zoome */}
        {!isZoomed && lightboxIdx < photos.length - 1 && (
          <button
            onClick={e => { e.stopPropagation(); onNext() }}
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

      {/* Legende (si presente) : bandeau bas bien visible */}
      {currentPhoto.contenu && (
        <div onClick={e => e.stopPropagation()}
          style={{
            padding: '16px 20px calc(20px + env(safe-area-inset-bottom,0px))',
            color: '#fff',
            fontSize: 15, lineHeight: 1.5, flexShrink: 0,
            background: 'linear-gradient(to bottom, rgba(0,0,0,0) 0%, rgba(0,0,0,0.85) 40%, rgba(0,0,0,0.95) 100%)',
            textAlign: 'center',
            fontWeight: 500,
            letterSpacing: '.01em',
          }}>
          {currentPhoto.contenu}
        </div>
      )}
    </div>
  )
}
