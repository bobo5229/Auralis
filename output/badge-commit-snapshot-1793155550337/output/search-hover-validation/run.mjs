import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import electron from 'electron'
import { spawn } from 'node:child_process'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
const baseline = process.argv.includes('--baseline')
const reproduce = process.argv.includes('--reproduce')
const dist = resolve(`output/search-hover-validation/${baseline ? 'dist-baseline' : reproduce ? 'dist-before-second-fix' : 'dist'}`)
await build({ configFile: false, root: resolve('output/search-hover-validation'), base: './', plugins: [vue(), ...(baseline ? [{ name: 'reproduce-previous-hover', transform(code, id) { if (id.replaceAll('\\', '/').endsWith('/useLibrarySearchSession.ts')) return code.replace('options.getSearchHoverExclusionRect?.()', 'null') } }] : []), UnoCSS({ configFile: resolve('uno.config.ts'), content: { filesystem: ['src/renderer/**/*.{vue,ts}', 'output/search-hover-validation/entry.ts'] } })], resolve: { alias: { '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } }, build: { target: 'esnext', outDir: dist, emptyOutDir: false }, logLevel: 'warn' })
const env = { ...process.env }; delete env.ELECTRON_RUN_AS_NODE
const child = spawn(electron, [resolve(`output/search-hover-validation/${reproduce ? 'reproduce.cjs' : 'check.cjs'}`), pathToFileURL(resolve(`${dist}/index.html`)).href], { env, windowsHide: true, stdio: 'inherit' })
const timer = setTimeout(() => child.kill(), 50000)
const code = await new Promise(resolve => child.on('exit', resolve)); clearTimeout(timer)
process.exit(code ?? 1)
