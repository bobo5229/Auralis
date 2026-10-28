import { build } from 'vite'
import vue from '@vitejs/plugin-vue'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { spawn } from 'node:child_process'
import electron from 'electron'
const root = resolve('output/cd-track-alignment-validation')
await build({configFile:false, root, base:'./', plugins:[vue()], resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}}, build:{target:'esnext',outDir:root+'/dist',emptyOutDir:false},logLevel:'warn'})
const env={...process.env};delete env.ELECTRON_RUN_AS_NODE
const child=spawn(electron,[root+'/capture.cjs',pathToFileURL(root+'/dist/index.html').href],{env,windowsHide:true,stdio:'inherit'})
const timeout=setTimeout(()=>child.kill(),55000)
const code=await new Promise(resolve=>child.on('exit',resolve));clearTimeout(timeout);process.exit(code??1)
