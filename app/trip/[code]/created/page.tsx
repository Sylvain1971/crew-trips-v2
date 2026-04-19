'use client'
import { useEffect, useState, use } from 'react'
import { supabase } from '@/lib/supabase'
import { TRIP_ICONS } from '@/lib/utils'
import { SvgIcon } from '@/lib/svgIcons'
import type { Trip } from '@/lib/types'

export default function CreatedPage({ params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = use(paramsPromise)
  const [trip, setTrip] = useState<Trip | null>(null)
  const [copied, setCopied] = useState(false)
  const [origin, setOrigin] = useState('https://crew-trips-v2.vercel.app')

  useEffect(() => {
    setOrigin(window.location.origin)
    supabase.from('trips').select('*').eq('code', params.code).single()
      .then(({ data }) => { if (data) setTrip(data) })
    // Fix PWA — pointer le manifest vers ce trip spécifique
    const existing = document.querySelector('link[rel="manifest"]')
    if (existing) existing.setAttribute('href', `/trip/${params.code}/manifest`)
    else {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = `/trip/${params.code}/manifest`
      document.head.appendChild(link)
    }
    // Sauvegarder comme dernier trip
    try { localStorage.setItem('crew-last-trip', params.code) } catch {}
  }, [params.code])

  const url = `${origin}/trip/${params.code}`

  function copy() {
    navigator.clipboard.writeText(url)
    setCopied(true)
    setTimeout(() => setCopied(false), 2500)
  }

  function share() {
    if (navigator.share) navigator.share({ title: trip?.nom || 'Crew Trips', url })
    else copy()
  }

  const icon = TRIP_ICONS[trip?.type || 'autre'] || '🏕'
  const dateDebut = trip?.date_debut
    ? new Date(trip.date_debut + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''
  const dateFin = trip?.date_fin
    ? new Date(trip.date_fin + 'T00:00:00').toLocaleDateString('fr-CA', { day: 'numeric', month: 'long', year: 'numeric' })
    : ''

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--forest)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '32px 20px' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>

        <div style={{ width: 72, height: 72, borderRadius: '50%', background: 'rgba(255,255,255,.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#6EE7B7', marginBottom: 16 }}>
          <SvgIcon name="check" size={36} />
        </div>

        <h1 style={{ fontFamily:'var(--font-brand), Georgia, serif', color: '#fff', fontSize: 20, fontWeight: 700, margin: '0 0 6px', letterSpacing: '-.02em', lineHeight: 1 }}>Trip créé</h1>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 500, marginBottom: 18 }}>Prêt à partager</div>
        <div style={{ color: 'rgba(255,255,255,.6)', fontSize: 14, textAlign: 'center', lineHeight: 1.5, marginBottom: 28 }}>
          {icon} {trip?.nom || '…'}
          {dateDebut && <><br /><span style={{ fontSize: 12 }}>{dateDebut}{dateFin ? ` → ${dateFin}` : ''}</span></>}
        </div>

        {/* Lien cliquable */}
        <a href={url} style={{ display: 'block', width: '100%', background: 'rgba(255,255,255,.08)', borderRadius: 14, padding: '14px 16px', border: '1.5px solid rgba(255,255,255,.15)', textDecoration: 'none', marginBottom: 10, boxSizing: 'border-box' }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,.4)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 6, display:'inline-flex', alignItems:'center', gap:5 }}>
            <SvgIcon name="link" size={11} /> Lien du trip — appuyez pour ouvrir
          </div>
          <div style={{ fontSize: 13, color: '#6EE7B7', fontFamily: 'monospace', wordBreak: 'break-all', fontWeight: 600 }}>
            {url}
          </div>
        </a>

        {/* Boutons partage */}
        <div style={{ display: 'flex', gap: 10, width: '100%', marginBottom: 24 }}>
          <button onClick={copy} style={{ flex: 1, padding: '12px', borderRadius: 12, border: '1.5px solid rgba(255,255,255,.2)', background: copied ? 'rgba(255,255,255,.2)' : 'rgba(255,255,255,.08)', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', display:'inline-flex', alignItems:'center', justifyContent:'center', gap:6 }}>
            {copied ? <><SvgIcon name="check" size={14} />Copié !</> : <><SvgIcon name="clipboard" size={14} />Copier</>}
          </button>
          <button onClick={share} style={{ flex: 1, padding: '12px', borderRadius: 12, border: 'none', background: '#fff', color: 'var(--forest)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>
            ↗ Partager
          </button>
        </div>

        {/* Instructions install */}
        <div style={{ width: '100%', background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: '16px', border: '1px solid rgba(255,255,255,.1)', boxSizing: 'border-box' }}>
          <div style={{ fontWeight: 700, fontSize: 13, color: '#fff', marginBottom: 10, display:'inline-flex', alignItems:'center', gap:6 }}>
            <SvgIcon name="phone" size={14} /> Installer sur l&apos;écran d&apos;accueil
          </div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', lineHeight: 1.9 }}>
            1. Appuyez sur <strong style={{ color: 'rgba(255,255,255,.9)' }}>Partager ⬆</strong> en bas de Safari<br />
            2. <strong style={{ color: 'rgba(255,255,255,.9)' }}>Ajouter à l'écran d'accueil</strong><br />
            3. <strong style={{ color: 'rgba(255,255,255,.9)' }}>Ajouter</strong> en haut à droite
          </div>
          <div style={{ marginTop: 10, padding: '8px 12px', background: 'rgba(250,204,21,.08)', borderRadius: 8, border: '1px solid rgba(250,204,21,.2)', fontSize: 11, color: 'rgba(250,204,21,.9)', lineHeight: 1.5, display:'inline-flex', alignItems:'flex-start', gap:6 }}>
            <span style={{flexShrink:0,marginTop:1}}><SvgIcon name="alert" size={12} /></span>
            <span>Installez depuis cette page — l&apos;app s&apos;ouvrira directement sur ce trip.</span>
          </div>
        </div>

      </div>
    </main>
  )
}
