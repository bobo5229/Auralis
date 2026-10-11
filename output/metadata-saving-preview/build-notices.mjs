import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { spawnSync } from 'node:child_process'
await build({ configFile: false, ssr: { noExternal: true }, plugins: [vue()], resolve: { alias: { 'vue/server-renderer': resolve('node_modules/@vue/server-renderer/dist/server-renderer.esm-bundler.js'), '@vue/server-renderer': resolve('node_modules/@vue/server-renderer/dist/server-renderer.esm-bundler.js'), 'vue': resolve('node_modules/vue/dist/vue.runtime.esm-bundler.js'), '@renderer': resolve('src/renderer'), '@shared': resolve('src/shared') } }, build: { target: 'esnext', ssr: resolve('output/metadata-saving-preview/check-notices.mjs'), outDir: resolve('output/metadata-saving-preview/dist-ssr'), emptyOutDir: false }, logLevel: 'warn' })
const result = spawnSync(process.execPath, [resolve('output/metadata-saving-preview/dist-ssr/check-notices.js')], { env: { ...process.env, NODE_ENV: 'production' }, stdio: 'inherit', windowsHide: true })
process.exit(result.status ?? 1)
