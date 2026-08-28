import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/main/index.ts'),
          'features/libraryScan/libraryScanWorker': resolve(
            'src/main/features/libraryScan/libraryScanWorker.ts',
          ),
          'features/metadata/metadataRefreshWorker': resolve(
            'src/main/features/metadata/metadataRefreshWorker.ts',
          ),
        },
        external: ['better-sqlite3', 'bindings', 'sharp'],
      },
    },
    resolve: {
      alias: {
        '@main': resolve('src/main'),
        '@shared': resolve('src/shared'),
      },
    },
  },
  preload: {
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/preload/index.ts'),
          desktopLyrics: resolve('src/preload/desktopLyrics.ts'),
        },
        output: {
          // Sandboxed Electron preloads run in a restricted CommonJS environment.
          // Keep every entry self-contained because that environment cannot load
          // arbitrary relative chunks.
          format: 'cjs',
          entryFileNames: '[name].cjs',
          inlineDynamicImports: false,
        },
      },
    },
    resolve: {
      alias: {
        '@shared': resolve('src/shared'),
      },
    },
  },
  renderer: {
    root: resolve('src/renderer'),
    resolve: {
      alias: {
        '@renderer': resolve('src/renderer'),
        '@shared': resolve('src/shared'),
      },
    },
    build: {
      rollupOptions: {
        input: {
          index: resolve('src/renderer/index.html'),
        },
      },
    },
    plugins: [vue(), UnoCSS()],
  },
})
