import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * POST /api/creator/verify
 *
 * Vérifie un code créateur côté SERVEUR.
 * Depuis l'activation RLS, la table `config` n'est plus lisible côté client.
 * Cette route utilise la service_role_key pour lire config.creator_code et
 * comparer avec ce qui est fourni.
 *
 * Fallback : si la service_role_key n'est pas configurée, on utilise la
 * variable serveur CREATOR_CODE (même principe que ADMIN_CODE).
 *
 * Body: { code: string }
 * Response: { valid: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const code = typeof body?.code === 'string' ? body.code : ''

    if (!code) {
      return NextResponse.json({ valid: false }, { status: 200 })
    }

    // Méthode 1 : env var serveur (plus simple, si CREATOR_CODE défini)
    const envCode = process.env.CREATOR_CODE
    if (envCode) {
      const equal = timingSafeCompare(code, envCode)
      return NextResponse.json({ valid: equal }, { status: 200 })
    }

    // Méthode 2 : fallback sur la DB via service_role_key
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    const supaUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
    if (serviceKey && supaUrl) {
      const admin = createClient(supaUrl, serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      })
      const { data } = await admin
        .from('config')
        .select('value')
        .eq('key', 'creator_code')
        .single()
      const storedCode = data?.value || ''
      if (!storedCode) {
        return NextResponse.json({ valid: true }, { status: 200 })
      }
      const equal = timingSafeCompare(code, storedCode)
      return NextResponse.json({ valid: equal }, { status: 200 })
    }

    // Méthode 3 : rien configuré côté serveur → accepter (bootstrap)
    return NextResponse.json({ valid: true }, { status: 200 })
  } catch {
    return NextResponse.json({ valid: false }, { status: 400 })
  }
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let equal = true
  for (let i = 0; i < a.length; i++) {
    if (a.charCodeAt(i) !== b.charCodeAt(i)) equal = false
  }
  return equal
}
