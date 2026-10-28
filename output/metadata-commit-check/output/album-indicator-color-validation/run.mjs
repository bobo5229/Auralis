import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import electron from 'electron'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const directory = resolve('output/album-indicator-color-validation')
await build({ configFile: false, root: directory, base: './',
  plugins: [vue(), UnoCSS({ configFile: resolve('uno.config.ts'), content: { filesystem: ['src/renderer/**/*.{vue,ts}'] } })],
  resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } },
  build: { target: 'esnext', outDir: resolve(directory, 'dist'), emptyOutDir: false }, logLevel: 'warn',
})
const env = { ...process.env }
delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [resolve(directory, 'check.cjs'), pathToFileURL(resolve(directory, 'dist/index.html')).href], { env, windowsHide: true, stdio: 'inherit' })
const timer = setTimeout(() => child.kill(), 45000)
const code = await new Promise(resolve => child.on('exit', resolve))
clearTimeout(timer)
process.exit(code ?? 1)
