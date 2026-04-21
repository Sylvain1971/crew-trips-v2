'use client'
import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { apiUpsertConfig, apiDeleteTripFull } from '@/lib/api'
import { TripIcon } from '@/lib/tripIcons'
import { SvgIcon } from '@/lib/svgIcons'

// Le code admin est défini dans .env.local :
//   NEXT_PUBLIC_ADMIN_CODE=ton_code_secret
// Ne jamais hardcoder cette valeur ici.
const ADMIN_CODE = process.env.NEXT_PUBLIC_ADMIN_CODE ?? ''

interface TripAdmin {
  id: string; code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  created_at: string; createur_tel?: string; membres_count?: number
}

export default function AdminPage() {
  const router = useRouter()
  const [code, setCode] = useState('')
  const [auth, setAuth] = useState(false)
  const [trips, setTrips] = useState<TripAdmin[]>([])
  const [loading, setLoading] = useState(false)
  const [deleting, setDeleting] = useState<string | null>(null)
  const [erreur, setErreur] = useState('')
  const [creatorCode, setCreatorCode] = useState('')
  const [newCreatorCode, setNewCreatorCode] = useState('')
  const [savingCode, setSavingCode] = useState(false)
  const [codeSaved, setCodeSaved] = useState(false)
  const [showPwd, setShowPwd] = useState(false)

  function login() {
    // Phase 2 : vérif côté serveur via /api/admin/verify (le code n'est plus exposé au bundle client).
    // Fallback sur NEXT_PUBLIC_ADMIN_CODE pendant la transition si la route n'est pas encore déployée.
    (async () => {
      try {
        const res = await fetch('/api/admin/verify', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code }),
        })
        if (res.ok) {
          const { valid } = await res.json()
          if (valid) {
            setAuth(true); setErreur('')
            try { sessionStorage.setItem('crew-admin-authed', '1') } catch {}
            return
          }
          setErreur('Code incorrect')
          return
        }
      } catch {
        // Route pas dispo : fallback local
      }
      // Fallback local (à retirer après que /api/admin/verify soit en prod)
      if (!ADMIN_CODE) {
        setErreur('Code admin non configuré')
        return
      }
      if (code === ADMIN_CODE) {
        setAuth(true); setErreur('')
        try { sessionStorage.setItem('crew-admin-authed', '1') } catch {}
      } else setErreur('Code incorrect')
    })()
  }

  useEffect(() => {
    if (!auth) return

    // Charger le code créateur
    supabase.from('config').select('value').eq('key', 'creator_code').single()
      .then(({ data }) => {
        const val = data?.value || ''
        setCreatorCode(val)
        setNewCreatorCode(val)
      })

    // Charger les trips avec count membres en une seule requête (corrige N+1)
    setLoading(true)
    supabase
      .from('trips')
      .select(`
        id, code, nom, type, destination, date_debut, date_fin, created_at, createur_tel,
        membres(count)
      `)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        if (!data) { setLoading(false); return }
        const enriched = data.map((t: any) => ({
          ...t,
          membres_count: t.membres?.[0]?.count ?? 0,
        }))
        setTrips(enriched)
        setLoading(false)
      })
  }, [auth])

  async function saveCreatorCode() {
    if (!newCreatorCode.trim()) return
    setSavingCode(true)
    // Phase 2 : utilise RPC upsert_config qui vérifie le creator_code actuel.
    // Si pas encore de creator_code défini (bootstrap), fallback sur l'ancien UPSERT direct.
    const res = await apiUpsertConfig(creatorCode, 'creator_code', newCreatorCode.trim())
    if (!res.success) {
      // Bootstrap : si la table config est vide (pas de creator_code actuel), la RPC refuse.
      // On fait alors un UPSERT direct (seule fois, la sécurité sera ajoutée plus tard).
      await supabase.from('config').upsert({ key: 'creator_code', value: newCreatorCode.trim() })
    }
    setCreatorCode(newCreatorCode.trim())
    setCodeSaved(true)
    setTimeout(() => setCodeSaved(false), 2000)
    setSavingCode(false)
  }

  async function supprimerTrip(trip: TripAdmin) {
    if (!confirm(`Supprimer "${trip.nom}" ?`)) return
    setDeleting(trip.id)
    // Phase 2 : RPC delete_trip_full. Exige un token admin du trip.
    // Pour ça, il faut d'abord générer un token pour l'admin sur ce trip.
    // Fallback sur DELETE direct si échec (RLS pas encore active).
    const del = await apiDeleteTripFull(trip.code, trip.id)
    if (!del.success) {
      // Fallback : DELETE direct (marche tant que RLS n'est pas active)
      await supabase.from('trips').delete().eq('id', trip.id)
    }
    setTrips(p => p.filter(t => t.id !== trip.id))
    setDeleting(null)
  }

  function fmt(d: string) {
    return new Date(d).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })
  }

  if (!auth) return (
    <main style={{ minHeight: '100dvh', background: 'var(--forest)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 24, position: 'relative' }}>
      <button onClick={() => router.push('/')} style={{ position: 'absolute', top: 20, left: 20, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 10, padding: '8px 14px', color: 'rgba(255,255,255,.7)', fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
        ← Accueil
      </button>
      <div style={{ width: '100%', maxWidth: 340, background: 'rgba(255,255,255,.06)', borderRadius: 20, padding: 28, border: '1px solid rgba(255,255,255,.1)' }}>
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <div style={{ fontSize: 40, marginBottom: 10 }}>🔐</div>
          <div style={{ fontWeight: 800, fontSize: 20, color: '#fff' }}>Admin Crew Trips</div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,.4)', marginTop: 6 }}>Accès restreint</div>
        </div>
        <div style={{ position: 'relative' }}>
          <input className="input" type={showPwd ? 'text' : 'password'} placeholder="Code d'accès admin"
            value={code} onChange={e => setCode(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && login()}
            style={{ background: 'rgba(255,255,255,.08)', border: `1.5px solid ${erreur ? '#f87171' : 'rgba(255,255,255,.15)'}`, color: '#fff', marginBottom: 10, textAlign: 'center', paddingRight: 44 }} />
          <button onClick={() => setShowPwd(p => !p)}
            style={{ position: 'absolute', right: 12, top: 13, background: 'none', border: 'none', cursor: 'pointer', color: 'rgba(255,255,255,.4)', padding: 0, lineHeight: 1 }}>
            {showPwd
              ? <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
              : <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
            }
          </button>
        </div>
        {erreur && <div style={{ color: '#fca5a5', fontSize: 13, textAlign: 'center', marginBottom: 10 }}>{erreur}</div>}
        <button className="btn" onClick={login} style={{ background: '#fff', color: 'var(--forest)', fontWeight: 700 }}>Entrer →</button>
      </div>
    </main>
  )

  return (
    <main style={{ minHeight: '100dvh', background: '#f5f0e8', padding: '20px 16px 60px' }}>
      <div style={{ maxWidth: 680, margin: '0 auto' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: 'var(--forest)', margin: 0 }}>Admin Crew Trips</h1>
            <div style={{ fontSize: 13, color: 'var(--text-3)', marginTop: 4 }}>{trips.length} trip{trips.length !== 1 ? 's' : ''} actif{trips.length !== 1 ? 's' : ''}</div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button onClick={() => router.push('/')} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>← Accueil</button>
            <a href="/admin/retrouver" style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer', textDecoration: 'none' }}>Retrouver un utilisateur</a>
            <button onClick={() => { setAuth(false); try { sessionStorage.removeItem('crew-admin-authed') } catch {} }} style={{ background: 'none', border: '1px solid var(--border)', borderRadius: 8, padding: '6px 12px', fontSize: 13, color: 'var(--text-2)', cursor: 'pointer' }}>Déconnexion</button>
          </div>
        </div>

        <div className="card" style={{ padding: '16px', marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, display:'inline-flex', alignItems:'center', gap:7 }}>
            <span style={{display:'inline-flex',color:'#B45309'}}><SvgIcon name="key" size={16} /></span> Code de création de trip
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 12, lineHeight: 1.5 }}>Ce code est requis pour créer un nouveau trip.</div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input className="input" type="text" placeholder="Définir un code secret…"
              value={newCreatorCode} onChange={e => setNewCreatorCode(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && saveCreatorCode()}
              style={{ flex: 1, fontSize: 14 }} />
            <button onClick={saveCreatorCode} disabled={savingCode || !newCreatorCode.trim()}
              style={{ padding: '0 16px', borderRadius: 10, border: 'none', background: 'var(--forest)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer', flexShrink: 0 }}>
              {codeSaved ? '✓ Sauvegardé' : 'Sauvegarder'}
            </button>
          </div>
          {creatorCode && (
            <div style={{ marginTop: 10, padding: '8px 12px', background: 'var(--sand)', borderRadius: 8, fontSize: 13, color: 'var(--text-2)' }}>
              Code actuel : <strong style={{ color: 'var(--forest)', letterSpacing: 1 }}>{creatorCode}</strong>
            </div>
          )}
        </div>

        {loading && <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-3)' }}>Chargement…</div>}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {trips.map(t => (
            <div key={t.id} className="card" style={{ padding: '14px 16px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, flexShrink: 0 }}><TripIcon type={t.type} size={36} /></div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nom}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display:'inline-flex', alignItems:'center', flexWrap:'wrap', gap:4 }}>
                    {t.destination && <><SvgIcon name="pin" size={11} /> <span>{t.destination}</span> <span>·</span> </>}
                    <SvgIcon name="users" size={11} /> <span>{t.membres_count} membre{(t.membres_count || 0) !== 1 ? 's' : ''}</span>
                    {t.date_debut && <> <span>·</span> <SvgIcon name="calendar" size={11} /> <span>{fmt(t.date_debut)}</span></>}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2, display:'inline-flex', alignItems:'center', flexWrap:'wrap', gap:4 }}>
                    <span>{fmt(t.created_at)}</span> <span>·</span> <code style={{ background: 'var(--sand)', padding: '1px 5px', borderRadius: 4 }}>{t.code}</code>
                    {t.createur_tel && <> <span>·</span> <SvgIcon name="phone" size={11} /> <span>{t.createur_tel.replace(/(\d{3})(\d{3})(\d{4})/, '$1 $2 $3')}</span></>}
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, flexShrink: 0 }}>
                  <a href={`/trip/${t.code}`} target="_blank" rel="noreferrer"
                    style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, fontWeight: 600, textDecoration: 'none', textAlign: 'center' }}>
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
            <div style={{display:'inline-flex',width:64,height:64,borderRadius:16,background:'rgba(107,114,128,.1)',color:'var(--text-3)',alignItems:'center',justifyContent:'center',marginBottom:12}}>
              <SvgIcon name="clipboard" size={32} />
            </div>
            Aucun trip actif.
          </div>
        )}
      </div>
    </main>
  )
}
