import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@renderer': fileURLToPath(new URL('./src/renderer', import.meta.url)),
      '@shared': fileURLToPath(new URL('./src/shared', import.meta.url)),
      '@main': fileURLToPath(new URL('./src/main', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    // Component tests mount Vue with a custom renderer in the Node environment.
    testTransformMode: { web: ['**/SongRow.test.ts', '**/AlbumCard.test.ts'] },
    include: ['src/**/*.test.ts'],
    exclude: [...configDefaults.exclude, 'src/**/*.native.test.ts'],
  },
})
