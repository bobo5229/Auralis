import { build } from 'esbuild'
import { resolve } from 'node:path'
await build({
  stdin: {
    contents: "export { PlayStatsRepository } from './src/main/repositories/playStatsRepository'; export { browserPreviewApi } from './src/renderer/shared/ipc/browserPreviewApi'; export { ipcChannels } from './src/shared/ipc/channels'",
    resolveDir: process.cwd(), loader: 'ts',
  },
  outfile: 'output/archive-badge-placement/readers.cjs',
  bundle: true, platform: 'node', format: 'cjs',
  alias: { '@shared': resolve('src/shared') },
})
await build({
  entryPoints: ['src/preload/index.ts'],
  outfile: 'output/archive-badge-placement/preload.cjs',
  bundle: true, platform: 'node', format: 'cjs', external: ['electron'],
  alias: { '@shared': resolve('src/shared') },
})
