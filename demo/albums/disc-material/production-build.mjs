import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('.', import.meta.url))
await build({
  configFile: false,
  root,
  base: './',
  logLevel: 'warn',
  plugins: [vue(), UnoCSS({ configFile: path.resolve(root, '../../../uno.config.ts') })],
  resolve: {
    alias: [
      ...['usePlayback', 'useArtworkPalette', 'getArtworkUrl'].map((name) => ({
        find: new RegExp('^(?:.*/)?' + name + '$'),
        replacement: path.join(root, 'production-fixture.ts'),
      })),
      {
        find: '@renderer/shared/ipc/client',
        replacement: path.join(root, 'production-fixture.ts'),
      },
      { find: '@renderer', replacement: path.resolve(root, '../../../src/renderer') },
      { find: '@shared', replacement: path.resolve(root, '../../../src/shared') },
    ],
  },
  build: {
    outDir: path.resolve(root, '../../../.electron-home/disc-material-demo/production-dist'),
    emptyOutDir: false,
    target: 'esnext',
    rollupOptions: { input: path.join(root, 'production.html') },
  },
})
