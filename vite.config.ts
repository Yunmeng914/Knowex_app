/**
 * Standalone Vite configuration for the Web renderer SPA.
 * Output builds into `dist/client` and preserves `@renderer` / `@shared` aliases.
 */
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  root: resolve('src/renderer'),
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer/src'),
      '@shared': resolve('src/shared')
    }
  },
  build: {
    outDir: resolve('dist/client'),
    emptyOutDir: true
  },
  plugins: [react()]
})
