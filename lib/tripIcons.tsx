// Composant TripIcon : rend l'icone d'activite comme <Image> Next.js pointant
// vers public/icons/{type}.webp. Fallback emoji pour les contextes ou Image
// ne peut pas etre utilise (ex: <option> HTML).
//
// Le mapping 'soleil' -> surf.webp permet aux trips existants en DB
// avec type='soleil' de continuer a marcher sans migration.

import Image from 'next/image'

// Mapping logique -> fichier webp
const ICON_FILE: Record<string, string> = {
  peche: 'peche',
  ski: 'ski',
  motoneige: 'motoneige',
  hike: 'hike',
  velo: 'velo',
  chasse: 'chasse',
  yoga: 'yoga',
  surf: 'surf',
  soleil: 'surf',    // legacy: soleil utilise surf.webp
  autre: 'autre',
}

// Fallback emoji conserve pour les <select><option> HTML et fallback texte
export const TRIP_EMOJI: Record<string, string> = {
  peche: '🎣', ski: '⛷', motoneige: '🗻', hike: '🥾',
  velo: '🚵', chasse: '🫎', yoga: '🧘',
  surf: '🏄', soleil: '☀️', autre: '🏕',
}

interface TripIconProps {
  type: string
  size: number
  alt?: string
  className?: string
  style?: React.CSSProperties
  priority?: boolean
}

export function TripIcon({ type, size, alt, className, style, priority }: TripIconProps) {
  const file = ICON_FILE[type] || 'autre'
  return (
    <Image
      src={`/icons/${file}.webp`}
      alt={alt ?? type}
      width={size}
      height={size}
      className={className}
      style={{ display: 'block', ...style }}
      priority={priority}
      unoptimized
    />
  )
}
