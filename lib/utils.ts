// Fonctions utilitaires partagées entre composants

export function getYoutubeId(url: string): string | null {
  const m = url.match(/(?:v=|youtu\.be\/)([a-zA-Z0-9_-]{11})/)
  return m ? m[1] : null
}

export function isPdf(url?: string | null): boolean {
  if (!url) return false
  return url.toLowerCase().includes('.pdf') || url.includes('application%2Fpdf')
}

export function ago(ts: string): string {
  const d = Date.now() - new Date(ts).getTime()
  if (d < 60000) return "À l'instant"
  if (d < 3600000) return `${Math.floor(d / 60000)}min`
  if (d < 86400000) return `${Math.floor(d / 3600000)}h`
  return new Date(ts).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' })
}

export function countdown(d?: string): string | null {
  if (!d) return null
  const diff = Math.ceil((new Date(d + 'T00:00:00').getTime() - Date.now()) / 86400000)
  if (diff < 0) return null
  if (diff === 0) return "C'est aujourd'hui !"
  return `${diff} jour${diff > 1 ? 's' : ''} avant le départ`
}

export const TRIP_ICONS: Record<string, string> = {
  peche: '🎣', ski: '⛷', motoneige: '🗻', hike: '🥾',
  velo: '🚵', chasse: '🫎', yoga: '🧘', soleil: '☀️', autre: '🏕',
}

// Nom de la section Lodge selon l'activité
export function getLodgeLabel(type: string): { icon: string; label: string } {
  switch (type) {
    case 'ski':   return { icon: '🏨', label: 'Hôtel' }
    case 'hike':  return { icon: '⛺', label: 'Refuge' }
    case 'velo':  return { icon: '🏨', label: 'Hôtel' }
    case 'yoga':  return { icon: '🌴', label: 'Resort' }
    case 'soleil':return { icon: '🌴', label: 'Resort' }
    default:      return { icon: '🏕', label: 'Lodge' }  // peche, chasse, motoneige, autre
  }
}

// Label de la catégorie "permis" selon l'activité
export function getPermisLabel(type: string): string {
  switch (type) {
    case 'ski':   return 'Billets'
    case 'peche': return 'Permis'
    default:      return 'Accès'   // hike, velo, yoga, soleil, chasse, motoneige, autre
  }
}

// Exemples de placeholders pour la page Nouveau trip
export function getTripExamples(type: string): { nom: string; dest: string } {
  switch (type) {
    case 'peche':     return { nom: 'Rivière Babine — Septembre 2025', dest: 'Rivière Babine, BC' }
    case 'ski':       return { nom: 'Tremblant — Février 2026',         dest: 'Mont-Tremblant, QC' }
    case 'motoneige': return { nom: 'Laurentides — Janvier 2026',       dest: 'Saint-Donat, QC' }
    case 'hike':      return { nom: 'Torres del Paine — Août 2026',     dest: 'Patagonie, Chili' }
    case 'velo':      return { nom: 'Véloroute des Bleuets — Juillet',  dest: 'Lac-Saint-Jean, QC' }
    case 'chasse':    return { nom: 'Orignal — Octobre 2026',           dest: 'Réserve Mastigouche, QC' }
    case 'yoga':      return { nom: 'Retraite Tulum — Mars 2026',       dest: 'Tulum, Mexique' }
    case 'soleil':    return { nom: 'Punta Cana — Janvier 2026',        dest: 'Punta Cana, RD' }
    default:          return { nom: 'Notre trip — Été 2026',            dest: 'Destination' }
  }
}
