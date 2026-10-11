import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawn } from 'node:child_process'
import { build as buildRenderer } from 'vite'
import vue from '@vitejs/plugin-vue'
import electron from 'electron'

const directory = dirname(fileURLToPath(import.meta.url))
const output = resolve(directory, '../../.electron-home/radio-demo')
const test = process.argv.includes('--test')
await mkdir(output, { recursive: true })
await build({
  entryPoints: [resolve(directory, 'main.ts')],
  outfile: resolve(output, 'main.mjs'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  packages: 'external',
})
await buildRenderer({
  root: directory,
  configFile: false,
  base: './',
  plugins: [vue()],
  define: { __RADIO_DEMO_TEST__: JSON.stringify(test) },
  build: { outDir: resolve(output, 'renderer'), emptyOutDir: true, chunkSizeWarningLimit: 700 },
})
const child = spawn(electron, [resolve(output, 'main.mjs'), ...(test ? ['--test'] : [])], {
  windowsHide: true,
  stdio: 'inherit',
})
child.on('error', (error) => {
  console.error(error)
  process.exitCode = 1
})
child.on('exit', (code) => {
  console.log(`Demo artifacts: ${output}`)
  process.exitCode = code ?? 1
})
