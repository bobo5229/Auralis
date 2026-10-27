import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [vue(), UnoCSS()],
  // Keep this mode's optimized dependencies separate from the other dev server.
  cacheDir: resolve('node_modules/.vite/browser-preview'),
  optimizeDeps: {
    // Pre-bundle worker and page dependencies before their first runtime import.
    include: ['image-q', 'pinyin-pro', 'vue-color'],
  },
  resolve: {
    alias: {
      '@renderer': resolve('src/renderer'),
      '@shared': resolve('src/shared'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
})
