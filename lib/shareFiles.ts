import type { Message } from '@/lib/types'

/**
 * Telecharge une photo Supabase et la convertit en File partageable.
 * Utilise la version optimisee 1600px (plus rapide en mobile, iMessage
 * et autres apps recompressent de toute facon).
 */
async function photoToFile(photo: Message, fallbackIdx: number): Promise<File | null> {
  if (!photo.image_url) return null
  const url = photo.image_url.includes('?')
    ? photo.image_url
    : `${photo.image_url}?width=1600&quality=85`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const ext = (blob.type.split('/')[1] || 'jpg').split(';')[0]
    const name = `photo-${fallbackIdx + 1}.${ext}`
    return new File([blob], name, { type: blob.type || 'image/jpeg' })
  } catch {
    return null
  }
}

/**
 * Detecte si le navigateur peut partager des fichiers via Web Share API.
 * Test avec un fichier texte factice (plus generique qu'une image, certains
 * browsers disent non aux images mais oui au texte).
 */
export function canShareFiles(): boolean {
  if (typeof navigator === 'undefined') return false
  if (!navigator.share || !navigator.canShare) return false
  try {
    const dummy = new File([''], 'test.txt', { type: 'text/plain' })
    return navigator.canShare({ files: [dummy] })
  } catch {
    return false
  }
}

/**
 * Partage toutes les photos en un seul appel navigator.share().
 * Retourne true si ok (user a partage ou ferme le sheet), false si echec.
 */
export async function shareAllTogether(photos: Message[], title: string): Promise<boolean> {
  const files = (await Promise.all(photos.map((p, i) => photoToFile(p, i))))
    .filter((f): f is File => f !== null)
  if (files.length === 0) return false
  if (!navigator.canShare || !navigator.canShare({ files })) return false
  try {
    await navigator.share({ files, title })
    return true
  } catch (e) {
    // AbortError = user a ferme le sheet : pas une vraie erreur
    if (e instanceof Error && e.name === 'AbortError') return true
    return false
  }
}

/**
 * Partage les photos en sequence, une par une. Plus fiable sur iOS Safari
 * quand iMessage/AirDrop refusent les batches (iOS accepte toujours 1 fichier).
 * L'utilisateur voit une sheet de partage par photo.
 * Retourne true si au moins une photo a ete partagee.
 */
export async function shareOneByOne(photos: Message[], title: string): Promise<boolean> {
  let succeeded = 0
  for (let i = 0; i < photos.length; i++) {
    const file = await photoToFile(photos[i], i)
    if (!file) continue
    if (!navigator.canShare || !navigator.canShare({ files: [file] })) continue
    try {
      await navigator.share({ files: [file], title: `${title} — ${i + 1}/${photos.length}` })
      succeeded++
    } catch (e) {
      // User a ferme le sheet : on arrete la sequence plutot que harceler
      if (e instanceof Error && e.name === 'AbortError') {
        return succeeded > 0
      }
      // Autre erreur : on continue avec la suivante
    }
  }
  return succeeded > 0
}
