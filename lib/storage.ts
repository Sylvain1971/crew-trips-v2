import { supabase } from './supabase'

/**
 * Helper pour gérer les URLs de stockage avec bucket privé.
 *
 * Contexte : depuis la Phase 2, le bucket 'trip-photos' est PRIVÉ.
 * Les URLs stockées en DB sont de type "publicUrl" (legacy) comme :
 *   https://xxx.supabase.co/storage/v1/object/public/trip-photos/vtjaby/album/xxx.jpg
 * Ces URLs ne fonctionnent plus directement — il faut les re-signer.
 *
 * Ce module extrait le path depuis une URL stockée, puis demande une signed URL
 * valide pendant 1h. Un cache en mémoire évite de re-signer la même URL à
 * chaque render.
 */

const BUCKET = 'trip-photos'
const SIGNED_URL_TTL = 3600 // 1h

// Cache : URL originale (stockée en DB) -> { signed, expiresAt }
const signedCache = new Map<string, { signed: string; expiresAt: number }>()

/**
 * Extrait le path relatif au bucket depuis une URL complète.
 * Ex: "https://xxx.supabase.co/storage/v1/object/public/trip-photos/vtjaby/album/1.jpg"
 *     → "vtjaby/album/1.jpg"
 * Ex: "https://xxx.supabase.co/storage/v1/object/sign/trip-photos/vtjaby/album/1.jpg?token=..."
 *     → "vtjaby/album/1.jpg"
 */
export function extractPath(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/\/trip-photos\/([^?]+)/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) }
  catch { return match[1] }
}

/**
 * Transforme une URL stockée en DB (publique ou signée expirée) en URL signée
 * valide. Le cache évite de re-signer si la dernière signature est toujours
 * valide. Retourne null si l'URL ne contient pas de path trip-photos valide.
 */
export async function toSignedUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null

  // Cache hit (avec marge de 60s avant expiration pour éviter les race conditions)
  const cached = signedCache.get(url)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.signed
  }

  const path = extractPath(url)
  if (!path) return url // fallback : si on ne peut pas extraire, on retourne tel quel

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) {
    console.warn('createSignedUrl failed for', path, error)
    return url // fallback
  }

  signedCache.set(url, {
    signed: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL * 1000,
  })
  return data.signedUrl
}

/**
 * Version batch : signe plusieurs URLs en un seul appel réseau. Très utile
 * pour l'album qui affiche N photos d'un coup.
 * Retourne un tableau dans le même ordre que l'input, avec null pour les échecs.
 */
export async function toSignedUrlsBatch(urls: (string | null | undefined)[]): Promise<(string | null)[]> {
  // Collecter les URL non-cachées à signer
  const toSign: { originalUrl: string; path: string; index: number }[] = []
  const results: (string | null)[] = new Array(urls.length).fill(null)

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]
    if (!url) continue

    const cached = signedCache.get(url)
    if (cached && cached.expiresAt > Date.now() + 60_000) {
      results[i] = cached.signed
      continue
    }

    const path = extractPath(url)
    if (!path) {
      results[i] = url
      continue
    }
    toSign.push({ originalUrl: url, path, index: i })
  }

  if (toSign.length === 0) return results

  // Batch signing
  const paths = toSign.map(t => t.path)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)

  if (error || !data) {
    console.warn('createSignedUrls batch failed', error)
    // Fallback : retourner les URLs originales (au cas où bucket encore public)
    for (const t of toSign) results[t.index] = t.originalUrl
    return results
  }

  // data est un array dans le même ordre que paths
  for (let i = 0; i < toSign.length; i++) {
    const t = toSign[i]
    const signed = data[i]?.signedUrl
    if (signed) {
      signedCache.set(t.originalUrl, {
        signed,
        expiresAt: Date.now() + SIGNED_URL_TTL * 1000,
      })
      results[t.index] = signed
    } else {
      results[t.index] = t.originalUrl // fallback
    }
  }

  return results
}

/**
 * Supprime des fichiers du bucket par leurs paths (ou URLs).
 */
export async function deleteFiles(urlsOrPaths: string[]): Promise<void> {
  const paths = urlsOrPaths.map(u => extractPath(u) || u).filter(Boolean)
  if (paths.length === 0) return
  await supabase.storage.from(BUCKET).remove(paths)
}

/**
 * Pour l'upload : on continue à générer une URL "publique" comme référence en DB.
 * Cette URL sera ensuite signée à l'affichage via toSignedUrl().
 * Le path est ce qui importe — l'URL n'est qu'un wrapper pour extraire le path.
 */
export function getStoredUrlForPath(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
