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
  velo: '🚵', chasse: '🫎', yoga: '🧘', autre: '🏕',
}
