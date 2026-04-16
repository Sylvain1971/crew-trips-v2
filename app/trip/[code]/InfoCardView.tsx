'use client'
import { getCat } from '@/lib/types'
import { getYoutubeId, isPdf, ago, getCatLabel, parseTableContent } from '@/lib/utils'
import type { InfoCard } from '@/lib/types'

// Row de preview uniforme - hauteur 92px (thumbnail/icone 72x72 + padding 10px)
type RowProps = {
  href?: string
  onClick?: () => void
  thumb: React.ReactNode  // 72x72 sur la gauche
  title: string
  subtitle?: string
  color?: string
}

function PreviewRow({ href, onClick, thumb, title, subtitle, color }: RowProps) {
  const inner = (
    <>
      <div style={{width:72,height:72,borderRadius:10,overflow:'hidden',flexShrink:0,
        display:'flex',alignItems:'center',justifyContent:'center',
        background:color||'var(--sand)'}}>
        {thumb}
      </div>
      <div style={{flex:1,minWidth:0}}>
        <div style={{fontSize:13,fontWeight:700,color:'var(--text)',
          whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{title}</div>
        {subtitle && (
          <div style={{fontSize:11,color:'var(--text-3)',marginTop:3,
            whiteSpace:'nowrap',overflow:'hidden',textOverflow:'ellipsis'}}>{subtitle}</div>
        )}
      </div>
      <div style={{fontSize:18,color:'var(--text-3)',flexShrink:0}}>›</div>
    </>
  )
  const styles = {
    display:'flex', alignItems:'center', gap:12, marginTop:10, width:'100%',
    background:'var(--sand)', border:'1.5px solid var(--border)', borderRadius:10,
    padding:'10px 14px', textDecoration:'none', cursor:'pointer', textAlign:'left' as const,
    boxSizing:'border-box' as const, minHeight:92,
  }
  if (href) return <a href={href} target="_blank" rel="noreferrer" style={styles}>{inner}</a>
  return <button type="button" onClick={onClick} style={{...styles, fontFamily:'inherit'}}>{inner}</button>
}

export default function InfoCardView({card, canDelete, canEdit, isCreateur, collapsed, tripType, onDelete, onEdit, onOpenPdf}: {
  card: InfoCard
  canDelete: boolean
  canEdit: boolean
  isCreateur: boolean
  collapsed: boolean
  tripType?: string
  onDelete: () => void
  onEdit: () => void
  onOpenPdf: (url: string, nom: string) => void
}) {
  const c = getCat(card.categorie)
  const ytId = card.lien ? getYoutubeId(card.lien) : null
  const hasPdf = isPdf(card.fichier_url) || isPdf(card.lien)
  const pdfUrl = isPdf(card.fichier_url) ? card.fichier_url : isPdf(card.lien) ? card.lien : null
  const isImage = card.fichier_url && !hasPdf && /\.(jpg|jpeg|png|gif|webp|heic)/i.test(card.fichier_url.split('?')[0])

  return (
    <div className="card">
      <div style={{display:'flex',alignItems:'flex-start',gap:12,padding:'13px 14px'}}>
        <div style={{width:40,height:40,borderRadius:10,background:c.bg,display:'flex',
          alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
          {c.icon}
        </div>
        <div style={{flex:1,minWidth:0}}>
          <div style={{fontSize:10,fontWeight:700,color:c.color,textTransform:'uppercase',
            letterSpacing:'.06em',marginBottom:4}}>{getCatLabel(card.categorie, tripType||'') || c.label}</div>
          <div style={{fontWeight:700,fontSize:15,letterSpacing:'-.01em',
            marginBottom:card.contenu?5:0}}>{card.titre}</div>
          {card.contenu && (() => {
            const tbl = parseTableContent(card.contenu)
            if (tbl && !collapsed) {
              return (
                <div style={{marginTop:6,overflowX:'auto',borderRadius:6,border:'1.5px solid var(--border)'}}>
                  <table style={{width:'100%',borderCollapse:'collapse',fontSize:12.5,color:'var(--text-2)'}}>
                    <tbody>
                      {tbl.rows.map((r,ri)=>(
                        <tr key={ri}>
                          {r.map((cell,ci)=>(
                            <td key={ci} style={{padding:'6px 10px',border:'1px solid var(--border)',verticalAlign:'top',whiteSpace:'pre-wrap'}}>{cell||' '}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )
            }
            return (
              <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.55,whiteSpace:'pre-wrap',
                ...(collapsed ? {display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',whiteSpace:'normal'} : {})}}>
                {card.contenu}
              </div>
            )
          })()}

          {/* YouTube - row uniforme 92px avec thumbnail et badge play */}
          {ytId && (
            <PreviewRow href={card.lien!}
              thumb={
                <div style={{position:'relative',width:72,height:72}}>
                  <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                    style={{width:72,height:72,objectFit:'cover',display:'block'}} />
                  <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                    justifyContent:'center',background:'rgba(0,0,0,.25)'}}>
                    <div style={{width:24,height:24,borderRadius:'50%',background:'rgba(255,0,0,.9)',
                      display:'flex',alignItems:'center',justifyContent:'center',fontSize:11,color:'#fff'}}>
                      ▶
                    </div>
                  </div>
                </div>
              }
              title="Voir la vidéo"
              subtitle={card.titre}
            />
          )}

          {/* Lien externe simple - row uniforme 92px */}
          {card.lien && !ytId && !hasPdf && (
            <PreviewRow href={card.lien}
              color="#ECFDF5"
              thumb={<span style={{fontSize:28}}>🔗</span>}
              title="Ouvrir le lien"
              subtitle={card.titre}
            />
          )}

          {/* Image - row uniforme 92px */}
          {isImage && (
            <PreviewRow href={card.fichier_url!}
              thumb={
                <img src={card.fichier_url!} alt={card.titre}
                  style={{width:72,height:72,objectFit:'cover',display:'block'}} />
              }
              title="Voir la photo"
              subtitle={card.titre}
            />
          )}

          {/* PDF - row uniforme 92px */}
          {pdfUrl && (
            <PreviewRow onClick={() => onOpenPdf(pdfUrl, card.titre)}
              color="#FEE2E2"
              thumb={<span style={{fontSize:28}}>📄</span>}
              title="Voir le document"
              subtitle={`${card.titre}.pdf`}
            />
          )}

          {card.membre_prenom && (
            <div style={{fontSize:11,color:'var(--text-3)',marginTop:8,display:'flex',alignItems:'center',gap:4}}>
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
