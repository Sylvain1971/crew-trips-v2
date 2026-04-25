'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { supabase } from '@/lib/supabase'
import { TripIcon } from '@/lib/tripIcons'
import { SvgIcon } from '@/lib/svgIcons'
import { hashNip, isValidNip, normalizeTel } from '@/lib/types'
import {
  apiRegisterIdentity,
  apiGetInvitationsEnAttente,
  apiRegisterFromInvitation,
  type InvitationEnAttente,
} from '@/lib/api'

interface TripDB {
  code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  role: 'createur' | 'participant'
}

// États possibles de la page :
// - 'checking'        : on vérifie le localStorage au mount (flash de chargement)
// - 'create-identity' : pas de verrou => on affiche le formulaire de création d'identité
// - 'authorized'      : verrou présent => on charge et affiche les trips + invitations
type PageState = 'checking' | 'create-identity' | 'authorized'

// Utilitaire d'affichage téléphone 418 540 1302
function formatTel(val: string): string {
  const d = val.replace(/\D/g, '').slice(0, 10)
  if (d.length <= 3) return d
  if (d.length <= 6) return `${d.slice(0, 3)} ${d.slice(3)}`
  return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`
}

function fmtDate(d?: string) {
  if (!d) return ''
  return new Date(d + 'T00:00:00').toLocaleDateString('fr-CA', {
    day: 'numeric', month: 'short', year: 'numeric',
  })
}

export default function MesTripsPage() {
  const router = useRouter()

  // --- Identité stockée en localStorage ---
  const [tel, setTel] = useState('')
  const [prenomStored, setPrenomStored] = useState('')
  const [nomStored, setNomStored] = useState('')

  // --- Trips actifs ---
  const [trips, setTrips] = useState<TripDB[]>([])
  const [loading, setLoading] = useState(false)
  const [cherche, setCherche] = useState(false)

  // --- Invitations en attente ---
  const [invitations, setInvitations] = useState<InvitationEnAttente[]>([])
  const [invitLoading, setInvitLoading] = useState(false)
  const [joiningId, setJoiningId] = useState<string | null>(null)
  const [joinError, setJoinError] = useState<string | null>(null)
  // Nom du trip en cours d'inscription (pour l'overlay "Inscription en cours…")
  const [joiningTripName, setJoiningTripName] = useState<string | null>(null)

  // --- État de la page ---
  const [pageState, setPageState] = useState<PageState>('checking')
  // Détecter si on est dans la PWA installée (mode standalone iOS/Android).
  // Important car iOS isole le localStorage entre Safari et la PWA
  // installée — un utilisateur deja authentifie dans Safari apparait
  // comme non-identifie dans la PWA au premier lancement.
  const [isStandalone, setIsStandalone] = useState(false)

  // -----------------------------------------------------------------
  // Chargement des trips existants par téléphone
  // -----------------------------------------------------------------
  const charger = useCallback(async (numero: string) => {
    const digits = numero.replace(/\D/g, '')
    if (digits.length < 10) return
    setLoading(true); setCherche(true)

    const { data: tripsCreateur } = await supabase.from('trips')
      .select('code,nom,type,destination,date_debut,date_fin')
      .eq('createur_tel', digits)
      .order('created_at', { ascending: false })

    const { data: membresParticipant } = await supabase.from('membres')
      .select('trip_id, is_createur')
      .eq('tel', digits)
      .eq('is_createur', false)

    let tripsParticipant: TripDB[] = []
    if (membresParticipant && membresParticipant.length > 0) {
      const tripIds = membresParticipant.map((m: { trip_id: string }) => m.trip_id)
      const { data: tripsData } = await supabase.from('trips')
        .select('code,nom,type,destination,date_debut,date_fin')
        .in('id', tripIds)
        .order('created_at', { ascending: false })
      tripsParticipant = (tripsData || []).map((t: Omit<TripDB, 'role'>) => ({
        ...t, role: 'participant' as const,
      }))
    }

    const codesCreateur = new Set((tripsCreateur || []).map((t: { code: string }) => t.code))
    const creeateurs: TripDB[] = (tripsCreateur || []).map((t: Omit<TripDB, 'role'>) => ({
      ...t, role: 'createur' as const,
    }))
    const participants: TripDB[] = tripsParticipant.filter(t => !codesCreateur.has(t.code))

    setTrips([...creeateurs, ...participants])
    setLoading(false)
  }, [])

  // -----------------------------------------------------------------
  // Chargement des invitations en attente (appelé à chaque visite)
  // -----------------------------------------------------------------
  const chargerInvitations = useCallback(async (prenom: string, nom: string, telValue: string) => {
    if (!prenom || !nom) return
    setInvitLoading(true)
    const digits = normalizeTel(telValue)
    const r = await apiGetInvitationsEnAttente(prenom, nom, digits || null)
    setInvitLoading(false)
    if (r.success && r.invitations) {
      setInvitations(r.invitations)
    } else {
      setInvitations([])
    }
  }, [])

  // -----------------------------------------------------------------
  // Init : lire localStorage, détecter standalone, charger les données
  // -----------------------------------------------------------------
  useEffect(() => {
    try {
      const standalone =
        window.matchMedia?.('(display-mode: standalone)').matches ||
        (window.navigator as { standalone?: boolean }).standalone === true
      setIsStandalone(!!standalone)

      // Verrou : si une identité a été validée précédemment, on affiche les trips
      let locked = localStorage.getItem('crew-tel-locked')

      // Migration transparente : si l'utilisateur avait déjà un tel enregistré
      // (ancienne logique avant le verrou), on le promeut automatiquement pour
      // ne pas éjecter les utilisateurs existants au déploiement.
      if (!locked) {
        const oldTel = localStorage.getItem('crew-tel')
        if (oldTel && oldTel.replace(/\D/g, '').length === 10) {
          localStorage.setItem('crew-tel-locked', oldTel)
          locked = oldTel
        }
      }

      if (locked) {
        const savedPrenom = localStorage.getItem('crew-prenom') || ''
        const savedNom = localStorage.getItem('crew-nom') || ''
        setTel(locked)
        setPrenomStored(savedPrenom)
        setNomStored(savedNom)
        setPageState('authorized')
        charger(locked)
        // Les invitations utilisent prénom+nom. Si on les a pas (utilisateur
        // migré avec seulement un tel), on saute silencieusement.
        if (savedPrenom && savedNom) {
          chargerInvitations(savedPrenom, savedNom, locked)
        }
      } else {
        setPageState('create-identity')
      }
    } catch {
      setPageState('create-identity')
    }
  }, [charger, chargerInvitations])

  // -----------------------------------------------------------------
  // Action : rejoindre un trip depuis une invitation
  // -----------------------------------------------------------------
  async function rejoindreInvitation(inv: InvitationEnAttente) {
    setJoiningId(inv.trip_id); setJoinError(null)
    // Afficher l'overlay IMMÉDIATEMENT (masque le flash entre fin API et navigation)
    setJoiningTripName(inv.trip_nom)

    const digits = normalizeTel(tel)
    const nipHash = localStorage.getItem('crew-nip-hash') || ''
    if (!nipHash) {
      setJoinError('NIP manquant. Veuillez ressaisir votre identité.')
      setJoiningId(null)
      setJoiningTripName(null)
      return
    }

    const result = await apiRegisterFromInvitation(
      inv.trip_id, inv.trip_code, prenomStored, nomStored, digits, nipHash,
    )

    if (!result.success) {
      setJoinError(result.message || "Erreur d'inscription. Réessayez.")
      setJoiningId(null)
      setJoiningTripName(null)
      return
    }
    // Succès : redirection IMMÉDIATE.
    // On NE filtre PAS l'invitation localement (causait flash "aucun trip").
    // L'overlay reste affiché jusqu'à la navigation. Le retour sur /mes-trips
    // re-fetchera naturellement la liste à jour via useEffect.
    router.push(`/trip/${inv.trip_code}`)
  }

  // =====================================================
  // Rendu : 3 états
  // =====================================================

  // État 1 : chargement initial (flash court le temps de lire localStorage).
  // Logo Crew Trips avec pulsation douce — meilleure perception de marque
  // que le texte "Chargement…" pendant les ~500ms-1s de transition.
  if (pageState === 'checking') {
    return (
      <main style={{
        minHeight: '100dvh',
        background: 'var(--forest)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}>
        <style>{`
          @keyframes crewLoaderPulse {
            0%, 100% { opacity: 0.7; transform: scale(0.97); }
            50% { opacity: 1; transform: scale(1); }
          }
          @keyframes crewLoaderFadeIn {
            from { opacity: 0; }
            to { opacity: 1; }
          }
        `}</style>
        <div style={{
          animation: 'crewLoaderFadeIn 0.3s ease-out both, crewLoaderPulse 1.4s ease-in-out 0.3s infinite',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}>
          <Image
            src="/logo-hero.webp"
            alt="Crew Trips"
            width={120}
            height={120}
            priority
          />
        </div>
      </main>
    )
  }

  // État 2 : pas d'identité sur cet appareil — formulaire de création
  if (pageState === 'create-identity') {
    return (
      <CreateIdentityScreen
        router={router}
        isStandalone={isStandalone}
        onSuccess={(p, n, telFmt) => {
          setPrenomStored(p)
          setNomStored(n)
          setTel(telFmt)
          setPageState('authorized')
          charger(telFmt)
          chargerInvitations(p, n, telFmt)
        }}
      />
    )
  }

  // État 3 : autorisé — trips + invitations
  return (
    <main style={{ minHeight: '100dvh', background: 'var(--forest)', display: 'flex', flexDirection: 'column' }}>

      {/* Overlay "Inscription en cours…" — masque le flash entre la fin de
          register_from_invitation et la navigation vers /trip/[code]. Logo
          Crew Trips animé pour cohérence avec les loaders /install et /nouveau. */}
      {joiningTripName && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--forest)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
        }}>
          <style>{`
            @keyframes crewLoaderPulse {
              0%, 100% { opacity: 0.7; transform: scale(0.97); }
              50% { opacity: 1; transform: scale(1); }
            }
            @keyframes crewLoaderFadeIn {
              from { opacity: 0; }
              to { opacity: 1; }
            }
          `}</style>
          <div style={{
            animation: 'crewLoaderFadeIn 0.3s ease-out both, crewLoaderPulse 1.4s ease-in-out 0.3s infinite',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
          }}>
            <Image src="/logo-hero.webp" alt="Crew Trips" width={120} height={120} priority />
            <div style={{
              color: 'rgba(255,255,255,.85)',
              fontSize: 15,
              fontWeight: 500,
              textAlign: 'center',
              maxWidth: 280,
              lineHeight: 1.4,
            }}>
              Inscription en cours…
              <div style={{
                fontSize: 13,
                color: 'rgba(255,255,255,.55)',
                marginTop: 4,
                fontWeight: 400,
              }}>
                {joiningTripName}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div style={{ background: 'var(--forest)', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <button onClick={() => router.push('/')}
          style={{ position: 'absolute', top: 16, left: 20, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 10, padding: '8px 12px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
          ← Retour
        </button>
        <div style={{ marginBottom: 4 }}>
          <Image src="/logo-hero.webp" alt="Crew Trips" width={90} height={90} />
        </div>
        <div style={{ fontFamily: 'var(--font-brand), Georgia, serif', fontWeight: 700, fontSize: 20, color: '#fff', letterSpacing: '-.02em', lineHeight: 1, marginBottom: 6 }}>Crew Trips</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 500 }}>Mes trips</div>
      </div>

      <div style={{ flex: 1, padding: '16px 20px 40px' }}>
        {/* Identité verrouillée */}
        <div style={{ maxWidth: 420, margin: '0 auto 24px' }}>
          <label style={{ color: 'rgba(255,255,255,.5)', textAlign: 'center', display: 'block', fontSize: 10, fontWeight: 600, letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 6 }}>
            🔒 Identité verrouillée sur cet appareil
          </label>
          <div style={{
            background: 'rgba(255,255,255,.04)',
            border: '1.5px solid rgba(255,255,255,.15)',
            borderRadius: 10,
            padding: '14px 16px',
            color: 'rgba(255,255,255,.8)',
            fontSize: 15,
            textAlign: 'center',
            fontWeight: 600,
            lineHeight: 1.4,
          }}>
            {(prenomStored || nomStored) && (
              <div style={{ marginBottom: 4 }}>
                {prenomStored} {nomStored}
              </div>
            )}
            <div style={{ fontSize: 14, color: 'rgba(255,255,255,.55)', letterSpacing: 1, fontWeight: 500 }}>
              {tel}
            </div>
          </div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,.45)', marginTop: 6, textAlign: 'center', lineHeight: 1.5 }}>
            Pour des raisons de sécurité, un appareil est lié à un seul participant.
          </div>
        </div>

        {/* Section invitations en attente */}
        {invitations.length > 0 && (
          <InvitationsSection
            invitations={invitations}
            joiningId={joiningId}
            joinError={joinError}
            onRejoindre={rejoindreInvitation}
            fmtDate={fmtDate}
          />
        )}

        {/* Loader invitations seulement au premier chargement */}
        {invitLoading && invitations.length === 0 && (
          <div style={{ maxWidth: 420, margin: '0 auto 16px', textAlign: 'center', color: 'rgba(255,255,255,.3)', fontSize: 12 }}>
            Recherche d&apos;invitations…
          </div>
        )}

        {/* Liste des trips */}
        <div style={{ maxWidth: 420, margin: '0 auto' }}>
          {trips.length > 0 && (
            <div style={{
              fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.5)',
              letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4,
            }}>
              ✅ Mes trips ({trips.length})
            </div>
          )}

          {loading && (
            <div style={{ textAlign: 'center', color: 'rgba(255,255,255,.4)', fontSize: 14, padding: 32 }}>
              Chargement…
            </div>
          )}

          {!loading && cherche && trips.length === 0 && invitations.length === 0 && (
            <div style={{ textAlign: 'center', padding: 40 }}>
              <div style={{ display: 'inline-flex', width: 72, height: 72, borderRadius: 16, background: 'rgba(255,255,255,.08)', color: 'rgba(255,255,255,.5)', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
                <SvgIcon name="clipboard" size={36} />
              </div>
              <div style={{ color: 'rgba(255,255,255,.5)', fontSize: 14, marginBottom: 16 }}>
                Vous n&apos;avez aucun trip pour l&apos;instant.
              </div>
              <button onClick={() => router.push('/nouveau')}
                style={{
                  padding: '12px 20px', borderRadius: 12, border: 'none',
                  background: '#fff', color: 'var(--forest)', fontWeight: 700, fontSize: 14, cursor: 'pointer',
                }}>
                Créer un nouveau trip →
              </button>
            </div>
          )}

          {trips.map((t) => (
            <div key={t.code} className="card" style={{ marginBottom: 10, padding: '14px 16px', display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ flexShrink: 0, width: 56, height: 56 }}>
                <TripIcon type={t.type} size={56} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
                  <div style={{ fontWeight: 700, fontSize: 15, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.nom}</div>
                  {t.role === 'createur' && (
                    <span title="Admin" aria-label="Admin" style={{ color: '#F59E0B', display: 'inline-flex', flexShrink: 0 }}>
                      <SvgIcon name="star" size={13} />
                    </span>
                  )}
                </div>
                {t.destination && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}><SvgIcon name="pin" size={11} /> {t.destination}</div>}
                {t.date_debut && <div style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 1, display: 'inline-flex', alignItems: 'center', gap: 4 }}><SvgIcon name="calendar" size={11} /> {fmtDate(t.date_debut)}{t.date_fin ? ` → ${fmtDate(t.date_fin)}` : ''}</div>}
              </div>
              <button onClick={() => router.push(`/trip/${t.code}`)}
                style={{
                  padding: '8px 14px', borderRadius: 10, border: 'none', background: 'var(--forest)',
                  color: '#fff', fontWeight: 700, fontSize: 13, cursor: 'pointer', flexShrink: 0,
                }}>
                Ouvrir →
              </button>
            </div>
          ))}


        </div>
      </div>
    </main>
  )
}

/* ============================================================
 *  Sous-composant : Section "Invitations en attente"
 * ============================================================ */
function InvitationsSection({
  invitations,
  joiningId,
  joinError,
  onRejoindre,
  fmtDate,
}: {
  invitations: InvitationEnAttente[]
  joiningId: string | null
  joinError: string | null
  onRejoindre: (inv: InvitationEnAttente) => void
  fmtDate: (d?: string) => string
}) {
  return (
    <div style={{ maxWidth: 420, margin: '0 auto 24px' }}>
      <div style={{
        fontSize: 10, fontWeight: 600, color: '#F59E0B',
        letterSpacing: '.12em', textTransform: 'uppercase', marginBottom: 10, paddingLeft: 4,
      }}>
        🆕 Invitations en attente ({invitations.length})
      </div>

      {joinError && (
        <div style={{
          background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.3)',
          borderRadius: 10, padding: '10px 14px', marginBottom: 10,
        }}>
          <p style={{ fontSize: 12, color: '#fca5a5', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>{joinError}</p>
        </div>
      )}

      {invitations.map((inv) => {
        const isJoining = joiningId === inv.trip_id
        return (
          <div key={inv.trip_id}
            style={{
              marginBottom: 10, padding: '14px 16px',
              background: 'rgba(245,158,11,.08)',
              border: '1.5px solid rgba(245,158,11,.35)',
              borderRadius: 14,
            }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
              <div style={{ marginTop: 2 }} aria-hidden><TripIcon type={inv.trip_type} size={40} /></div>
              <div style={{ flex: 1, minWidth: 0, color: '#fff' }}>
                <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4, wordBreak: 'break-word' }}>{inv.trip_nom}</div>
                {inv.trip_destination && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.65)', marginBottom: 2, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <SvgIcon name="pin" size={11} /> {inv.trip_destination}
                  </div>
                )}
                {inv.trip_date_debut && (
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,.6)', display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                    <SvgIcon name="calendar" size={11} /> {fmtDate(inv.trip_date_debut)}{inv.trip_date_fin ? ` → ${fmtDate(inv.trip_date_fin)}` : ''}
                  </div>
                )}
              </div>
            </div>
            <button onClick={() => onRejoindre(inv)} disabled={isJoining || !!joiningId}
              style={{
                width: '100%', padding: '10px 16px', borderRadius: 10, border: 'none',
                background: isJoining ? 'rgba(245,158,11,.5)' : '#F59E0B',
                color: '#1a0f00', fontWeight: 700, fontSize: 13, cursor: isJoining ? 'default' : 'pointer',
                opacity: !isJoining && joiningId ? 0.5 : 1,
              }}>
              {isJoining ? 'Inscription…' : 'Rejoindre ce trip →'}
            </button>
          </div>
        )
      })}
    </div>
  )
}

/* ============================================================
 *  Sous-composant : Formulaire de création d'identité
 * ============================================================ */
function CreateIdentityScreen({
  router,
  isStandalone,
  onSuccess,
}: {
  router: ReturnType<typeof useRouter>
  isStandalone: boolean
  onSuccess: (prenom: string, nom: string, telFmt: string) => void
}) {
  const [prenom, setPrenom] = useState('')
  const [nom, setNom] = useState('')
  const [tel, setTel] = useState('')
  const [nip, setNip] = useState('')
  const [showNip, setShowNip] = useState(false)
  const [erreur, setErreur] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  // P4j5 : si l'inscription échoue avec un tel déjà associé à un autre NIP,
  // on charge les invitations pour récupérer le tel de l'admin du trip
  // et offrir un bouton SMS pré-rempli "Contacter l'admin".
  const [adminContacts, setAdminContacts] = useState<Array<{
    prenom: string | null
    tel: string
    tripNom: string
  }>>([])

  const telDigits = normalizeTel(tel)
  const telComplet = telDigits.length === 10
  const nipValide = isValidNip(nip)
  const canSubmit = prenom.trim().length > 0 && nom.trim().length > 0 && telComplet && nipValide && !loading

  async function onSubmit() {
    const prenomClean = prenom.trim()
    const nomClean = nom.trim()

    if (!prenomClean) { setErreur('Veuillez entrer votre prénom.'); return }
    if (!nomClean) { setErreur('Veuillez entrer votre nom de famille.'); return }
    if (!telComplet) { setErreur('Numéro de téléphone requis (10 chiffres).'); return }
    if (!nipValide) { setErreur('NIP requis (4 chiffres).'); return }

    setLoading(true); setErreur(null); setAdminContacts([])

    const nipHash = await hashNip(nip)
    const result = await apiRegisterIdentity(prenomClean, nomClean, telDigits, nipHash)

    if (!result.success) {
      setErreur(result.message || "Erreur lors de la validation de l'identité.")
      setLoading(false)
      // P4j5 : tenter de récupérer le tel de l'admin pour offrir un bouton SMS
      // (silencieux : si aucune invitation, on ne fait rien)
      try {
        const inv = await apiGetInvitationsEnAttente(prenomClean, nomClean, telDigits)
        if (inv.success && inv.invitations && inv.invitations.length > 0) {
          // Dédupliquer par tel (un même admin peut avoir plusieurs trips)
          const seenTels = new Set<string>()
          const contacts: Array<{ prenom: string | null; tel: string; tripNom: string }> = []
          for (const i of inv.invitations) {
            if (i.trip_createur_tel && !seenTels.has(i.trip_createur_tel)) {
              seenTels.add(i.trip_createur_tel)
              contacts.push({
                prenom: i.trip_createur_prenom,
                tel: i.trip_createur_tel,
                tripNom: i.trip_nom,
              })
            }
          }
          setAdminContacts(contacts)
        }
      } catch {
        // Silencieux
      }
      return
    }

    // Stocker dans localStorage : verrou + identité complète + hash NIP
    try {
      const telFmt = formatTel(telDigits)
      localStorage.setItem('crew-tel-locked', telFmt)
      localStorage.setItem('crew-tel', telFmt)
      localStorage.setItem('crew-prenom', prenomClean)
      localStorage.setItem('crew-nom', nomClean)
      localStorage.setItem('crew-nip-hash', nipHash)
      setLoading(false)
      onSuccess(prenomClean, nomClean, telFmt)
    } catch {
      setErreur('Impossible de sauvegarder votre identité sur cet appareil.')
      setLoading(false)
    }
  }

  const oeilBtn = (
    <button type="button" onClick={() => setShowNip(s => !s)}
      aria-label={showNip ? 'Masquer le NIP' : 'Afficher le NIP'}
      style={{
        position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)',
        background: 'none', border: 'none', cursor: 'pointer', padding: 6,
        color: 'rgba(255,255,255,.6)', display: 'flex', alignItems: 'center',
      }}>
      {showNip ? (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
          <line x1="1" y1="1" x2="23" y2="23" />
        </svg>
      ) : (
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  )

  const labelStyle: React.CSSProperties = {
    fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.5)',
    letterSpacing: '.12em', textTransform: 'uppercase',
    display: 'block', marginBottom: 5,
  }

  return (
    <main style={{ minHeight: '100dvh', background: 'var(--forest)', display: 'flex', flexDirection: 'column' }}>
      <div style={{ background: 'var(--forest)', padding: '16px 20px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', position: 'relative' }}>
        <button onClick={() => router.push('/')}
          style={{ position: 'absolute', top: 16, left: 20, background: 'rgba(255,255,255,.1)', border: 'none', borderRadius: 10, padding: '8px 12px', color: '#fff', cursor: 'pointer', fontSize: 14 }}>
          ← Retour
        </button>
        <div style={{ marginBottom: 4 }}>
          <Image src="/logo-hero.webp" alt="Crew Trips" width={90} height={90} />
        </div>
        <div style={{ fontFamily: 'var(--font-brand), Georgia, serif', fontWeight: 700, fontSize: 20, color: '#fff', letterSpacing: '-.02em', lineHeight: 1, marginBottom: 6 }}>Crew Trips</div>
        <div style={{ fontSize: 9, color: 'rgba(255,255,255,.5)', letterSpacing: '.22em', textTransform: 'uppercase', fontWeight: 500 }}>Création d&apos;identité</div>
      </div>

      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 20px 40px' }}>
        <div style={{ maxWidth: 380, width: '100%', textAlign: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: '#fff', marginBottom: 8, letterSpacing: '-.02em' }}>
            Bienvenue !
          </div>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,.6)', lineHeight: 1.55 }}>
            {isStandalone
              ? <>Créez votre identité pour voir automatiquement les trips où vous avez été invité.</>
              : <>Entrez vos informations pour voir vos trips et les invitations en attente.</>}
          </div>
        </div>

        <div style={{
          width: '100%', maxWidth: 380,
          background: 'rgba(255,255,255,.06)', borderRadius: 20, padding: 22,
          border: '1px solid rgba(255,255,255,.1)',
        }}>
          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Prénom</label>
            <input className="input" placeholder="Votre prénom" value={prenom}
              onChange={e => { setPrenom(e.target.value); setErreur(null) }}
              autoFocus
              style={{
                fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,.08)',
                border: `1.5px solid ${erreur ? '#f87171' : 'rgba(255,255,255,.15)'}`, color: '#fff',
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Nom de famille</label>
            <input className="input" placeholder="Votre nom de famille" value={nom}
              onChange={e => { setNom(e.target.value); setErreur(null) }}
              style={{
                fontSize: 16, fontWeight: 600, background: 'rgba(255,255,255,.08)',
                border: `1.5px solid ${erreur ? '#f87171' : 'rgba(255,255,255,.15)'}`, color: '#fff',
              }}
            />
          </div>

          <div style={{ marginBottom: 12 }}>
            <label style={labelStyle}>Numéro de téléphone</label>
            <input className="input" type="tel" placeholder="418 XXX XXXX"
              value={tel}
              onChange={e => { setTel(formatTel(e.target.value)); setErreur(null) }}
              style={{
                fontSize: 16, letterSpacing: 1, textAlign: 'center',
                background: 'rgba(255,255,255,.06)',
                border: `1.5px solid ${tel && telComplet ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                color: '#fff',
              }}
            />
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '8px 0 12px' }}>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,.5)', letterSpacing: '.12em', textTransform: 'uppercase', fontWeight: 600 }}>
              Créez votre NIP
            </span>
            <div style={{ flex: 1, height: 1, background: 'rgba(255,255,255,.1)' }} />
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>NIP (4 chiffres)</label>
            <div style={{ position: 'relative' }}>
              <input className="input" type={showNip ? 'text' : 'password'} inputMode="numeric" placeholder=""
                value={nip}
                onChange={e => { setNip(e.target.value.replace(/\D/g, '').slice(0, 4)); setErreur(null) }}
                onKeyDown={e => e.key === 'Enter' && canSubmit && onSubmit()}
                maxLength={4}
                style={{
                  fontSize: 22, letterSpacing: showNip ? 4 : 8, textAlign: 'center', fontWeight: 700,
                  paddingRight: 40,
                  background: 'rgba(255,255,255,.06)',
                  border: `1.5px solid ${nip && nipValide ? '#4ade80' : erreur ? '#f87171' : 'rgba(255,255,255,.1)'}`,
                  color: '#fff',
                }}
              />
              {oeilBtn}
            </div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,.4)', marginTop: 6, lineHeight: 1.5 }}>
              Vous l&apos;utiliserez pour vous reconnecter sur un nouvel appareil.
            </div>
          </div>

          {erreur && (
            <div style={{
              background: 'rgba(248,113,113,.15)', border: '1px solid rgba(248,113,113,.3)',
              borderRadius: 10, padding: '10px 14px', marginBottom: 10,
            }}>
              <p style={{ fontSize: 13, color: '#fca5a5', textAlign: 'center', lineHeight: 1.5, margin: 0 }}>{erreur}</p>
            </div>
          )}

          {/* P4j5 : boutons SMS pour contacter les admins quand inscription échoue */}
          {erreur && adminContacts.length > 0 && (
            <div style={{ marginBottom: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div style={{
                fontSize: 10, fontWeight: 600, color: 'rgba(255,255,255,.5)',
                letterSpacing: '.12em', textTransform: 'uppercase', textAlign: 'center', marginBottom: 2,
              }}>
                💬 Besoin d&apos;aide ?
              </div>
              {adminContacts.map((admin) => (
                <a key={admin.tel}
                  href={`sms:${admin.tel}?&body=${encodeURIComponent(
                    `Salut${admin.prenom ? ' ' + admin.prenom : ''}, je n'arrive pas à m'inscrire à Crew Trips pour le trip "${admin.tripNom}". Peux-tu m'aider ?`
                  )}`}
                  style={{
                    display:'flex',alignItems:'center',justifyContent:'center',gap:6,
                    width:'100%',padding:'10px 12px',borderRadius:10,
                    background:'rgba(255,255,255,.06)',
                    border:'1px solid rgba(255,255,255,.15)',
                    color:'rgba(255,255,255,.85)',
                    fontSize:13,fontWeight:600,textDecoration:'none',
                  }}>
                  📱 Contacter {admin.prenom || 'l\'administrateur'} ({admin.tripNom})
                </a>
              ))}
            </div>
          )}

          <button className="btn" onClick={onSubmit} disabled={!canSubmit}
            style={{
              background: !canSubmit ? 'rgba(255,255,255,.15)' : '#fff',
              color: !canSubmit ? 'rgba(255,255,255,.4)' : 'var(--forest)', fontWeight: 700,
            }}>
            {loading ? 'Validation…' : 'Créer mon identité →'}
          </button>
        </div>

        <div style={{ fontSize: 11, color: 'rgba(255,255,255,.3)', marginTop: 20, textAlign: 'center', lineHeight: 1.7, maxWidth: 340 }}>
          Pas de compte requis · Aucune installation supplémentaire<br />
          Les trips où vous avez été invité apparaîtront automatiquement.
        </div>
      </div>
    </main>
  )
}
