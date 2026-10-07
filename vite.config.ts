import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// BASE ustawiamy przy wdrożeniu na GitHub Pages (strona żyje pod /<nazwa-repo>/).
const base = process.env.BASE ?? '/';

export default defineConfig({
  base,
  plugins: [
    react(),
    // Service Worker: zapisuje całą aplikację w pamięci podręcznej, więc po pierwszym
    // otwarciu działa bez internetu. `autoUpdate` = nowa wersja wchodzi po ponownym uruchomieniu.
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Tablica – zeszyty',
        short_name: 'Tablica',
        description: 'Cyfrowe zeszyty A4: rysik, klawiatura, wzory, offline.',
        lang: 'pl',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F3F2EF',
        theme_color: '#F3F2EF',
        start_url: '.',
        scope: '.',
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2,ttf,mjs,wasm}'],
        maximumFileSizeToCacheInBytes: 8 * 1024 * 1024,
      },
    }),
  ],
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
