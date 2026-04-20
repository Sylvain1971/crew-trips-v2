import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'

export async function generateMetadata(
  { params }: { params: Promise<{ code: string }> }
): Promise<Metadata> {
  const { code } = await params
  const { data } = await supabase.from('trips').select('nom').eq('code', code).single()
  const nom = data?.nom?.slice(0, 20) || 'Crew Trips'
  return {
    title: {
      absolute: nom,   // Empêche Next.js d'ajouter le titre parent " | Crew Trips"
    },
    // Pas de manifest dynamique par trip : on herite du /manifest.json global via app/layout.tsx
    // -> l'icone PWA s'appelle toujours "Crew Trips" et la PWA est installable depuis n'importe quelle page
    // appleWebApp + apple-mobile-web-app-title sont aussi herites du root layout
    // -> coherent avec l'UX "une seule PWA Crew Trips, acces aux trips via le menu Mes trips"
  }
}

export default function TripLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
