import { supabase } from './supabase'

/**
 * Helper pour gérer les URLs de stockage avec bucket privé.
 *
 * Contexte : depuis la Phase 2, le bucket 'trip-photos' est en transition
 * vers PRIVÉ. Les URLs stockées en DB sont de type "publicUrl" (legacy) :
 *   https://xxx.supabase.co/storage/v1/object/public/trip-photos/...
 * Une fois le bucket privé, ces URLs ne fonctionnent plus directement —
 * il faut les re-signer à l'affichage.
 *
 * PHASE 1 (bucket encore public) : les fallbacks retournent les URLs
 * originales, donc les signed URLs fonctionnent ET les URLs publiques
 * continuent de marcher. Aucune régression visible.
 * PHASE 2 (bucket privé) : les signed URLs sont obligatoires, les URLs
 * publiques deviennent HTTP 400.
 */

const BUCKET = 'trip-photos'
const SIGNED_URL_TTL = 3600 // 1h

// Cache : URL originale -> { signed, expiresAt }
const signedCache = new Map<string, { signed: string; expiresAt: number }>()

/**
 * Extrait le path relatif au bucket depuis une URL complète.
 */
export function extractPath(url: string | null | undefined): string | null {
  if (!url) return null
  const match = url.match(/\/trip-photos\/([^?]+)/)
  if (!match) return null
  try { return decodeURIComponent(match[1]) }
  catch { return match[1] }
}

/**
 * Transforme une URL stockée en DB en URL signée valide 1h.
 * Retourne l'URL originale en fallback si signature impossible.
 */
export async function toSignedUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null

  const cached = signedCache.get(url)
  if (cached && cached.expiresAt > Date.now() + 60_000) {
    return cached.signed
  }

  const path = extractPath(url)
  if (!path) return url

  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_TTL)
  if (error || !data?.signedUrl) {
    console.warn('createSignedUrl failed for', path, error)
    return url
  }

  signedCache.set(url, {
    signed: data.signedUrl,
    expiresAt: Date.now() + SIGNED_URL_TTL * 1000,
  })
  return data.signedUrl
}

/**
 * Version batch : signe plusieurs URLs en un seul appel réseau.
 */
export async function toSignedUrlsBatch(urls: (string | null | undefined)[]): Promise<(string | null)[]> {
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

  const paths = toSign.map(t => t.path)
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_TTL)

  if (error || !data) {
    console.warn('createSignedUrls batch failed', error)
    for (const t of toSign) results[t.index] = t.originalUrl
    return results
  }

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
      results[t.index] = t.originalUrl
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
 * Pour l'upload : génère l'URL de référence stockée en DB (publicUrl legacy).
 * L'URL sera re-signée à l'affichage via toSignedUrl().
 */
export function getStoredUrlForPath(path: string): string {
  return supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}
