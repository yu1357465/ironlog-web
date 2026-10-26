/// <reference types="vitest/config" />
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// Dev: Vite serves the app and proxies /api to Django on :8000 (same origin, so session cookies just work).
// Build: output goes to backend/frontend_dist, which Django serves under /static/.
export default defineConfig(({ command }) => ({
  plugins: [react(), tailwindcss()],
  base: command === 'build' ? '/static/' : '/',
  build: {
    outDir: '../backend/frontend_dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 400,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
      '/admin': 'http://127.0.0.1:8000',
    },
  },
  test: {
    environment: 'node',
  },
}))
