// Compression d'image côté client avant upload.
// Objectif : réduire une photo iPhone 4 MB à ~300-500 KB sans perte visible.
// Utilise un canvas HTML5 pour redimensionner + re-encoder en JPEG qualité 80.
//
// - Redimensionne si la plus grande dimension dépasse maxSize (1600px par défaut)
// - Ré-encode en JPEG qualité 0.80 (bon compromis taille/qualité pour du partage)
// - Préserve le ratio d'aspect
// - Si l'image est déjà petite (<200 KB) et pas énorme en dimensions, renvoie l'original
//
// Fonctionne avec JPEG, PNG, HEIC (via décodage natif du <img>), WebP.

export async function compressImage(
  file: File,
  maxSize: number = 1600,
  quality: number = 0.80
): Promise<File> {
  // Shortcut : fichier déjà petit → pas de recompression
  if (file.size < 200 * 1024) return file

  // 1. Charger dans un <img> via ObjectURL
  const img = await loadImage(file)

  // 2. Calculer les dimensions cibles (ratio préservé)
  const { width: w, height: h } = img
  let targetW = w, targetH = h
  if (Math.max(w, h) > maxSize) {
    if (w >= h) {
      targetW = maxSize
      targetH = Math.round(h * (maxSize / w))
    } else {
      targetH = maxSize
      targetW = Math.round(w * (maxSize / h))
    }
  } else if (file.size < 1024 * 1024) {
    // Image déjà petite en dimensions ET pas trop lourde : skip
    return file
  }

  // 3. Canvas pour redimensionner
  const canvas = document.createElement('canvas')
  canvas.width = targetW
  canvas.height = targetH
  const ctx = canvas.getContext('2d')
  if (!ctx) return file
  ctx.drawImage(img, 0, 0, targetW, targetH)

  // 4. Exporter en JPEG
  const blob: Blob = await new Promise((resolve, reject) => {
    canvas.toBlob(
      b => b ? resolve(b) : reject(new Error('toBlob returned null')),
      'image/jpeg',
      quality
    )
  })

  // Si la "compression" donne un fichier plus gros, on garde l'original
  if (blob.size >= file.size) return file

  // Générer un nom avec extension .jpg
  const originalName = file.name.replace(/\.[^.]+$/, '') || 'photo'
  return new File([blob], `${originalName}.jpg`, { type: 'image/jpeg' })
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')) }
    img.src = url
  })
}
