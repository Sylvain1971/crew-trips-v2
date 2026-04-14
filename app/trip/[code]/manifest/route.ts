import { NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const { data } = await supabase.from('trips').select('nom').eq('code', code).single()
  const nom = data?.nom ? data.nom.slice(0, 20) : 'Crew Trips'
  return NextResponse.json({
    name: nom,
    short_name: nom,
    description: 'Crew Trips — planification de groupe',
    start_url: `/trip/${code}`,
    display: 'standalone',
    background_color: '#0F2D0F',
    theme_color: '#0F2D0F',
    orientation: 'portrait',
    icons: [
      { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }, {
    headers: { 'Content-Type': 'application/manifest+json' }
  })
}
