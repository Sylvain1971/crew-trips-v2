'use client'
import { getCat } from '@/lib/types'
import { getYoutubeId, isPdf, ago, getCatLabel } from '@/lib/utils'
import type { InfoCard } from '@/lib/types'

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
          {card.contenu && (
            <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.55,whiteSpace:'pre-wrap',
              ...(collapsed ? {display:'-webkit-box',WebkitLineClamp:2,WebkitBoxOrient:'vertical',overflow:'hidden',whiteSpace:'normal'} : {})}}>
              {card.contenu}
            </div>
          )}

          {/* Lien externe simple */}
          {card.lien && !ytId && !hasPdf && (
            <a href={card.lien} target="_blank" rel="noreferrer"
              style={{display:'inline-flex',alignItems:'center',gap:5,marginTop:8,fontSize:13,
                color:'var(--green)',fontWeight:600,textDecoration:'none',
                background:'var(--sand)',padding:'5px 10px',borderRadius:7}}>
              🔗 Ouvrir le lien ↗
            </a>
          )}

          {/* YouTube */}
          {ytId && (
            <a href={card.lien!} target="_blank" rel="noreferrer"
              style={{display:'inline-block',marginTop:10,borderRadius:10,overflow:'hidden',position:'relative',width:160}}>
              <img src={`https://img.youtube.com/vi/${ytId}/mqdefault.jpg`} alt=""
                style={{width:160,display:'block',borderRadius:10}} />
              <div style={{position:'absolute',inset:0,display:'flex',alignItems:'center',
                justifyContent:'center',background:'rgba(0,0,0,.3)',borderRadius:10}}>
                <div style={{width:32,height:32,borderRadius:'50%',background:'rgba(255,0,0,.9)',
                  display:'flex',alignItems:'center',justifyContent:'center',fontSize:14,color:'#fff'}}>
                  ▶
                </div>
              </div>
            </a>
          )}

          {/* Image uploadée */}
          {isImage && (
            collapsed ? (
              <a href={card.fichier_url!} target="_blank" rel="noreferrer"
                style={{display:'flex',alignItems:'center',gap:10,marginTop:10,width:'100%',
                  background:'var(--sand)',border:'1.5px solid var(--border)',borderRadius:10,
                  padding:'10px 14px',textDecoration:'none'}}>
                <div style={{width:36,height:36,borderRadius:8,overflow:'hidden',flexShrink:0}}>
                  <img src={card.fichier_url!} alt={card.titre}
                    style={{width:36,height:36,objectFit:'cover',display:'block'}} />
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Voir la photo</div>
                  <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{card.titre}</div>
                </div>
                <div style={{fontSize:18,color:'var(--text-3)'}}>›</div>
              </a>
            ) : (
              <a href={card.fichier_url!} target="_blank" rel="noreferrer"
                style={{display:'inline-block',marginTop:10,borderRadius:10,overflow:'hidden',position:'relative',width:160}}>
                <img src={card.fichier_url!} alt={card.titre}
                  style={{width:160,height:90,objectFit:'cover',display:'block',borderRadius:10}} />
              </a>
            )
          )}

          {/* PDF */}
          {pdfUrl && (
            <button onClick={() => onOpenPdf(pdfUrl, card.titre)}
              style={{display:'flex',alignItems:'center',gap:10,marginTop:10,width:'100%',
                background:'var(--sand)',border:'1.5px solid var(--border)',borderRadius:10,
                padding:'10px 14px',cursor:'pointer',textAlign:'left'}}>
              <div style={{width:36,height:36,borderRadius:8,background:'#FEE2E2',
                display:'flex',alignItems:'center',justifyContent:'center',fontSize:20,flexShrink:0}}>
                📄
              </div>
              <div style={{flex:1,minWidth:0}}>
                <div style={{fontSize:13,fontWeight:700,color:'var(--text)'}}>Voir le document</div>
                <div style={{fontSize:11,color:'var(--text-3)',marginTop:2}}>{card.titre}.pdf</div>
              </div>
              <div style={{fontSize:18,color:'var(--text-3)'}}>›</div>
            </button>
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
              style={{background:'none',border:'none',color:'var(--border)',
                fontSize:18,cursor:'pointer',padding:2,lineHeight:1,marginTop:'auto'}}>
              ×
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
