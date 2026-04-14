'use client'
import { getCat } from '@/lib/types'
import type { InfoCard } from '@/lib/types'

function getYoutubeId(url: string) {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}
function isPdf(url?: string|null) {
  if (!url) return false
  return url.toLowerCase().includes('.pdf') || url.includes('application%2Fpdf')
}
function ago(ts: string) {
  const d = Date.now() - new Date(ts).getTime()
  if (d < 3600000) return `${Math.floor(d/60000)}min`
  if (d < 86400000) return `${Math.floor(d/3600000)}h`
  return new Date(ts).toLocaleDateString('fr-CA',{day:'numeric',month:'short'})
}

export default function InfoCardView({card, canDelete, onDelete, onOpenPdf}: {
  card: InfoCard
  canDelete: boolean
  onDelete: () => void
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
            letterSpacing:'.06em',marginBottom:4}}>{c.label}</div>
          <div style={{fontWeight:700,fontSize:15,letterSpacing:'-.01em',
            marginBottom:card.contenu?5:0}}>{card.titre}</div>
          {card.contenu && (
            <div style={{fontSize:13,color:'var(--text-2)',lineHeight:1.55,whiteSpace:'pre-wrap'}}>
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
            <a href={card.fichier_url!} target="_blank" rel="noreferrer"
              style={{display:'inline-block',marginTop:10,borderRadius:10,overflow:'hidden',
                width:110,height:110,flexShrink:0}}>
              <img src={card.fichier_url!} alt={card.titre}
                style={{width:110,height:110,objectFit:'cover',display:'block',borderRadius:10}} />
            </a>
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

          <div style={{fontSize:11,color:'var(--text-3)',marginTop:8}}>
            {card.membre_prenom} · {ago(card.created_at)}
          </div>
        </div>

        {canDelete && (
          <button onClick={onDelete}
            style={{background:'none',border:'none',color:'var(--border)',
              fontSize:20,cursor:'pointer',flexShrink:0,padding:2}}>
            ×
          </button>
        )}
      </div>
    </div>
  )
}
