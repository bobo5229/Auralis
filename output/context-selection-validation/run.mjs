import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import electron from 'electron'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const directory = resolve('output/context-selection-validation')
await build({
  configFile: false,
  root: resolve('output/search-hover-validation'),
  base: './',
  plugins: [vue(), {
    name: 'long-album-fixture',
    transform(code, id) {
      if (id.replaceAll('\\', '/').endsWith('/search-hover-validation/entry.ts')) {
        return code.replace('length: 30', "length: new URLSearchParams(location.search).has('long') ? 130 : 30")
      }
    },
  }, UnoCSS({ configFile: resolve('uno.config.ts'), content: { filesystem: ['src/renderer/**/*.{vue,ts}'] } })],
  resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } },
  build: { target: 'esnext', outDir: resolve(directory, 'dist'), emptyOutDir: false },
  logLevel: 'warn',
})
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [resolve(directory, 'check.cjs'), pathToFileURL(resolve(directory, 'dist/index.html')).href], { env, windowsHide: true, stdio: 'inherit' })
const timer = setTimeout(() => child.kill(), 55000)
const code = await new Promise(resolve => child.on('exit', resolve))
clearTimeout(timer)
process.exit(code ?? 1)
