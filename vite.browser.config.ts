import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  root: resolve('src/renderer'),
  plugins: [vue(), UnoCSS()],
  optimizeDeps: {
    // The palette worker loads this dependency only when the first cover is rendered.
    include: ['image-q'],
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
