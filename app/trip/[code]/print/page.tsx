'use client'
import { useEffect, useState, use } from 'react'
import { supabase } from '@/lib/supabase'
import { CATEGORIES, getCat } from '@/lib/types'
import { getCatLabel, getLodgeLabel } from '@/lib/utils'
import type { Trip, InfoCard } from '@/lib/types'

const CAT_ORDER = ['transport','lodge','permis','equipement','infos','itineraire','meteo','resto','liens']

export default function PrintPage({ params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = use(paramsPromise)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [cards, setCards] = useState<InfoCard[]>([])
  const [ready, setReady] = useState(false)

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
    }
    load()
  }, [params.code])

  useEffect(() => {
    if (ready) {
      // Auto-print seulement sur desktop — jamais sur mobile
      const isMobile = /iphone|ipad|ipod|android/i.test(navigator.userAgent)
      if (!isMobile) setTimeout(() => window.print(), 800)
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
        body { font-family: -apple-system, BlinkMacSystemFont, 'Helvetica Neue', Arial, sans-serif; background: #fff; color: #111; }
        @media print {
          @page { 
            margin: 8mm 10mm; 
            size: auto;
          }
          html { height: auto !important; }
          body { 
            -webkit-print-color-adjust: exact; 
            print-color-adjust: exact;
            height: auto !important;
            overflow: visible !important;
          }
          .no-print { display: none !important; }
          a { color: inherit; }
          .wrap { padding: 0 0 20px !important; }
          .card { page-break-inside: avoid !important; break-inside: avoid !important; }
          .section { page-break-inside: avoid !important; break-inside: avoid !important; }
          .lodge-box { page-break-inside: avoid !important; break-inside: avoid !important; }
          .header { page-break-inside: avoid !important; break-inside: avoid !important; }
        }
        .back-btn { position: fixed; top: 16px; left: 16px; background: #0F2D0F; color: #fff; border: none; border-radius: 10px; padding: 10px 16px; font-size: 14px; font-weight: 700; cursor: pointer; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,.2); display: none; align-items: center; gap: 6px; }
        .print-btn { position: fixed; top: 16px; right: 16px; background: #0F2D0F; color: #fff; border: none; border-radius: 10px; padding: 10px 18px; font-size: 14px; font-weight: 700; cursor: pointer; z-index: 100; box-shadow: 0 4px 12px rgba(0,0,0,.2); display: none; }
        .share-tip { display: none; }
        @media (max-width: 768px) {
          .back-btn { display: flex; }
          .print-btn { display: none !important; }
          .share-tip { display: block; }
        }
        @media (min-width: 769px) {
          .print-btn { display: flex; align-items: center; gap: 8px; }
        }
        .wrap { max-width: 680px; margin: 0 auto; padding: 60px 0 140px; }
        .header { background: #0F2D0F; color: #fff; padding: 24px 28px 20px; border-radius: 0 0 12px 12px; margin-bottom: 24px; }
        .trip-title { font-size: 26px; font-weight: 800; letter-spacing: -.02em; margin-bottom: 4px; }
        .trip-sub { font-size: 13px; color: rgba(255,255,255,.65); margin-bottom: 10px; }
        .trip-link { font-size: 12px; color: rgba(255,255,255,.45); word-break: break-all; }
        .trip-link a { color: rgba(255,255,255,.7); }
        .lodge-box { border: 1.5px solid #e5e7eb; border-radius: 10px; padding: 16px 18px; margin-bottom: 20px; background: #f9fafb; }
        .lodge-title { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 12px; text-transform: uppercase; letter-spacing: .05em; }
        .lodge-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .lodge-item { background: #fff; border: 1px solid #e5e7eb; border-radius: 8px; padding: 8px 12px; }
        .lodge-label { font-size: 10px; font-weight: 700; color: #9ca3af; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 2px; }
        .lodge-val { font-size: 13px; font-weight: 600; color: #111; word-break: break-all; }
        .section { margin-bottom: 20px; }
        .section-title { display: flex; align-items: center; gap: 8px; font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; border-bottom: 1.5px solid #e5e7eb; padding-bottom: 6px; margin-bottom: 10px; }
        .card { border: 1px solid #e5e7eb; border-radius: 8px; padding: 12px 14px; margin-bottom: 8px; border-left-width: 3px; page-break-inside: avoid; break-inside: avoid; }
        .card-title { font-size: 14px; font-weight: 700; color: #111; margin-bottom: 4px; }
        .card-content { font-size: 13px; color: #374151; line-height: 1.55; margin-bottom: 5px; white-space: pre-wrap; }
        .card-link { font-size: 15px; color: #2563eb; word-break: break-all; display: block; margin-top: 6px; padding: 4px 0; }
        .empty { text-align: center; color: #9ca3af; padding: 40px 0; font-size: 14px; }
      `}</style>

      <button className="no-print back-btn" onClick={() => window.close()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M19 12H5M12 5l-7 7 7 7"/>
        </svg>
        Retour
      </button>
      <button className="no-print print-btn" onClick={() => window.print()}>
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 9V3h12v6"/><path d="M6 18v3h12v-3"/>
          <rect x="2" y="9" width="20" height="9" rx="2"/>
        </svg>
        Imprimer / PDF
      </button>

      <div className="no-print share-tip"
        style={{position:'fixed',bottom:0,left:0,right:0,background:'#fff',
          borderTop:'1px solid #e5e7eb',padding:'16px 20px',zIndex:100,
          display:'flex',flexDirection:'column',gap:10,alignItems:'stretch'}}>
        <button
          onClick={()=>{
            if(navigator.share){
              navigator.share({title:document.title,url:window.location.href})
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
      </div>

      <div className="wrap">
        <div className="header">
          <div className="trip-title">{trip.nom}</div>
          {(trip.destination || dateDebut) && (
            <div className="trip-sub">
              {trip.destination && <span>📍 {trip.destination}</span>}
              {trip.destination && dateDebut && <span style={{ margin: '0 8px' }}>·</span>}
              {dateDebut && <span>📅 {dateDebut}{dateFin ? ` → ${dateFin}` : ''}</span>}
            </div>
          )}
          <div className="trip-link">🔗 <a href={tripUrl}>{tripUrl}</a></div>
        </div>

        {(trip.lodge_nom || trip.lodge_adresse || trip.lodge_tel || trip.lodge_wifi || trip.lodge_arrivee || trip.lodge_code) && (
          <div className="lodge-box">
            <div className="lodge-title">{getLodgeLabel(trip.type).icon} {getLodgeLabel(trip.type).label}</div>
            <div className="lodge-grid">
              {trip.lodge_nom && <div className="lodge-item"><div className="lodge-label">🏠 Nom</div><div className="lodge-val">{trip.lodge_nom}</div></div>}
              {trip.lodge_adresse && <div className="lodge-item"><div className="lodge-label">📍 Adresse</div><div className="lodge-val">{trip.lodge_adresse}</div></div>}
              {trip.lodge_tel && <div className="lodge-item"><div className="lodge-label">📞 Téléphone</div><div className="lodge-val"><a href={`tel:${trip.lodge_tel}`}>{trip.lodge_tel}</a></div></div>}
              {trip.lodge_wifi && <div className="lodge-item"><div className="lodge-label">📶 WiFi</div><div className="lodge-val">{trip.lodge_wifi}</div></div>}
              {trip.lodge_arrivee && <div className="lodge-item"><div className="lodge-label">🛬 Arrivée</div><div className="lodge-val">{trip.lodge_arrivee}</div></div>}
              {trip.lodge_code && <div className="lodge-item"><div className="lodge-label">🛫 Départ</div><div className="lodge-val">{trip.lodge_code}</div></div>}
            </div>
          </div>
        )}

        {grouped.map(({ catId, cards: catCards }) => {
          const cat = getCat(catId)
          const def = CATEGORIES.find(c => c.id === catId)
          return (
            <div key={catId} className="section">
              <div className="section-title" style={{ color: def?.color || '#6b7280' }}>
                <span>{cat.icon}</span>{getCatLabel(catId, '') || cat.label}
              </div>
              {catCards.map(card => (
                <div key={card.id} className="card" style={{ borderLeftColor: def?.color || '#e5e7eb' }}>
                  <div className="card-title">{card.titre}</div>
                  {card.contenu && <div className="card-content">{card.contenu}</div>}
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
