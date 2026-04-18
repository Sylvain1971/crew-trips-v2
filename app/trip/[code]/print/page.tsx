'use client'
import { useEffect, useState, use } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, getCat, getCatSvg } from '@/lib/types'
import { getCatLabel, getLodgeLabel } from '@/lib/utils'
import { SvgIcon } from '@/lib/svgIcons'
import CardContent from '../CardContent'
import type { Trip, InfoCard } from '@/lib/types'

const CAT_ORDER = ['transport','lodge','permis','equipement','infos','itineraire','meteo','resto','liens']

export default function PrintPage({ params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = use(paramsPromise)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [cards, setCards] = useState<InfoCard[]>([])
  const [ready, setReady] = useState(false)
  const [hideUI, setHideUI] = useState(false)
  const [showPrintTip, setShowPrintTip] = useState(false)

  useEffect(() => {
    async function load() {
      const { data: t } = await supabase.from('trips').select('*').eq('code', params.code).single()
      if (!t) return
      setTrip(t)
      const { data: c } = await supabase.from('infos').select('*').eq('trip_id', t.id).order('created_at', { ascending: true })
      if (c) {
        const sorted = [...c].sort((a, b) => {
          const ai = CAT_ORDER.indexOf(a.categorie), bi = CAT_ORDER.indexOf(b.categorie)
          if (ai !== bi) return ai - bi
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
        setCards(sorted)
      }
      setReady(true)
      if (typeof window !== 'undefined' && window.location.search.includes('clean=1')) setHideUI(true)
    }
    load()
  }, [params.code])

  useEffect(() => {
    if (ready) {
      const searchParams = new URLSearchParams(window.location.search)
      const isClean = searchParams.has('clean')
      const autoprint = searchParams.has('autoprint')
      const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent)
      if (isClean && !isMobile && autoprint) {
        const s = document.createElement('style')
        s.textContent = '@media print { @page { size: 21cm 99999cm; margin: 15mm 15mm; } }'
        document.head.appendChild(s)
        setTimeout(() => window.print(), 800)
      }
    }
  }, [ready])

  if (!trip) return <div style={{ padding: 40, fontFamily: 'sans-serif' }}>Chargement…</div>

  const tripUrl = `https://crew-trips-v2.vercel.app/trip/${params.code}`
  const dateDebut = trip.date_debut ? new Date(trip.date_debut + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }) : ''
  const dateFin = trip.date_fin ? new Date(trip.date_fin + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' }) : ''

  const grouped = CAT_ORDER.reduce((acc, catId) => {
    const catCards = cards.filter(c => c.categorie === catId)
    if (catCards.length > 0) acc.push({ catId, cards: catCards })
    return acc
  }, [] as { catId: string; cards: InfoCard[] }[])

  return (
    <>
      <style>{`
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background: #f3f4f6; color: #111; }
        @media print {
          @page { margin: 12mm 14mm; }
          body { background: #fff !important; padding: 0 !important; }
          html, body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
          .no-print { display: none !important; }
          a { color: inherit; }
          .wrap { padding: 0 !important; max-width: 100% !important; box-shadow: none !important; }
        }
        .back-btn { position: fixed; top: 16px; left: 16px; background: #0F2D0F; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,.2); display: none; align-items: center; gap: 6px; }
        .print-btn { position: fixed; top: 16px; right: 16px; background: #0F2D0F; color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,.2); display: none; }
        .share-tip { display: none; }
        @media (max-width: 768px) {
          .back-btn { display: flex; }
          .print-btn { display: none !important; }
          .share-tip { display: block; }
          .wrap { padding: 70px 16px 140px !important; box-shadow: none !important; }
        }
        @media screen and (min-width: 769px) {
          body { padding: 32px 24px; }
          .back-btn { display: flex; }
          .print-btn { display: flex; align-items: center; gap: 8px; }
        }
        .wrap { max-width: 720px; margin: 0 auto; padding: 70px 32px 140px; background: #fff; min-height: 100vh; box-shadow: 0 0 40px rgba(0,0,0,.08); }






        .header { background: #0F2D0F; color: #fff; padding: 24px 16px 20px; border-radius: 12px; margin: 8px 0 24px; }
        .trip-title { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 4px; }
        .trip-sub { font-size: 13px; color: rgba(255,255,255,.65); margin-bottom: 10px; }
        .trip-link { font-size: 12px; color: rgba(255,255,255,.45); word-break: break-all; }
        .trip-link a { color: rgba(255,255,255,.7); }
        .lodge-box { margin-bottom: 20px; }
        .lodge-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1.5px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; line-height: 1; color: #16A34A; }
        .lodge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .lodge-item { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; }
        .lodge-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
        .lodge-val { font-size: 13px; font-weight: 600; color: #111; word-break: break-all; }
        .section { margin-bottom: 20px; }
        .section-title { display: flex; align-items: center; gap: 6px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; border-bottom: 1.5px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; line-height: 1; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; border-left-width: 3px;   }
        .card-title { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 4px; }
        .card-content { font-size: 13px; color: #374151; line-height: 1.55; margin-bottom: 5px; white-space: pre-wrap; }
        .card-link { font-size: 15px; color: #2563eb; word-break: break-all; display: block; margin-top: 6px; padding: 4px 0; }
        .empty { text-align: center; color: #9ca3af; padding: 40px 0; font-size: 14px; }
      `}</style>

      {!hideUI && <button className="no-print back-btn" onClick={() => window.close()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Retour
      </button>}
      <button className="no-print print-btn" onClick={() => window.open(window.location.pathname + '?clean=1&autoprint=1', '_blank')}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V3h12v6"/><path d="M6 18v3h12v-3"/>
          <rect x="2" y="9" width="20" height="9" rx="2"/>
        </svg>
        Enregistrer en PDF
      </button>

      {showPrintTip && (
        <div className="no-print" style={{position:'fixed',inset:0,background:'rgba(0,0,0,.5)',zIndex:200,display:'flex',alignItems:'center',justifyContent:'center'}}
          onClick={()=>setShowPrintTip(false)}>
          <div style={{background:'#fff',borderRadius:16,padding:28,maxWidth:420,width:'90%',boxShadow:'0 20px 60px rgba(0,0,0,.3)'}}
            onClick={e=>e.stopPropagation()}>
            <div style={{fontWeight:800,fontSize:18,marginBottom:6}}>Enregistrer en PDF</div>
            <div style={{fontSize:13,color:'#6b7280',marginBottom:20,lineHeight:1.5}}>Dans Chrome, configurez ces options pour un PDF propre :</div>
            <div style={{display:'flex',flexDirection:'column',gap:10,marginBottom:24}}>
              <div style={{display:'flex',gap:12,alignItems:'center',background:'#f9fafb',borderRadius:10,padding:'10px 14px'}}>
                <span style={{fontSize:20}}>🖨</span>
                <div><strong>Destination</strong><br/><span style={{fontSize:12,color:'#6b7280'}}>Choisir → Enregistrer en PDF</span></div>
              </div>
              <div style={{display:'flex',gap:12,alignItems:'center',background:'#f9fafb',borderRadius:10,padding:'10px 14px'}}>
                <span style={{fontSize:20}}>📐</span>
                <div><strong>Marges</strong><br/><span style={{fontSize:12,color:'#6b7280'}}>Sélectionner → Aucune</span></div>
              </div>
              <div style={{display:'flex',gap:12,alignItems:'center',background:'#FFF7ED',borderRadius:10,padding:'10px 14px',border:'1px solid #FED7AA'}}>
                <span style={{fontSize:20}}>☑️</span>
                <div><strong>En-têtes et pieds de page</strong><br/><span style={{fontSize:12,color:'#6b7280'}}>Décocher cette option</span></div>
              </div>
            </div>
            <button onClick={()=>{ setShowPrintTip(false); setTimeout(()=>window.print(), 200) }}
              style={{width:'100%',padding:14,background:'#0F2D0F',color:'#fff',border:'none',borderRadius:10,fontSize:15,fontWeight:700,cursor:'pointer'}}>
              Ouvrir l'impression Ctrl+P
            </button>
            <button onClick={()=>setShowPrintTip(false)}
              style={{width:'100%',padding:10,background:'transparent',color:'#6b7280',border:'none',fontSize:13,cursor:'pointer',marginTop:8}}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {!hideUI && <div className="no-print share-tip"
        style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',
          borderTop:'1px solid #e5e7eb',padding:'16px 20px',zIndex:100,
          display:'flex',flexDirection:'column',gap:10,alignItems:'stretch'}}>
        <button
          onClick={()=>{
            if(navigator.share){
              navigator.share({title:document.title,url:window.location.href.split('?')[0] + '?clean=1'})
            }
          }}
          style={{background:'#0F2D0F',color:'#fff',border:'none',borderRadius:12,
            padding:'15px',fontSize:16,fontWeight:700,cursor:'pointer',
            display:'flex',alignItems:'center',justifyContent:'center',gap:10}}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/>
            <polyline points="16 6 12 2 8 6"/>
            <line x1="12" y1="2" x2="12" y2="15"/>
          </svg>
          Partager / Enregistrer en PDF
        </button>
        <div style={{fontSize:12,color:'#9ca3af',textAlign:'center',lineHeight:1.4}}>
          Appuyez sur Partager puis <strong>«&nbsp;Enregistrer en PDF&nbsp;»</strong> pour un document continu
        </div>
      </div>}

      <div className="wrap">
        <div className="header">
          <div className="trip-title">{trip.nom}</div>
          {(trip.destination || dateDebut) && (
            <div className="trip-sub">
              {trip.destination && <span style={{display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="pin" size={13} /> {trip.destination}</span>}
              {trip.destination && dateDebut && <span style={{ margin: '0 8px' }}>·</span>}
              {dateDebut && <span style={{display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="calendar" size={13} /> {dateDebut}{dateFin ? ` → ${dateFin}` : ''}</span>}
            </div>
          )}
          <div className="trip-link" style={{display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="link" size={13} /> <a href={tripUrl}>{tripUrl}</a></div>
        </div>

        {(trip.lodge_nom || trip.lodge_adresse || trip.lodge_tel || trip.lodge_wifi || trip.lodge_arrivee || trip.lodge_code) && (
          <div className="lodge-box">
            <div className="lodge-title" style={{display:'inline-flex',alignItems:'center',gap:8}}>
              <span style={{display:'inline-flex',width:22,height:22,borderRadius:6,background:'#16A34A',color:'#fff',alignItems:'center',justifyContent:'center'}}>{getCatSvg('lodge', 13, trip.type)}</span>
              {getLodgeLabel(trip.type).label}
            </div>
            <div className="lodge-grid">
              {trip.lodge_nom && <div className="lodge-item"><div className="lodge-label" style={{display:'inline-flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3L2 12h3v8h5v-6h4v6h5v-8h3L12 3z"/></svg> Nom</div><div className="lodge-val">{trip.lodge_nom}</div></div>}
              {trip.lodge_adresse && <div className="lodge-item"><div className="lodge-label" style={{display:'inline-flex',alignItems:'center',gap:4}}><SvgIcon name="pin" size={12} /> Adresse</div><div className="lodge-val">{trip.lodge_adresse}</div></div>}
              {trip.lodge_tel && <div className="lodge-item"><div className="lodge-label" style={{display:'inline-flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M20.01 15.38c-1.23 0-2.42-.2-3.53-.56-.35-.12-.74-.03-1.01.24l-1.57 1.97c-2.83-1.35-5.48-3.9-6.89-6.83l1.95-1.66c.27-.28.35-.67.24-1.02-.37-1.11-.56-2.3-.56-3.53 0-.54-.45-.99-.99-.99H4.19C3.65 3 3 3.24 3 3.99 3 13.28 10.73 21 20.01 21c.71 0 .99-.63.99-1.18v-3.45c0-.54-.45-.99-.99-.99z"/></svg> Téléphone</div><div className="lodge-val"><a href={`tel:${trip.lodge_tel}`}>{trip.lodge_tel}</a></div></div>}
              {trip.lodge_wifi && <div className="lodge-item"><div className="lodge-label" style={{display:'inline-flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M1 9l2 2c4.97-4.97 13.03-4.97 18 0l2-2C16.93 2.93 7.08 2.93 1 9zm8 8l3 3 3-3c-1.65-1.66-4.34-1.66-6 0zm-4-4l2 2c2.76-2.76 7.24-2.76 10 0l2-2C15.14 9.14 8.87 9.14 5 13z"/></svg> WiFi</div><div className="lodge-val">{trip.lodge_wifi}</div></div>}
              {trip.lodge_arrivee && <div className="lodge-item"><div className="lodge-label" style={{display:'inline-flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M12.65 10C11.83 7.67 9.61 6 7 6c-3.31 0-6 2.69-6 6s2.69 6 6 6c2.61 0 4.83-1.67 5.65-4H17v4h4v-4h2v-4H12.65zM7 14c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/></svg> Arrivée</div><div className="lodge-val">{trip.lodge_arrivee}</div></div>}
              {trip.lodge_code && <div className="lodge-item"><div className="lodge-label" style={{display:'inline-flex',alignItems:'center',gap:4}}><svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg> Départ</div><div className="lodge-val">{trip.lodge_code}</div></div>}
            </div>
          </div>
        )}

        {grouped.map(({ catId, cards: catCards }) => {
          const cat = getCat(catId)
          const def = CATEGORIES.find(c => c.id === catId)
          return (
            <div key={catId} className="section">
              <div className="section-title" style={{ color: def?.color || '#6b7280' }}>
                <span style={{ display:'inline-flex', verticalAlign:'middle', marginRight:6 }}>{getCatSvg(catId, 16, trip.type) || <span>{cat.icon}</span>}</span>{getCatLabel(catId, trip.type) || cat.label}
              </div>
              {catCards.map(card => (
                <div key={card.id} className="card" style={{ borderLeftColor: def?.color || '#e5e7eb' }}>
                  <div className="card-title">{card.titre}</div>
                  {card.contenu && (
                    <div className="card-content">
                      <CardContent contenu={card.contenu} printMode />
                    </div>
                  )}
                  {card.lien && <a href={card.lien} target="_blank" rel="noreferrer" className="card-link" style={{fontWeight:600}}>{card.lien}</a>}
                  {card.fichier_url && !card.lien && (() => {
                    const url = card.fichier_url!
                    const isImg = /\.(jpg|jpeg|png|gif|webp|heic)/i.test(url.split('?')[0])
                    if (isImg) return (
                      <div style={{marginTop:8}}>
                        <img src={url} alt={card.titre} style={{maxWidth:'100%',borderRadius:8,border:'1px solid #e5e7eb'}} />
                      </div>
                    )
                    // PDF ou autre document : lien cliquable prominent
                    return (
                      <a href={url} target='_blank' rel='noreferrer'
                        style={{display:'flex',alignItems:'center',gap:8,marginTop:8,padding:'10px 14px',
                          background:'#EFF6FF',borderRadius:8,border:'1px solid #BFDBFE',
                          textDecoration:'none',color:'#1D4ED8',fontWeight:700,fontSize:14}}>
                        <span style={{fontSize:20}}>📄</span>
                        <span>Ouvrir le document ↗</span>
                      </a>
                    )
                  })()}
                </div>
              ))}
            </div>
          )
        })}

        {grouped.length === 0 && (
          <div className="empty">Aucune info ajoutée pour ce trip.</div>
        )}
      </div>
    </>
  )
}
