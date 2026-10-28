import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
const root = resolve('output/playbar-cover-fixture')
await mkdir(root, { recursive: true })
await writeFile(join(root, 'index.html'), '<html><body><div id="app"></div><script type="module" src="/fixture.ts"></script></body></html>')
await writeFile(join(root, 'fixture.ts'), `
import {createApp,h} from 'vue'; import {createI18n} from 'vue-i18n';
import TrackProgressInfo from '@renderer/app/layout/TrackProgressInfo.vue';
import '@renderer/app/styles/main.css'; import 'virtual:uno.css';
createApp({render:()=>h('div',{class:'player-bar',style:'padding:80px'},[h('div',{class:'player-bar-island',style:'width:300px;pointer-events:auto'},[h(TrackProgressInfo,{showProgress:false})])])}).use(createI18n({legacy:false,locale:'zh',messages:{zh:{player:{fullscreen:'进入全屏播放',unknownTrack:'未知曲目'}}}})).mount('#app');
`)
const mocks = {
 '@renderer/features/playback/composables/usePlayback': `import {reactive} from 'vue'; const state=reactive({currentTrack:{id:1,title:'Example track',artworkCacheKey:'cover'},currentTrackId:1,currentTime:0,duration:0}); window.fixtureState=state; export const usePlayback=()=>({state});`,
 '@renderer/features/playback/composables/useFullscreenPlayer': `import {ref} from 'vue'; const isFullscreenPlayerOpen=ref(false); window.fixtureFullscreen=isFullscreenPlayerOpen; export const useFullscreenPlayer=()=>({isFullscreenPlayerOpen,openFullscreenPlayer(){isFullscreenPlayerOpen.value=true}});`,
 '@renderer/features/playback/composables/usePlaybackMetadataDisplay': `export const usePlaybackMetadataDisplay=()=>({songText:x=>x,playbackSubtitle:()=> 'Example artist'});`,
 '@renderer/shared/media/getArtworkUrl': `export const getArtworkUrl=key=>key ? 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="40" height="40"%3E%3Crect width="40" height="40" fill="%23eee"/%3E%3C/svg%3E' : null;`
}
const mockPlugin={name:'fixture-mocks',enforce:'pre',resolveId(id){if(id.includes('usePlayback') || id.includes('FullscreenPlayer'))console.log('RESOLVE',id);const key=Object.keys(mocks).find(k=>id===k || id.replaceAll('\\','/').endsWith(k.replace('@renderer','src/renderer'))); if(key)return '\0'+key},load(id){if(id.startsWith('\0') && mocks[id.slice(1)])return mocks[id.slice(1)]}}
const server=await createServer({configFile:false,root,cacheDir:join(root,'vite-cache'),plugins:[mockPlugin,vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}})
await server.listen(); const url='http://127.0.0.1:'+server.httpServer.address().port+'/'
await writeFile(join(root,'electron.mjs'), `
import {app,BrowserWindow} from 'electron'; import {writeFile} from 'node:fs/promises'; import {join} from 'node:path';
const root=${JSON.stringify(root)}; app.setPath('userData',join(root,'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:500,height:300,show:false,webPreferences:{backgroundThrottling:false}}); win.webContents.on('console-message', e=>console.log('RENDERER',e.level,e.message)); const js=s=>win.webContents.executeJavaScript(s); const wait=ms=>new Promise(r=>setTimeout(r,ms)); const check=(x,m)=>{if(!x)throw Error(m)};
try {await win.loadURL(${JSON.stringify(url)}); await wait(900); win.webContents.debugger.attach('1.3'); const c=win.webContents.debugger; await c.sendCommand('DOM.enable'); await c.sendCommand('CSS.enable'); const doc=await c.sendCommand('DOM.getDocument'); const node=await c.sendCommand('DOM.querySelector',{nodeId:doc.root.nodeId,selector:'.track-cover'}); const opacity=()=>js('getComputedStyle(document.querySelector(".track-cover-fullscreen")).opacity');
check(await opacity()==='0','initial overlay visible'); await c.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['hover']}); await wait(300); check(await opacity()==='1','hover overlay absent'); await writeFile(join(root,'hover.png'),(await win.webContents.capturePage()).toPNG());
await js('document.querySelector(".track-cover").click()'); await wait(50); check(await js('window.fixtureFullscreen.value'),'click did not open'); await js('window.fixtureFullscreen.value=false'); await wait(50);
await c.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:[]}); await js('document.querySelector(".track-cover").dispatchEvent(new FocusEvent("blur"))'); await c.sendCommand('CSS.forcePseudoState',{nodeId:node.nodeId,forcedPseudoClasses:['focus-visible']}); await wait(300); check(await opacity()==='1','keyboard overlay absent'); await writeFile(join(root,'focus.png'),(await win.webContents.capturePage()).toPNG());
await js('document.querySelector(".track-cover").dispatchEvent(new KeyboardEvent("keydown",{key:"Enter",bubbles:true}))'); await wait(50); check(await js('window.fixtureFullscreen.value'),'keyboard did not open'); await js('window.fixtureFullscreen.value=false'); await wait(80); check(await js('document.querySelector(".track-cover").dataset.fullscreenFocusRestored')==='keyboard','keyboard focus restore');
await js('window.fixtureState.currentTrack.artworkCacheKey=null; document.documentElement.dataset.reducedMotion="true"'); await wait(100); check(await opacity()==='1','fallback overlay missing'); console.log('TRANSITION',await js('getComputedStyle(document.querySelector(".track-cover-fullscreen")).transitionDuration')); check(await js('getComputedStyle(document.querySelector(".track-cover-fullscreen")).transitionDuration')==='0s','reduced motion transition'); await writeFile(join(root,'fallback.png'),(await win.webContents.capturePage()).toPNG()); console.log('PASS: initial, forced hover/focus, click, Enter, focus restoration, fallback and reduced motion');app.exit(0)
} catch(e){console.error(e);app.exit(1)} });`)
try { await new Promise((done,reject)=>{const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[join(root,'electron.mjs')],{windowsHide:true,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});const timer=setTimeout(()=>{child.kill();reject(Error('fixture timeout'))},45000); child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('fixture exit '+code))})})} finally {await server.close()}

