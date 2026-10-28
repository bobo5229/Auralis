import {createServer} from 'vite';
import vue from '@vitejs/plugin-vue';
import UnoCSS from 'unocss/vite';
import {build} from 'esbuild';
import {spawn,execFileSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';
const root=resolve('output/enhanced-lrc-validation');
await mkdir(root,{recursive:true});
execFileSync(resolve('resources/audio/ffmpeg.exe'),['-nostdin','-v','error','-y','-f','lavfi','-i','sine=frequency=440:sample_rate=48000:duration=54','-af','volume=0.01','-c:a','pcm_s16le',join(root,'clock.wav')],{windowsHide:true});
await build({entryPoints:['src/main/features/audio/nativePlaybackService.ts'],bundle:true,platform:'node',format:'esm',packages:'external',outfile:join(root,'native-service.mjs'),alias:{'@main':resolve('src/main'),'@shared':resolve('src/shared')}});
await writeFile(join(root,'index.html'),'<html><body><div id="app"></div><script type="module" src="/bootstrap.ts"></script></body></html>');
const server=await createServer({configFile:false,root,cacheDir:join(root,'vite-cache'),plugins:[vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}});
await server.listen();
const url='http://127.0.0.1:'+server.httpServer.address().port+'/';
try {
 await new Promise((done,reject)=>{
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[join(root,'main.mjs'),url],{env,windowsHide:true,stdio:'inherit'});
  const timer=setTimeout(()=>{child.kill();reject(Error('validation timeout'))},240000);
  child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('Electron validation exit '+code))});
 });
} finally {await server.close()}

