import type { Metadata, Viewport } from 'next'
import { Fraunces } from 'next/font/google'
import './globals.css'
import InstallBanner from './InstallBanner'

// Police de marque : Fraunces serif editorial, utilisee pour les titres hero
// uniquement (Crew Trips en brand signature). Pour tout le reste de l'app
// (UI, body, boutons) on garde les system fonts pour rester natif iOS/Android.
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['700'],
  style: ['normal'],
  display: 'swap',
  variable: '--font-brand',
})

export const metadata: Metadata = {
  title: 'Crew Trips',
  description: 'Planification de trips de groupe — pêche, ski, chasse et plus',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Crew Trips',
    startupImage: '/apple-touch-icon.png',
  },
  icons: {
    icon: [
      { url: '/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icon-512.png', sizes: '512x512', type: 'image/png' },
    ],
    apple: [
      { url: '/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  themeColor: '#0F2D0F',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" className={fraunces.variable}>
      <body>{children}<InstallBanner /></body>
    </html>
  )
}
