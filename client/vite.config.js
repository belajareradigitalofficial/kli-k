import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Diteruskan ke server Express (server/src/index.js).
      // Dengan proxy ini, frontend dan API sama-origin saat development,
      // jadi cookie sesi ikut terkirim tanpa perlu aturan CORS khusus.
      '/api': 'http://localhost:3000',
    },
  },
})
