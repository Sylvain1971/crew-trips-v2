import type { Metadata } from 'next'
import { supabase } from '@/lib/supabase'

export async function generateMetadata(
  { params }: { params: Promise<{ token: string }> }
): Promise<Metadata> {
  const { token } = await params
  const { data } = await supabase.from('trips').select('nom').eq('share_token', token).maybeSingle()
  const nom = data?.nom?.slice(0, 20) || 'Album'
  return {
    title: { absolute: nom + ' — Album' },
    robots: { index: false, follow: false },
  }
}

export default function AlbumPublicLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
