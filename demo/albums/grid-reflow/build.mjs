import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import path from 'node:path'

const root = path.resolve('demo/albums/grid-reflow')
const production = process.argv.includes('--production')
// Keep the comparison layer isolated; --production mounts the actual shipped component.
await build({
  configFile: false,
  root,
  base: './',
  plugins: [vue(), UnoCSS({ configFile: path.resolve('uno.config.ts') })],
  resolve: {
    alias: [
      ...(production
        ? []
        : [
            {
              find: '../components/AlbumGridTransitionLayer.vue',
              replacement: path.join(root, 'ComparisonTransitionLayer.vue'),
            },
          ]),
      ...[
        'getArtworkUrl',
        'useArtworkPalette',
        'usePlayback',
        'usePlayerDisplayMode',
        'useAlbumCatalog',
      ].map((name) => ({
        find: new RegExp('^(?:.*/)?' + name + '$'),
        replacement: path.join(root, 'fixture.ts'),
      })),
      { find: '@renderer/shared/ipc/client', replacement: path.join(root, 'fixture.ts') },
      { find: '@renderer', replacement: path.resolve('src/renderer') },
      { find: '@shared', replacement: path.resolve('src/shared') },
    ],
  },
  build: {
    outDir: path.resolve(
      '.electron-home/grid-reflow-demo',
      production ? 'production-dist' : 'dist',
    ),
    emptyOutDir: false,
    target: 'esnext',
    minify: false,
  },
})
