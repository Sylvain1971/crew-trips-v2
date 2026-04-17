'use client'
import { getCat } from '@/lib/types'
import { getYoutubeId, isPdf, getCatLabel } from '@/lib/utils'
import type { InfoCard } from '@/lib/types'
import CardContent from './CardContent'

const badge = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5,
  fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--sand)', color: 'var(--text-2)', lineHeight: 1.4,
  fontFamily: 'inherit', ...extra,
})

const SVG = {
  play:   <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"/></svg>,
  link:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>,
  image:  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>,
  file:   <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>,
  detail: <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>,
  edit:   <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>,
}

export default function InfoCardView({ card, canDelete, canEdit, isCreateur, collapsed, tripType, onDelete, onEdit, onOpenPdf, onCardClick, currentFiltre }: {
  card: InfoCard
  canDelete: boolean
  canEdit: boolean
  isCreateur: boolean
  collapsed: boolean
  tripType?: string
  onDelete: () => void
  onEdit: () => void
  onOpenPdf: (url: string, nom: string) => void
  onCardClick?: () => void
  currentFiltre?: string
}) {
  const c = getCat(card.categorie)
  const ytId = card.lien ? getYoutubeId(card.lien) : null
  const hasPdf = isPdf(card.fichier_url) || isPdf(card.lien)
  const pdfUrl = isPdf(card.fichier_url) ? card.fichier_url : isPdf(card.lien) ? card.lien : null
  const isImage = card.fichier_url && !hasPdf && /\.(jpg|jpeg|png|gif|webp|heic)/i.test(card.fichier_url.split('?')[0])

  const saveFiltreToSession = () => {
    if (currentFiltre) sessionStorage.setItem('crew-trips-filtre', currentFiltre)
  }

  const hasBadges = ytId || (card.lien && !ytId && !hasPdf) || isImage || pdfUrl || (collapsed && card.contenu && onCardClick)

  return (
    <div className="card" id={card.id}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '13px 14px' }}>

        {/* Icône catégorie */}
        <div style={{ width: 36, height: 36, borderRadius: 9, background: c.bg, display: 'flex',
          alignItems: 'center', justifyContent: 'center', fontSize: 18, flexShrink: 0 }}>
          {c.icon}
        </div>

        {/* Contenu principal */}
        <div style={{ flex: 1, minWidth: 0 }}>

          {/* Titre cliquable en collapsed */}
          <div onClick={collapsed && onCardClick ? onCardClick : undefined}
            style={collapsed && onCardClick ? { cursor: 'pointer' } : undefined}>
            <div style={{ fontSize: 10, fontWeight: 700, color: c.color, textTransform: 'uppercase',
              letterSpacing: '.06em', marginBottom: 3 }}>
              {getCatLabel(card.categorie, tripType || '') || c.label}
            </div>
            <div style={{ fontWeight: 700, fontSize: 14, letterSpacing: '-.01em', marginBottom: card.contenu ? 4 : 0 }}>
              {card.titre}
            </div>
          </div>

          {/* Contenu détail (expanded seulement) */}
          {card.contenu && !collapsed && <CardContent contenu={card.contenu} />}

          {/* Badges */}
          {hasBadges && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 7 }}
              onClick={e => e.stopPropagation()}>
              {ytId && (
                <a href={card.lien!} target="_blank" rel="noreferrer" style={badge()} onClick={saveFiltreToSession}>
                  {SVG.play} Voir la vidéo
                </a>
              )}
              {card.lien && !ytId && !hasPdf && (
                <a href={card.lien} target="_blank" rel="noreferrer" style={badge()} onClick={saveFiltreToSession}>
                  {SVG.link} Ouvrir le lien
                </a>
              )}
              {isImage && (
                <a href={card.fichier_url!} target="_blank" rel="noreferrer" style={badge()} onClick={saveFiltreToSession}>
                  {SVG.image} Voir la photo
                </a>
              )}
              {pdfUrl && (
                <button onClick={() => onOpenPdf(pdfUrl, card.titre)} style={badge()}>
                  {SVG.file} Voir le document
                </button>
              )}
              {collapsed && card.contenu && onCardClick && (
                <button onClick={onCardClick} style={badge()}>
                  {SVG.detail} Voir le détail
                </button>
              )}
            </div>
          )}

          {/* Auteur */}
          {card.membre_prenom && (
            <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12"/>
              </svg>
              {card.membre_prenom}
            </div>
          )}
        </div>

        {/* Actions édition/suppression */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, alignSelf: 'stretch' }}>
          {canEdit && (
            <button onClick={onEdit} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 2, lineHeight: 1, display: 'flex', alignItems: 'center' }}>
              {SVG.edit}
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 20, cursor: 'pointer', padding: '0 2px', lineHeight: 1, fontWeight: 300 }}>
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
