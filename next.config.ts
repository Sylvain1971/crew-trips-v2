import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compression gzip/brotli cote serveur (redondant avec Vercel mais utile en local/preview)
  compress: true,

  // Optimisation des images : formats modernes AVIF/WebP, redimensionnement automatique
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: 'img.youtube.com',
      },
      {
        protocol: 'https',
        hostname: 'i.ytimg.com',
      },
    ],
  },

  experimental: {
    // Tree-shake automatique des imports de packages (supabase a beaucoup de sous-modules)
    optimizePackageImports: [
      '@supabase/supabase-js',
      'react-zoom-pan-pinch',
    ],
  },
};

export default nextConfig;
