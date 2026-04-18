import type React from 'react'

export interface Trip {
  id: string; code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  lodge_nom?: string; lodge_adresse?: string; lodge_tel?: string
  lodge_wifi?: string; lodge_code?: string; lodge_arrivee?: string
  can_delete: boolean; can_edit: boolean; can_post_photos?: boolean
  whatsapp_lien?: string; sms_lien?: string
  createur_tel?: string
  share_token?: string | null
  created_at: string
}
export interface Membre {
  id: string; trip_id: string; prenom: string; couleur: string
  is_createur: boolean; tel?: string; created_at: string
}
export interface InfoCard {
  id: string; trip_id: string; categorie: string; titre: string
  contenu?: string; lien?: string; fichier_url?: string
  membre_prenom?: string; created_at: string
}
export interface Message {
  id: string; trip_id: string; contenu?: string
  image_url: string
  membre_id?: string; membre_prenom?: string; membre_couleur?: string; created_at: string
}
export interface ParticipantAutorise {
  id: string; trip_id: string; prenom: string; created_at: string
}
export const CATEGORIES = [
  { id: 'transport',  label: 'Vols & Transport',   icon: '✈️', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'lodge',      label: 'Lodge & Séjour',      icon: '🏠', color: '#16A34A', bg: '#F0FDF4' },
  { id: 'permis',     label: 'Permis & Règlements', icon: '🪪', color: '#B45309', bg: '#FFFBEB' },
  { id: 'equipement', label: 'Équipements',          icon: '⚙️', color: '#6B7280', bg: '#F9FAFB' },
  { id: 'infos',      label: 'Informations',         icon: 'ℹ️', color: '#0EA5E9', bg: '#F0F9FF' },
  { id: 'itineraire', label: 'Itinéraire',            icon: '🗺️', color: '#0D9488', bg: '#F0FDFA' },
  { id: 'meteo',      label: 'Météo',                 icon: '🌤️', color: '#F59E0B', bg: '#FFFBEB' },
  { id: 'resto',      label: 'Restos & Bars',        icon: '🍽️', color: '#E11D48', bg: '#FFF1F2' },
  { id: 'liens',      label: 'Liens & Ressources',  icon: '🔗', color: '#7C3AED', bg: '#F5F3FF' },
]
export const COULEURS_MEMBRES = [
  '#1D4ED8','#15803D','#B45309','#DC2626','#7C3AED','#0891B2','#C2410C','#4338CA'
]
export function getCat(id: string) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[CATEGORIES.length - 1]
}

// Icônes SVG Lucide (stroke=currentColor pour héritage couleur)
// Size par défaut 16px — override via size prop
// tripType permet de varier Lodge et Permis selon l'activité
export function getCatSvg(id: string, size: number = 16, tripType?: string): React.ReactElement | null {
  const a = { width: size, height: size, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const }

  // Lodge — varie selon le type de voyage
  if (id === 'lodge') {
    switch (tripType) {
      case 'ski':
      case 'velo':
        // Hôtel — bâtiment multi-étages
        return <svg {...a}><path d="M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18"/><path d="M6 12H4a2 2 0 0 0-2 2v8h4"/><path d="M18 9h2a2 2 0 0 1 2 2v11h-4"/><path d="M10 6h4"/><path d="M10 10h4"/><path d="M10 14h4"/><path d="M10 18h4"/></svg>
      case 'hike':
        // Refuge — tente
        return <svg {...a}><path d="M3.5 21 14 3"/><path d="M20.5 21 10 3"/><path d="M15.5 21 12 15l-3.5 6"/><path d="M2 21h20"/></svg>
      case 'yoga':
      case 'soleil':
        // Resort — palmier
        return <svg {...a}><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4"/><path d="M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3"/><path d="M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35z"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg>
      default:
        // Lodge — cabane/maison pointue (peche, chasse, motoneige, autre)
        return <svg {...a}><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
    }
  }

  // Permis — varie selon le type de voyage
  if (id === 'permis') {
    switch (tripType) {
      case 'ski':
        // Billets — ticket
        return <svg {...a}><path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2z"/><path d="M13 5v2"/><path d="M13 17v2"/><path d="M13 11v2"/></svg>
      case 'peche':
        // Permis — carte d'identité (conserve l'actuel)
        return <svg {...a}><rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="9" cy="12" r="2.5"/><line x1="14" y1="10" x2="18" y2="10"/><line x1="14" y1="14" x2="18" y2="14"/></svg>
      default:
        // Accès — cadenas (hike, velo, yoga, soleil, chasse, motoneige, autre)
        return <svg {...a}><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
    }
  }

  // Catégories statiques (identiques peu importe le trip type)
  switch (id) {
    case 'all':        return <svg {...a}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    case 'itineraire': return <svg {...a}><polygon points="3 6 9 3 15 6 21 3 21 18 15 21 9 18 3 21"/><line x1="9" y1="3" x2="9" y2="18"/><line x1="15" y1="6" x2="15" y2="21"/></svg>
    case 'transport':  return <svg {...a}><path d="M17.8 19.2 16 11l3.5-3.5C21 6 21.5 4 21 3c-1-.5-3 0-4.5 1.5L13 8 4.8 6.2c-.5-.1-.9.1-1.1.5l-.3.5c-.2.5-.1 1 .3 1.3L9 12l-2 3H4l-1 1 3 2 2 3 1-1v-3l3-2 3.5 5.3c.3.4.8.5 1.3.3l.5-.2c.4-.3.6-.7.5-1.2z"/></svg>
    case 'equipement': return <svg {...a}><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
    case 'infos':      return <svg {...a}><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>
    case 'meteo':      return <svg {...a}><circle cx="12" cy="12" r="4"/><path d="M12 2v2"/><path d="M12 20v2"/><path d="m4.93 4.93 1.41 1.41"/><path d="m17.66 17.66 1.41 1.41"/><path d="M2 12h2"/><path d="M20 12h2"/><path d="m6.34 17.66-1.41 1.41"/><path d="m19.07 4.93-1.41 1.41"/></svg>
    case 'resto':      return <svg {...a}><path d="M3 11h18"/><path d="M3 11c0-5 4-7 9-7s9 2 9 7"/><path d="M3 11v2a9 9 0 0 0 18 0v-2"/><path d="M7 18v3"/><path d="M17 18v3"/></svg>
    case 'liens':      return <svg {...a}><path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/><path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/></svg>
    default: return null
  }
}
export function levenshtein(a: string, b: string): number {
  const m = a.length, n = b.length
  const dp: number[][] = Array.from({length:m+1}, (_,i) =>
    Array.from({length:n+1}, (_,j) => i===0?j:j===0?i:0))
  for (let i=1;i<=m;i++)
    for (let j=1;j<=n;j++)
      dp[i][j]=a[i-1]===b[j-1]?dp[i-1][j-1]:1+Math.min(dp[i-1][j],dp[i][j-1],dp[i-1][j-1])
  return dp[m][n]
}
export function findClosestPrenom(input: string, list: string[]): string|null {
  const inp = input.toLowerCase().trim()
  if (inp.length < 2) return null
  // 1. Match exact complet
  const exact = list.find(p=>p.toLowerCase()===inp)
  if (exact) return exact
  // 2. Un mot tapé correspond exactement à un mot dans la liste (ex: "Bergeron" dans "Sylvain Bergeron")
  const inpWords = inp.split(/\s+/).filter(w=>w.length>=2)
  const wordMatch = list.find(p=>{
    const pWords = p.toLowerCase().split(/\s+/)
    return inpWords.some(w => pWords.includes(w))
  })
  if (wordMatch) return wordMatch
  // 3. Levenshtein <=2 sur le prénom COMPLET seulement (pas sur les mots individuels)
  // Seulement si la saisie fait au moins 4 caractères (évite les faux positifs courts)
  if (inp.length >= 4) {
    for (const p of list) {
      if (levenshtein(inp, p.toLowerCase()) <= 2) return p
    }
  }
  return null
}
