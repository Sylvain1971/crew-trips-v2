'use client'
import { useEffect, useState, use } from 'react'
import { TRIP_ICONS } from '@/lib/utils'
import { useTripSession } from '@/lib/useTripSession'
import JoinScreen from './JoinScreen'
import Infos from './Infos'
import Album from './Album'
import Membres from './Membres'

type Tab = 'infos' | 'album' | 'membres'

function NavIcon({ tab }: { tab: Tab }) {
  if (tab === 'infos') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/>
      <rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/>
    </svg>
  )
  if (tab === 'album') return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"/>
      <circle cx="12" cy="13" r="4"/>
    </svg>
  )
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/>
      <circle cx="9" cy="7" r="4"/>
      <path d="M23 21v-2a4 4 0 0 0-3-3.87"/>
      <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  )
}

export default function TripPage({ params: paramsPromise }: { params: Promise<{ code: string }> }) {
  const params = use(paramsPromise)
  const { trip, membre, autorises, loading, error, saveMembre, onTripUpdate } = useTripSession(params.code)
  const [tab, setTab] = useState<Tab>('infos')

  // Enregistrer le Service Worker + pointer le manifest vers ce trip (install PWA)
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return
    navigator.serviceWorker.register('/sw.js').catch(() => {})
    const existing = document.querySelector('link[rel="manifest"]')
    if (existing) existing.setAttribute('href', `/trip/${params.code}/manifest`)
    else {
      const link = document.createElement('link')
      link.rel = 'manifest'
      link.href = `/trip/${params.code}/manifest`
      document.head.appendChild(link)
    }
  }, [params.code])

  if (loading) return (
    <div style={{ minHeight: '100dvh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--forest)' }}>
      <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>Chargement…</div>
    </div>
  )

  if (error || !trip) return (
    <div style={{ minHeight: '100dvh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 14, padding: 24, textAlign: 'center', background: 'var(--forest)' }}>
      <span style={{ fontSize: 52 }}>🔍</span>
      <div style={{ fontWeight: 700, fontSize: 20, color: '#fff' }}>Trip introuvable</div>
      <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 14 }}>Ce lien ne correspond à aucun trip actif.</div>
      <a href="/mes-trips" style={{ marginTop: 12, display: 'inline-flex', alignItems: 'center', gap: 8,
        background: 'rgba(255,255,255,.15)', border: '1.5px solid rgba(255,255,255,.25)',
        borderRadius: 10, padding: '10px 20px', fontSize: 14, fontWeight: 600,
        color: '#fff', textDecoration: 'none' }}>← Mes trips</a>
    </div>
  )

  if (!membre) return <JoinScreen trip={trip} autorises={autorises} onJoin={saveMembre} />

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100dvh', background: 'var(--sand)' }}>
      {tab !== 'infos' && (
        <div style={{ background: 'var(--forest)', padding: '12px 16px 10px', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          <a href="/mes-trips"
            style={{ background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 8, padding: '6px 10px',
              color: 'rgba(255,255,255,.7)', fontSize: 12, cursor: 'pointer', textDecoration: 'none', flexShrink: 0,
              display: 'flex', alignItems: 'center', gap: 4 }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 12H5M12 5l-7 7 7 7"/>
            </svg>
            Mes trips
          </a>
          <span style={{ fontSize: 20 }}>{TRIP_ICONS[trip.type] || '🏕'}</span>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
              {trip.nom}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,.1)', padding: '5px 10px', borderRadius: 20, flexShrink: 0 }}>
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: membre.couleur }} />
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,.8)' }}>{membre.prenom}</span>
            {membre.is_createur && <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)' }}>★</span>}
          </div>
        </div>
      )}

      <div style={{ flex: 1, overflow: tab === 'album' ? 'hidden' : 'auto', display: 'flex', flexDirection: 'column' }}>
        {tab === 'infos' && <Infos trip={trip} membre={membre} onTripUpdate={onTripUpdate} />}
        {tab === 'album' && <Album tripId={trip.id} trip={trip} membre={membre} />}
        {tab === 'membres' && <Membres trip={trip} membre={membre} onTripUpdate={onTripUpdate} />}
      </div>

      <nav className="bottom-nav">
        {(['infos', 'album', 'membres'] as Tab[]).map(t => (
          <button key={t} className={`nav-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            <NavIcon tab={t} />
            {t === 'infos' ? 'Infos' : t === 'album' ? 'Album' : 'Groupe'}
          </button>
        ))}
      </nav>
    </div>
  )
}
