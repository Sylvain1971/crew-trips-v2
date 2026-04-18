import type { Message } from './types'

// Sanitize pour filename : retire caractères interdits Windows/Mac + limite longueur
function sanitize(s: string, maxLen = 40): string {
  return s
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // retire accents
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')          // retire caracteres interdits
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, maxLen)
}

function extractExt(url: string): string {
  const clean = url.split('?')[0]
  const match = clean.match(/\.([a-zA-Z0-9]{1,5})$/)
  return (match ? match[1] : 'jpg').toLowerCase()
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}${mm}${dd}`
}

// Nom de fichier : 001-20251017-sylvain-legende-courte.jpg
export function buildFilename(photo: Message, index: number, total: number): string {
  const pad = String(total).length
  const num = String(index + 1).padStart(pad, '0')
  const date = formatDate(photo.created_at)
  const prenom = sanitize(photo.membre_prenom || 'inconnu', 20)
  const legende = photo.contenu ? '-' + sanitize(photo.contenu, 40) : ''
  const ext = extractExt(photo.image_url)
  return `${num}-${date}-${prenom}${legende}.${ext}`
}

export type ProgressFn = (done: number, total: number) => void

export async function downloadAlbumAsZip(
  photos: Message[],
  zipName: string,
  onProgress?: ProgressFn
): Promise<void> {
  if (photos.length === 0) return

  // jszip charge dynamiquement (~40 KB gzip) : seulement quand l'utilisateur
  // clique "Telecharger tout", pas dans le bundle initial de l'Album
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  let done = 0

  // Fetch sequentiel (plus fiable sur mobile, evite saturer la connexion)
  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i]
    try {
      const res = await fetch(photo.image_url)
      if (!res.ok) throw new Error('HTTP ' + res.status)
      const blob = await res.blob()
      const filename = buildFilename(photo, i, photos.length)
      zip.file(filename, blob)
    } catch (e) {
      console.warn('Photo skipped:', photo.id, e)
    }
    done++
    onProgress?.(done, photos.length)
  }

  // Generate + download
  const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'STORE' })
  const safeName = sanitize(zipName, 60) || 'album'
  const url = URL.createObjectURL(zipBlob)
  const a = document.createElement('a')
  a.href = url
  a.download = `${safeName}.zip`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
