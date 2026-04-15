'use client'
import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabase'
import { TRIP_ICONS } from '@/lib/utils'

const ADMIN_CODE = 'CT2026admin'

interface TripAdmin {
  id: string
  code: string
  nom: string
  type: string
  destination?: string
  date_debut?: string
  date_fin?: string
  created_at: string
  membres_count?: number
}

export default function AdminPage() {
  const [code, setCode] = useState('')
  const [auth, setAuth] = useState(false)
  const [trips, setTrips] = useState<TripAdmin[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [erreur, setErreur] = useState('')

  function login() {
    if (code === ADMIN_CODE) { setAuth(true); setErreur('') }
    else setErreur('Code incorrect')
  }

  useEffect(() => {
    if (!auth) return
    setLoading(true)
    supabase.from('trips').select('*').order('created_at', { ascending: false })
      .then(async ({ data }) => {
        if (!data) { setLoading(false); return }
        // Charger le nb de membres pour chaque trip
        const enriched = await Promise.all(data.map(async (t) => {
          const { count } = await supabase.from('membres').select('*', { count: 'exact', head: true }).eq('trip_id', t.id)
          return { ...t, membres_count: count || 0 }
        }))
        setTrips(enriched)
        setLoading(false)
      })
  }, [auth])

  async function supprimerTrip(trip: TripAdmin) {
    if (!confirm(`Supprimer "${trip.nom}" ? Cette action est irréversible.`)) return
    setDeleting(trip.id)
    await supabase.from('messages').delete().eq('trip_id', trip.id)
    await supabase.from('infos').delete().eq('trip_id', trip.id)
    await supabase.from('participants_autorises').delete().eq('trip_id', trip.id)
    await supabase.from('membres').delete().eq('trip_id', trip.id)
    await supabase.from('trips').delete().eq('id', trip.id)
    setTrips(p => p.filter(t => t.id !== trip.id))
    setDeleting(null)
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!auth) return (
    <main style={{ minHeight: '100dvh', background: 'var(--forest)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
      <div style={{ width: '100%', maxWidth: 340, background: 'rgba(255,255,255,.06)', borderRadius: 20, padding: 28, border: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>Admin Crew Trips</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginTop: 6 }}>Accès restreint</div>
        </div>
        <input
          className="input"
          type="password"
          placeholder="Code d'accès"
          value={code}
          onChange={e => setCode(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && login()}
          style={{ background: 'rgba(255,255,255,.08)', border: `1.5px solid ${erreur ? '#f87171' : 'rgba(255,255,255,.15)'}`, color: '#fff', marginBottom: 10, textAlign: 'center' }}
        />
        {erreur && <div style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>{erreur}</div>}
        <button className="btn" onClick={login} style={{ background: '#fff', color: 'var(--forest)', fontWeight: 700 }}>
          Entrer →
        </button>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100dvh', background: '#f5f0e8', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--forest)', margin: 0 }}>Admin Crew Trips</h1>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{trips.length} trip{trips.length > 1 ? 's' : ''} actif{trips.length > 1 ? 's' : ''}</div>
          </div>
          <button onClick={() => setAuth(false)} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>
            Déconnexion
          </button>
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Chargement…</div>}

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trips.map(t => (
            <div key={t.id} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ fontSize: 28, flexShrink: 0 }}>{TRIP_ICONS[t.type] || '🏕'}</div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>
                    {t.destination && <span>📍 {t.destination} · </span>}
                    <span>👥 {t.membres_count} membre{(t.membres_count || 0) > 1 ? 's' : ''}</span>
                    {t.date_debut && <span> · 📅 {fmt(t.date_debut)}</span>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
                    Créé le {fmt(t.created_at)} · code: <code style={{ background: 'var(--sand)', padding: '1px 5px', borderRadius: 4 }}>{t.code}</code>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <a href={`/trip/${t.code}`} target="_blank" rel="noreferrer"
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, cursor: 'pointer', textDecoration: 'none', textAlign: 'center' }}>
                    Ouvrir ↗
                  </a>
                  <button onClick={() => supprimerTrip(t)} disabled={deleting === t.id}
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid #FECACA', background: '#FEF2F2', color: '#DC2626', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>
                    {deleting === t.id ? '…' : 'Supprimer'}
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>

        {!loading && trips.length === 0 && (
          <div style={{ textAlign: 'center', padding: 60, color: 'var(--text-3)' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
            Aucun trip actif en base de données.
          </div>
        )}
      </div>
    </main>
  )
}
