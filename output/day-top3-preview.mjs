import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { spawn } from 'node:child_process'
const root = resolve('output/day-top3-preview')
await mkdir(root, { recursive: true })
await writeFile(join(root, 'index.html'), '<html><body><div id="app"></div><script type="module" src="/fixture.ts"></script></body></html>')
await writeFile(join(root, 'fixture.ts'), `
import {createApp,h,reactive} from 'vue'; import {createI18n} from 'vue-i18n';
import Panel from '@renderer/features/archive/components/ArchiveDayAlbums.vue';
import zh from '@renderer/locales/zh-Hans.json';
import '@renderer/app/styles/main.css'; import 'virtual:uno.css';
const tracks=[{trackId:1,title:'All Too Well (Taylor’s Version)',artist:'Taylor Swift',artworkCacheKey:'1989',playCount:12},{trackId:2,title:'Something',artist:'The Beatles',artworkCacheKey:'abbey-road',playCount:8},{trackId:3,title:'那些年，我们一起听过的歌 · Live at the Blue Note',artist:'示例艺术家; Guest Artist',artworkCacheKey:'kind-of-blue',playCount:5}];
window.fixture=reactive({tracks,loading:false,failed:false});
const albums=tracks.map((t,i)=>({album:['1989','Abbey Road','Kind of Blue'][i],albumArtist:t.artist,artworkCacheKey:t.artworkCacheKey,playCount:t.playCount,durationSeconds:800,trackCount:3}));
createApp({render:()=>h('main',{style:'padding:12px 32px 32px;max-width:1440px;margin:auto'},[h(Panel,{date:'2026-10-28',albums,loading:false,failed:false})])}).use(createI18n({legacy:false,locale:'zh-Hans',messages:{'zh-Hans':zh}})).mount('#app');
`)
const mocks = {
 '/features/archive/composables/useDayTopTracks': `import {toRef} from 'vue'; export const useDayTopTracks=()=>({tracks:toRef(window.fixture,'tracks'),loading:toRef(window.fixture,'loading'),failed:toRef(window.fixture,'failed'),refresh:()=>{window.fixture.failed=false}});`,
 '/shared/ipc/client': `export const auralis={archive:{},library:{}};`,
 '/shared/media/getArtworkUrl': `export const getArtworkUrl=k=>k ? '/@fs/${resolve('demo/playback/palette-comparison/assets').replaceAll('\\','/')}/'+k+'.jpg':null;`
}
const mockPlugin={name:'fixture-mocks',enforce:'pre',resolveId(id){const key=Object.keys(mocks).find(k=>id.replaceAll('\\','/').endsWith(k)||id.endsWith(k+'.ts')||(k.endsWith('useDayTopTracks') && id.endsWith('/useDayTopTracks')));if(key)return '\0'+key},load(id){if(id.startsWith('\0'))return mocks[id.slice(1)]}}
const server=await createServer({configFile:false,root,cacheDir:join(root,'vite-cache'),plugins:[mockPlugin,vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}})
await server.listen()
const url='http://127.0.0.1:'+server.httpServer.address().port+'/'
await writeFile(join(root,'electron.mjs'), `
import {app,BrowserWindow} from 'electron'; import {writeFile} from 'node:fs/promises'; import {join} from 'node:path';
const root=${JSON.stringify(root)}; app.setPath('userData',join(root,'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:1120,height:950,show:false,webPreferences:{backgroundThrottling:false}});win.webContents.on('console-message',e=>console.log('RENDERER',e.message)); const js=s=>win.webContents.executeJavaScript(s);const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(x,m)=>{if(!x)throw Error(m)};
try{await win.loadURL(${JSON.stringify(url)});await wait(1200);await js('document.fonts.ready');
check(await js('document.querySelectorAll(".archive-day-cover img").length===3 && [...document.querySelectorAll(".archive-day-cover img")].every(i=>i.naturalWidth>0)'),'covers');
check(await js('Math.abs(document.querySelector(".archive-day-tracks-panel h3").getBoundingClientRect().left-document.querySelector(".archive-day-rank").getBoundingClientRect().left)<1'),'alignment');
const capture=async(name,full=false)=>{if(!full){await js('document.querySelector(".archive-day-tracks-panel").scrollIntoView({block:"center"});void 0');await wait(60)}const r=full?undefined:await js('(()=>{const r=document.querySelector(".archive-day-tracks-panel").getBoundingClientRect();return {x:Math.floor(r.x-20),y:Math.floor(r.y-8),width:Math.ceil(r.width+40),height:Math.ceil(r.height+24)}})()');await writeFile(join(root,name+'.png'),(await win.webContents.capturePage(r)).toPNG())};
await capture('dark');await capture('context',true);
await js('document.documentElement.dataset.theme="light"');await wait(150);await capture('light');
win.setSize(680,950);await wait(200);
check(await js('getComputedStyle(document.querySelector(".archive-day-frequency")).width==="56px"'),'medium meter');
await js('window.fixture.loading=true');await wait(60);
check(await js('getComputedStyle(document.querySelector(".archive-track-placeholder--meter")).width==="56px"'),'medium skeleton meter');
await js('window.fixture.loading=false');await wait(60);
win.setSize(460,950);await wait(200);check(await js('document.documentElement.scrollWidth<=window.innerWidth'),'narrow overflow');await capture('narrow');
await js('window.fixture.tracks[0].artworkCacheKey="missing";window.fixture.tracks[1].artworkCacheKey=null');await wait(250);check(await js('document.querySelectorAll(".archive-day-cover img").length===1'),'missing fallback');await capture('fallback');
await js('window.fixture.loading=true');await wait(60);check(await js('document.querySelectorAll(".archive-day-tracks--placeholder .archive-day-track").length===3'),'skeleton');
await js('window.fixture.loading=false;window.fixture.tracks=window.fixture.tracks.slice(0,1);void 0');await wait(60);check(await js('document.querySelectorAll("li.archive-day-track").length===1'),'single');
await js('window.fixture.tracks=[];void 0');await wait(60);check(await js('!!document.querySelector(".archive-day-message--empty")'),'empty');
await js('window.fixture.failed=true');await wait(60);check(await js('!!document.querySelector(".archive-track-retry")'),'error');await js('document.querySelector(".archive-track-retry").click()');await wait(60);check(await js('!window.fixture.failed'),'retry');
console.log('PASS covers, alignment, narrow overflow, missing/broken cover fallback, skeleton, single, empty, retry; dark/light screenshots');app.exit(0)
}catch(e){console.error(e);app.exit(1)}});
`)
try{await new Promise((done,reject)=>{const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[join(root,'electron.mjs')],{windowsHide:true,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});const timer=setTimeout(()=>{child.kill();reject(Error('timeout'))},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(Error('exit '+code))})})}finally{await server.close()}
