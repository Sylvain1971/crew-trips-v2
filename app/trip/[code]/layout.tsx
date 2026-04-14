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
    manifest: `/trip/${code}/manifest`,
    appleWebApp: {
      capable: true,
      statusBarStyle: 'black-translucent',
      title: nom,   // iOS lit ce champ pour pré-remplir le nom de l'icône
    },
    other: {
      // Forcer iOS à utiliser le nom complet (évite le parsing par mots)
      'apple-mobile-web-app-title': nom,
    }
  }
}

export default function TripLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
