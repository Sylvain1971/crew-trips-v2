import { NextRequest, NextResponse } from 'next/server'

/**
 * POST /api/admin/verify
 *
 * Vérifie un code admin côté SERVEUR (pas côté client).
 * Le code est stocké dans ADMIN_CODE (env var serveur, SANS préfixe NEXT_PUBLIC_)
 * pour éviter qu'il soit exposé dans le bundle JS du navigateur.
 *
 * Body: { code: string }
 * Response: { valid: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const code = typeof body?.code === 'string' ? body.code : ''

    // Le code admin est stocké dans ADMIN_CODE (env var serveur, sans préfixe
    // NEXT_PUBLIC_) pour éviter qu'il soit exposé dans le bundle JS client.
    const serverCode = process.env.ADMIN_CODE || ''

    if (!serverCode) {
      // Pas configuré : refuser par défaut
      return NextResponse.json({ valid: false, message: 'Admin non configuré' }, { status: 200 })
    }

    // Comparaison avec délai constant (évite l'attaque par timing)
    if (code.length !== serverCode.length) {
      return NextResponse.json({ valid: false }, { status: 200 })
    }
    let equal = true
    for (let i = 0; i < serverCode.length; i++) {
      if (code.charCodeAt(i) !== serverCode.charCodeAt(i)) equal = false
    }

    return NextResponse.json({ valid: equal }, { status: 200 })
  } catch {
    return NextResponse.json({ valid: false, message: 'Requête invalide' }, { status: 400 })
  }
}
