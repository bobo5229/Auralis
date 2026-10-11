import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import electron from 'electron'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
await build({ configFile: false, root: resolve('output/cover-bitrate-validation'), base: './', plugins: [vue(), UnoCSS({ configFile: resolve('uno.config.ts'), content: { filesystem: ['src/renderer/features/library/components/AlbumCoverTrackRow.vue', 'output/cover-bitrate-validation/entry.ts'] } })], resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } }, build: { outDir: resolve('output/cover-bitrate-validation/dist'), emptyOutDir: false }, logLevel: 'warn' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [resolve('output/cover-bitrate-validation/capture.cjs'), pathToFileURL(resolve('output/cover-bitrate-validation/dist/index.html')).href], { env, windowsHide: true, stdio: 'inherit' })
const timer = setTimeout(() => child.kill(), 50000)
const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer)
process.exit(code ?? 1)
