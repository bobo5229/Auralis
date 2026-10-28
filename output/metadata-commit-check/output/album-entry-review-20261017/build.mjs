import {build} from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import {resolve} from 'node:path'
await build({configFile:false,root:resolve('output/album-entry-review-20261017'),base:'./',plugins:[vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},build:{target:'esnext',outDir:'dist',emptyOutDir:true},logLevel:'warn'})
