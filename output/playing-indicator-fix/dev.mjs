import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'node:path'
import { spawn } from 'node:child_process'
import electron from 'electron'
const root = resolve('output/playing-indicator-fix')
const server = await createServer({ configFile: false, root, plugins: [vue(), UnoCSS({configFile: resolve('uno.config.ts')})], resolve: { alias: [ {find: '@renderer/shared/ipc/client', replacement: root + '/mockClient.ts'}, {find: /.*\/composables\/usePlayback$/, replacement: root + '/mockPlayback.ts'}, {find: /(?:.*\/)?(?:SongFontWeightSettings|AlbumListParameterSettings|ThemeAccentSettings|ChineseTextSettings|LyricsEffectsSettings)\.vue$/, replacement: root + '/Stub.vue'}, {find: '@renderer', replacement: resolve('src/renderer')}, {find: '@shared', replacement: resolve('src/shared')} ] }, server: {port: 5197, strictPort: true}, logLevel: 'warn' })
await server.listen()
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [root + '/capture.cjs', 'http://localhost:5197'], {env, windowsHide: true, stdio: 'inherit'})
const timer = setTimeout(() => child.kill(), 55000)
const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer); await server.close(); process.exit(code ?? 1)
