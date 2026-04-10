export interface Trip {
  id: string; code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  lodge_nom?: string; lodge_adresse?: string; lodge_tel?: string
  lodge_wifi?: string; lodge_code?: string; lodge_arrivee?: string
  created_at: string
}
export interface Membre {
  id: string; trip_id: string; prenom: string; couleur: string; created_at: string
}
export interface InfoCard {
  id: string; trip_id: string; categorie: string; titre: string
  contenu?: string; lien?: string; fichier_url?: string
  membre_prenom?: string; created_at: string
}
export interface Message {
  id: string; trip_id: string; contenu: string; epingle: boolean
  membre_id?: string; membre_prenom?: string; membre_couleur?: string; created_at: string
}

export const CATEGORIES = [
  { id: 'transport', label: 'Vols & Transport', icon: '✈️', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'lodge',     label: 'Lodge & Séjour',   icon: '🏠', color: '#16A34A', bg: '#F0FDF4' },
  { id: 'permis',    label: 'Permis & Règlements', icon: '🪪', color: '#B45309', bg: '#FFFBEB' },
  { id: 'equipement',label: 'Équipement',        icon: '🎒', color: '#6B7280', bg: '#F9FAFB' },
  { id: 'liens',     label: 'Liens & Ressources', icon: '🔗', color: '#7C3AED', bg: '#F5F3FF' },
]

export const COULEURS_MEMBRES = [
  '#1D4ED8','#15803D','#B45309','#DC2626','#7C3AED','#0891B2','#C2410C','#4338CA'
]

export function getCat(id: string) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[4]
}
