export interface Trip {
  id: string; code: string; nom: string; type: string
  destination?: string; date_debut?: string; date_fin?: string
  lodge_nom?: string; lodge_adresse?: string; lodge_tel?: string
  lodge_wifi?: string; lodge_code?: string; lodge_arrivee?: string
  can_delete: boolean; can_edit: boolean; whatsapp_lien?: string
  created_at: string
}
export interface Membre {
  id: string; trip_id: string; prenom: string; couleur: string
  is_createur: boolean; created_at: string
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
export interface ParticipantAutorise {
  id: string; trip_id: string; prenom: string; created_at: string
}
export const CATEGORIES = [
  { id: 'transport',  label: 'Vols & Transport',   icon: '✈️', color: '#2563EB', bg: '#EFF6FF' },
  { id: 'lodge',      label: 'Lodge & Séjour',      icon: '🏠', color: '#16A34A', bg: '#F0FDF4' },
  { id: 'permis',     label: 'Permis & Règlements', icon: '🪪', color: '#B45309', bg: '#FFFBEB' },
  { id: 'equipement', label: 'Équipement',           icon: '⚙️', color: '#6B7280', bg: '#F9FAFB' },
  { id: 'liens',      label: 'Liens & Ressources',  icon: '🔗', color: '#7C3AED', bg: '#F5F3FF' },
]
export const COULEURS_MEMBRES = [
  '#1D4ED8','#15803D','#B45309','#DC2626','#7C3AED','#0891B2','#C2410C','#4338CA'
]
export function getCat(id: string) {
  return CATEGORIES.find(c => c.id === id) || CATEGORIES[4]
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
