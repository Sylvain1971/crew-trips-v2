import type { Metadata, Viewport } from 'next'
import './globals.css'
import InstallBanner from './InstallBanner'

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
    <html lang="fr">
      <head>
        <script dangerouslySetInnerHTML={{__html: `
          (function() {
            try {
              var p = window.location.pathname;
              if (p === '/' || p === '' || p === '/index.html') {
                var last = localStorage.getItem('crew-last-trip');
                if (last) {
                  window.location.replace('/trip/' + last);
                }
              }
            } catch(e) {}
          })();
        `}} />
      </head>
      <body>{children}<InstallBanner /></body>
    </html>
  )
}
