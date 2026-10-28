import {createServer} from 'vite';import vue from '@vitejs/plugin-vue';import UnoCSS from 'unocss/vite';import {spawn} from 'node:child_process';import {resolve,join} from 'node:path';
const root=resolve('output/enhanced-lrc-validation');
const server=await createServer({configFile:false,root,cacheDir:join(root,'vite-cache'),plugins:[vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}});
await server.listen();const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
try{await new Promise((done,reject)=>{const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[join(root,'extra-main.mjs'),'http://127.0.0.1:'+server.httpServer.address().port+'/'],{env,windowsHide:true,stdio:'inherit'});const timer=setTimeout(()=>{child.kill();reject(Error('extra timeout'))},60000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('extra exit '+code))})})}finally{await server.close()}

