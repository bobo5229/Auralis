import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'
const root = resolve('output/playing-indicator-fix')
await build({ configFile: false, root, base: './', plugins: [vue(), UnoCSS({configFile: resolve('uno.config.ts')})], resolve: { alias: [ {find: '@renderer/shared/ipc/client', replacement: root + '/mockClient.ts'}, {find: /.*\/composables\/usePlayback$/, replacement: root + '/mockPlayback.ts'}, {find: /(?:.*\/)?(?:SongFontWeightSettings|AlbumListParameterSettings|ThemeAccentSettings|ChineseTextSettings|LyricsEffectsSettings)\.vue$/, replacement: root + '/Stub.vue'}, {find: '@renderer', replacement: resolve('src/renderer')}, {find: '@shared', replacement: resolve('src/shared')} ] }, build: {target:'esnext', outDir: root + '/dist', emptyOutDir: false}, logLevel: 'warn' })
const env = {...process.env}; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [root + '/capture.cjs', pathToFileURL(root + '/dist/index.html').href], {env, windowsHide: true, stdio: 'inherit'})
const timer = setTimeout(() => child.kill(), 55000)
const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer); process.exit(code ?? 1)
