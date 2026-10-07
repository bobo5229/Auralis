import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { build as buildRenderer } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import electron from 'electron'

const root = resolve('.electron-home/tag-write-probe')
await mkdir(root, { recursive: true })
if (process.argv.includes('--ui')) {
  await build({
    entryPoints: ['scripts/tag-write-probe/ui.ts'],
    outfile: resolve(root, 'ui.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
  })
  await buildRenderer({
    configFile: false,
    base: './',
    plugins: [vue(), UnoCSS()],
    resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } },
    build: {
      outDir: resolve(root, 'renderer'),
      emptyOutDir: true,
      rollupOptions: { input: resolve('scripts/tag-write-probe/index.html') },
    },
  })
  const ui = spawn(electron, [resolve(root, 'ui.mjs')], { windowsHide: true, stdio: 'inherit' })
  ui.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  ui.on('exit', (code) => {
    console.log(`Artifacts: ${root}`)
    process.exitCode = code ?? 1
  })
} else {
  await build({
    entryPoints: ['scripts/tag-write-probe/audio.ts'],
    outfile: resolve(root, 'audio.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
    packages: 'external',
    alias: { '@main': resolve('src/main'), '@shared': resolve('src/shared') },
  })
  const directory = resolve(root, new Date().toISOString().replace(/[:.]/g, '-'))
  const child = spawn(
    process.execPath,
    [resolve(root, 'audio.mjs'), directory, ...process.argv.slice(2)],
    { windowsHide: true, stdio: 'inherit' },
  )
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    console.log(`Artifacts: ${directory}`)
    process.exitCode = code ?? 1
  })
}
