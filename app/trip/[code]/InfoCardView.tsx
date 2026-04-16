'use client'
import { getCat } from '@/lib/types'
import { getYoutubeId, isPdf, ago, getCatLabel, parseTableContent } from '@/lib/utils'
import type { InfoCard } from '@/lib/types'

// Style badge compact commun
const badge = (extra?: React.CSSProperties): React.CSSProperties => ({
  display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 7,
  fontSize: 12, fontWeight: 600, textDecoration: 'none', cursor: 'pointer',
  padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)',
  background: 'var(--sand)', color: 'var(--text-2)', lineHeight: 1.4,
  fontFamily: 'inherit', ...extra
})

export default function InfoCardView({card, canDelete, canEdit, isCreateur, collapsed, tripType, onDelete, onEdit, onOpenPdf, onCardClick}: {
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
}) {
  const c = getCat(card.categorie)
  const ytId = card.lien ? getYoutubeId(card.lien) : null
  const hasPdf = isPdf(card.fichier_url) || isPdf(card.lien)
  const pdfUrl = isPdf(card.fichier_url) ? card.fichier_url : isPdf(card.lien) ? card.lien : null
  const isImage = card.fichier_url && !hasPdf && /\.(jpg|jpeg|png|gif|webp|heic)/i.test(card.fichier_url.split('?')[0])

  return (
    <div className="card" id={card.id}
      onClick={collapsed && onCardClick ? onCardClick : undefined}
      style={collapsed && onCardClick ? {cursor:'pointer'} : undefined}>
      <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'13px 14px'}}>
        <div style={{width:36,height:36,borderRadius:9,background:c.bg,display:'flex',
          alignItems:'center',justifyContent:'center',fontSize:18,flexShrink:0}}>
          {c.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,color:c.color,textTransform:'uppercase',
            letterSpacing:'.06em',marginBottom:3}}>{getCatLabel(card.categorie, tripType||'') || c.label}</div>
          <div style={{fontWeight:700,fontSize:14,letterSpacing:'-.01em',
            marginBottom:card.contenu?4:0}}>{card.titre}</div>

          {/* Contenu texte / tableau Excel */}
          {card.contenu && !collapsed && (() => {
            const tbl = parseTableContent(card.contenu)
            if (tbl) {
              return (
                <div style={{marginTop:5,overflowX:'auto',borderRadius:5,border:'1px solid var(--border)'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12,color:'var(--text-2)'}}>
                    <tbody>
                      {tbl.rows.map((r,ri)=>(
                        <tr key={ri}>
                          {r.map((cell,ci)=>(
                            <td key={ci} style={{padding:'5px 8px',border:'1px solid var(--border)',verticalAlign:'top',whiteSpace:'pre-wrap'}}>{cell||'\u00a0'}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
            return (
              <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>
                {card.contenu}
              </div>
            )
          })()}

          {/* Badges compacts — masqués en collapsed (onglet Tout) */}
          {ytId && (
            <a href={card.lien!} target="_blank" rel="noreferrer" style={badge({color:'var(--text-2)'})}>
              ▶ Voir la vidéo
            </a>
          )}
          {card.lien && !ytId && !hasPdf && (
            <a href={card.lien} target="_blank" rel="noreferrer" style={badge()}>
              🔗 Ouvrir le lien ↗
            </a>
          )}
          {!collapsed && isImage && (
            <a href={card.fichier_url!} target="_blank" rel="noreferrer" style={badge()}>
              🖼 Voir la photo ↗
            </a>
          )}
          {pdfUrl && (
            <button onClick={()=>onOpenPdf(pdfUrl,card.titre)} style={badge()}>
              📄 Voir le document
            </button>
          )}

          {card.membre_prenom && (
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:6,display:'flex',alignItems:'center',gap:4}}>
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
              {card.membre_prenom}
            </div>
          )}
        </div>

        <div style={{display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'space-between',flexShrink:0,alignSelf:'stretch'}}>
          {canEdit && (
            <button onClick={onEdit}
              style={{background:'none',border:'none',color:'var(--text-3)',
                cursor:'pointer',padding:2,lineHeight:1,display:'flex',alignItems:'center'}}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
          )}
          {canDelete && (
            <button onClick={onDelete}
              style={{background:'none',border:'none',color:'var(--text-2)',
                fontSize:20,cursor:'pointer',padding:'0 4px',lineHeight:1,marginTop:'auto',fontWeight:300}}>
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
