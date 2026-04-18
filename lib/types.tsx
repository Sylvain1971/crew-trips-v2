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

// Icônes SVG style "iOS Settings" — pleines (fill=currentColor)
// Destinées à être rendues en blanc sur une pastille de fond plein coloré.
// tripType permet de varier Lodge et Permis selon l'activité.
export function getCatSvg(id: string, size: number = 16, tripType?: string): React.ReactElement | null {
  const a = { width: size, height: size, viewBox: '0 0 24 24', fill: 'currentColor' }

  // Lodge — varie selon le type de voyage
  if (id === 'lodge') {
    switch (tripType) {
      case 'ski':
      case 'velo':
        // Hôtel — bâtiment multi-étages avec fenêtres (style ta capture)
        return <svg {...a}><path d="M7 2h10a2 2 0 0 1 2 2v18h-5v-5h-4v5H5V4a2 2 0 0 1 2-2zm2 4v2h2V6H9zm4 0v2h2V6h-2zm-4 4v2h2v-2H9zm4 0v2h2v-2h-2zm-4 4v2h2v-2H9zm4 0v2h2v-2h-2z"/></svg>
      case 'hike':
        // Refuge — tente style triangle avec porte
        return <svg {...a}><path d="M12 2L2 22h20L12 2zm0 4.5L18 20h-3v-4l-3-4-3 4v4H6L12 6.5z"/></svg>
      case 'yoga':
      case 'soleil':
        // Resort — palmier Phosphor plein
        return <svg {...a}><path d="M13 8c0-2.76-2.46-5-5.5-5S2 5.24 2 8h2l1-1 1 1h4l-1-3 3 3h4M13 7.14A5.82 5.82 0 0 1 16.5 6c3.04 0 5.5 2.24 5.5 5h-3l-1-1-1 1h-3l1 3-3-3v-4M5.89 9.71c-2.15 2.15-2.3 5.47-.35 7.43l4.24-4.25.7-.7.71-.71 2.12-2.12c-1.95-1.96-5.27-1.8-7.42.35z"/><path d="M11 15.5c.5 2.5-.17 4.5-1 6.5h4c2-5.5-.5-12-1-14"/></svg>
      default:
        // Cabin + fumée (pêche, chasse, motoneige, autre)
        return <svg {...a}><path d="M12 3L2 12h3v8h5v-6h4v6h5v-8h3L12 3z"/><path d="M16 5l2-2v4l-2 1z"/><circle cx="17.5" cy="2.5" r="0.6"/><circle cx="19" cy="3.5" r="0.5"/></svg>
    }
  }

  // Permis — varie selon le type de voyage
  if (id === 'permis') {
    switch (tripType) {
      case 'ski':
        // Billets — ticket avec entailles
        return <svg {...a}><path d="M22 10V6c0-1.1-.9-2-2-2H4c-1.1 0-2 .9-2 2v4c1.1 0 2 .9 2 2s-.9 2-2 2v4c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2v-4c-1.1 0-2-.9-2-2s.9-2 2-2zm-9 7.5h-2v-2h2v2zm0-4.5h-2v-2h2v2zm0-4.5h-2v-2h2v2z"/></svg>
      case 'peche':
        // Permis — carte d'identité avec photo
        return <svg {...a}><path d="M20 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zM9 12c-1.66 0-3-1.34-3-3s1.34-3 3-3 3 1.34 3 3-1.34 3-3 3zm11 4H4v-.5c0-1.66 3.34-3 6-3s6 1.34 6 3v.5h4zm0-4h-6V8h6v4z"/></svg>
      default:
        // Accès — cadenas (hike, velo, yoga, soleil, chasse, motoneige, autre)
        return <svg {...a}><path d="M12 1a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-9a2 2 0 0 0-2-2h-1V6a5 5 0 0 0-5-5zm-3 5a3 3 0 0 1 6 0v3H9V6zm3 8a2 2 0 0 1 1 3.73V20h-2v-2.27A2 2 0 0 1 12 14z"/></svg>
    }
  }

  // Catégories statiques (identiques peu importe le trip type)
  switch (id) {
    case 'all':        return <svg {...a}><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
    case 'itineraire': return <svg {...a}><path d="M20.5 3.1l-.2.2L15 5 9 3 3.4 4.9c-.4.1-.6.4-.6.8V20.2c0 .7.8 1.2 1.5.9L9 19l6 2 5.6-1.9c.4-.1.6-.4.6-.8V4.1c0-.7-.8-1.2-1.7-1zM15 19l-6-2.1V5.1l6 2.1V19z"/></svg>
    case 'transport':  return <svg {...a}><path d="M21 16v-2l-8-5V3.5c0-.83-.67-1.5-1.5-1.5S10 2.67 10 3.5V9l-8 5v2l8-2.5V19l-2 1.5V22l3.5-1 3.5 1v-1.5L13 19v-5.5l8 2.5z"/></svg>
    case 'equipement': return <svg {...a}><path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58c.18-.14.23-.41.12-.61l-1.92-3.32c-.12-.22-.37-.29-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54c-.04-.24-.24-.41-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58c-.18.14-.23.41-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6c-1.98 0-3.6-1.62-3.6-3.6s1.62-3.6 3.6-3.6 3.6 1.62 3.6 3.6-1.62 3.6-3.6 3.6z"/></svg>
    case 'infos':      return <svg {...a}><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>
    case 'meteo':      return <svg {...a}><path d="M6.76 4.84l-1.8-1.79-1.41 1.41 1.79 1.79 1.42-1.41zM1 10.5h3v2H1zm10-9.95h2V3.5h-2zm8.04 2.495l1.408 1.407-1.79 1.79-1.407-1.408zm-1.8 15.115l1.79 1.8 1.41-1.41-1.8-1.79zM20 10.5h3v2h-3zm-8-5c-3.31 0-6 2.69-6 6s2.69 6 6 6 6-2.69 6-6-2.69-6-6-6zm-1 16.95h2V19.5h-2zM3.55 18.45l1.41 1.41 1.79-1.8-1.41-1.41z"/></svg>
    case 'resto':      return <svg {...a}><path d="M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.20-1.10-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z"/></svg>
    case 'liens':      return <svg {...a}><path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/></svg>
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
