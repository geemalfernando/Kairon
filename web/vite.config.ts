import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'prompt',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Kairon Operations',
        short_name: 'Kairon',
        description: 'Plan, load, deliver and recover — one shared logistics operation that keeps working offline.',
        start_url: '/login',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0a1315',
        theme_color: '#106c6c',
        categories: ['business', 'productivity', 'navigation'],
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          { src: '/favicon.svg', sizes: 'any', type: 'image/svg+xml' },
        ],
        shortcuts: [
          { name: "Today's route", short_name: 'Route', url: '/driver/route', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Loading trips', short_name: 'Load', url: '/loader/trips', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
          { name: 'Sync status', short_name: 'Sync', url: '/driver/sync', icons: [{ src: '/pwa-192.png', sizes: '192x192' }] },
        ],
      },
      workbox: {
        // The whole app shell is precached, so every screen opens without a network.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest}'],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.googleapis.com',
            handler: 'StaleWhileRevalidate',
            options: { cacheName: 'google-fonts-css' },
          },
          {
            urlPattern: ({ url }) => url.origin === 'https://fonts.gstatic.com',
            handler: 'CacheFirst',
            options: { cacheName: 'google-fonts', expiration: { maxEntries: 30, maxAgeSeconds: 60 * 60 * 24 * 365 }, cacheableResponse: { statuses: [0, 200] } },
          },
        ],
      },
      devOptions: { enabled: false },
    }),
  ],
  // One bundle on purpose: after a single visit the whole app is cached for offline use.
  build: { chunkSizeWarningLimit: 800 },
})
