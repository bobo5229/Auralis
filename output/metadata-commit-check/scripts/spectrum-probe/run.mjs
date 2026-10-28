import { build as buildBundle } from 'esbuild'
import { build } from 'vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'

const normalMotion = process.argv.includes('--normal-motion')
const root = resolve(
  normalMotion ? '.electron-home/normal-motion-probe' : '.electron-home/spectrum-probe',
)
await mkdir(root, { recursive: true })
const verify = process.argv.includes('--verify')
const provided = process.argv
  .slice(2)
  .filter((value) => !['--verify', '--normal-motion'].includes(value))
const tracks = provided.length
  ? provided
  : [
      'E:/Songs.Collection/Hearts2Hearts/RUDE! - Single/Hearts2Hearts - RUDE!.m4a',
      'E:/Songs.Collection/aespa/LEMONADE - The 2nd Album/aespa - 02. LEMONADE.m4a',
    ]
if (tracks.length !== 2) throw new Error('Provide exactly two music files')
await writeFile(
  resolve(root, 'options.json'),
  JSON.stringify({ verify, normalMotion, tracks: tracks.map((path) => resolve(path)) }),
)
await buildBundle({
  entryPoints: ['scripts/spectrum-probe/main.ts'],
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
  outfile: resolve(root, 'main.mjs'),
  alias: { '@shared': resolve('src/shared'), '@main': resolve('src/main') },
})
await buildBundle({
  entryPoints: ['src/preload/index.ts'],
  bundle: true,
  platform: 'node',
  format: 'cjs',
  packages: 'external',
  outfile: resolve(root, 'preload.cjs'),
  alias: { '@shared': resolve('src/shared') },
})
await build({
  configFile: false,
  base: './',
  resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } },
  build: {
    outDir: resolve(root, 'renderer'),
    emptyOutDir: true,
    rollupOptions: {
      input: resolve(
        normalMotion ? 'demo/albums/cd-normal-motion.html' : 'demo/albums/cd-spectrum-live.html',
      ),
    },
  },
})
const child = spawn(electron, [resolve(root, 'main.mjs')], {
  windowsHide: verify,
  stdio: 'inherit',
})
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  process.exitCode = code ?? 1
})
