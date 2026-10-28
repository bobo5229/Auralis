import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'

const root = resolve('output/playbar-hover-check')
await mkdir(root, { recursive: true })
await writeFile(join(root, 'index.html'), '<div id="app"></div><script type="module" src="/fixture.ts"></script>')
await writeFile(join(root, 'fixture.ts'), `
import {createApp,h} from 'vue'; import {createI18n} from 'vue-i18n';
import TrackProgressInfo from '@renderer/app/layout/TrackProgressInfo.vue';
import '@renderer/app/styles/main.css'; import 'virtual:uno.css';
document.documentElement.dataset.theme='light';
createApp({render:()=>h('div',{class:'player-bar',style:'padding:50px'},[h('div',{class:'player-bar-island',style:'width:420px;pointer-events:auto'},[h('div',{class:'player-bar-row',style:'grid-template-columns:minmax(0,1fr)'},[h(TrackProgressInfo,{showProgress:true,showSplitClocks:true})])])])}).use(createI18n({legacy:false,locale:'zh',messages:{zh:{player:{fullscreen:'全屏播放',unknownTrack:'未知曲目',progress:'播放进度'}}}})).mount('#app');
`)
const mocks = {
  '@renderer/features/playback/composables/usePlayback': `import {reactive} from 'vue'; const state=reactive({currentTrack:{id:1,title:'A very long track title to check clipping and layout in the playback bar',artworkCacheKey:null},currentTrackId:1,currentTime:65,duration:245,isPlaying:false}); window.fixtureState=state; window.fixtureSeeks=[]; export const usePlayback=()=>({state,seekByRatio:r=>window.fixtureSeeks.push(r),seekTo:t=>window.fixtureSeeks.push(t)});`,
  '@renderer/features/playback/composables/useFullscreenPlayer': `import {ref} from 'vue'; export const useFullscreenPlayer=()=>({isFullscreenPlayerOpen:ref(false),openFullscreenPlayer(){}});`,
  '@renderer/features/playback/composables/usePlaybackMetadataDisplay': `export const usePlaybackMetadataDisplay=()=>({songText:x=>x,playbackSubtitle:()=> 'Example artist'});`,
  '@renderer/features/playback/composables/usePlayerDisplayMode': `import {ref} from 'vue'; export const usePlayerDisplayMode=()=>({displayMode:ref('normal')});`,
  '@renderer/shared/animation/windowVisibility': `export const observeWindowVisibility=fn=>{fn(true);return ()=>{}};`,
}
const mockPlugin={name:'fixture-mocks',enforce:'pre',resolveId(id){const key=Object.keys(mocks).find(k=>id===k || id.replaceAll('\\','/').endsWith(k.replace('@renderer','src/renderer')));if(key)return '\0'+key},load(id){if(id.startsWith('\0') && mocks[id.slice(1)])return mocks[id.slice(1)]}}
const server=await createServer({configFile:false,root,cacheDir:join(root,'vite-cache'),plugins:[mockPlugin,vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}})
await server.listen()
const url='http://127.0.0.1:'+server.httpServer.address().port+'/'
await writeFile(join(root,'electron.mjs'), `
import {app,BrowserWindow} from 'electron'; import {writeFile} from 'node:fs/promises'; import {join} from 'node:path';
const root=${JSON.stringify(root)}; app.setPath('userData',join(root,'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:600,height:250,show:false,webPreferences:{backgroundThrottling:false}});const js=s=>win.webContents.executeJavaScript(s);const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(x,m)=>{if(!x)throw Error(m)};
try {await win.loadURL(${JSON.stringify(url)}); await wait(600); win.webContents.debugger.attach('1.3');const c=win.webContents.debugger;await c.sendCommand('DOM.enable');await c.sendCommand('CSS.enable');const doc=await c.sendCommand('DOM.getDocument');const node=await c.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.track-progress'});
const state=()=>js("(()=>{const rail=document.querySelector('.track-progress').getBoundingClientRect(), cover=document.querySelector('.track-cover').getBoundingClientRect(), clocks=document.querySelector('.player-bar-hover-clocks'), left=clocks.children[0].getBoundingClientRect(), right=clocks.children[1].getBoundingClientRect();return {rail:[rail.left,rail.right],gap:rail.top-left.bottom,cover:cover.left,left:left.left,right:right.right, opacity:getComputedStyle(clocks).opacity,visibility:getComputedStyle(clocks).visibility,pointer:getComputedStyle(clocks).pointerEvents, text:clocks.textContent}})()");
let initial=await state();check(initial.opacity==='0'&&initial.visibility==='hidden','initial clocks visible');check(Math.abs(initial.rail[0]-initial.cover)<1,'rail and cover not aligned');await c.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['hover']});await wait(800);let hover=await state();check(hover.opacity==='1'&&hover.pointer==='none','hover clocks absent or block pointer');check(Math.abs(hover.gap-4)<0.1,'clock-to-rail gap: '+hover.gap);check(Math.abs(hover.left-hover.rail[0])<1&&Math.abs(hover.right-hover.rail[1])<1,'alignment');check(Math.abs(initial.rail[0]-hover.rail[0])<1&&Math.abs(initial.rail[1]-hover.rail[1])<1,'rail shifted');check(hover.text.includes('1:05')&&hover.text.includes('4:05'),'clock values');win.webContents.invalidate();await wait(200);await writeFile(join(root,'hover-light.png'),(await win.webContents.capturePage()).toPNG());
await js('document.documentElement.dataset.theme="dark"; document.documentElement.dataset.reducedMotion="true"; document.querySelector(".player-bar-island").style.width="280px"');await wait(150);hover=await state();check(Math.abs(hover.left-hover.rail[0])<1&&Math.abs(hover.right-hover.rail[1])<1,'narrow alignment');const duration=await js('getComputedStyle(document.querySelector(".player-bar-hover-clocks")).transitionDuration');console.log('reduced duration',duration);check(duration.split(', ').every(x=>x==='0s'),'reduced motion');await writeFile(join(root,'hover-dark-narrow.png'),(await win.webContents.capturePage()).toPNG());
await c.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:[]});await wait(200);check((await state()).visibility==='hidden','clocks remain after exit');await js('window.fixtureState.duration=0');await c.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['hover']});await wait(100);check((await state()).visibility==='hidden','unseekable clocks visible');console.log('PASS: initial, hover, alignment, stable geometry, clocks, exit, dark narrow, reduced motion, unseekable');app.exit(0)}catch(e){console.error(e);app.exit(1)}});`)
try { await new Promise((done,reject)=>{const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[join(root,'electron.mjs')],{windowsHide:true,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});const timer=setTimeout(()=>{child.kill();reject(Error('fixture timeout'))},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('fixture exit '+code))})})} finally {await server.close()}
