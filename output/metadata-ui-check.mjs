import { createServer } from 'vite'
import vue from '@vitejs/plugin-vue'
import UnoCSS from 'unocss/vite'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve,join } from 'node:path'
import { spawn } from 'node:child_process'

const root=resolve('output/metadata-ui-check')
await mkdir(root,{recursive:true})
await mkdir(join(root,'isolated-profile'),{recursive:true})
await writeFile(join(root,'index.html'),'<html><body><div id="app"></div><script type="module" src="/fixture.ts"></script></body></html>')
await writeFile(join(root,'fixture.ts'),`
import {createApp,h,ref} from 'vue';
import {createI18n} from 'vue-i18n';
import MetadataEditDialog from '@renderer/features/library/components/MetadataEditDialog.vue';
import zh from '@renderer/locales/zh-Hans.json';import en from '@renderer/locales/en.json';
import '@renderer/app/styles/main.css';import 'virtual:uno.css';
const i18n=createI18n({legacy:false,locale:'zh-Hans',messages:{'zh-Hans':zh,en}});
const file={trackId:1,editToken:'fixture',title:null,artistDisplay:null,albumTitle:null,albumArtistDisplay:null,genreDisplay:null,year:null,releaseDate:null};
const metadata=ref({...file,legacyMetadata:{...file,title:'历史保存的长标题 '.repeat(50),artistDisplay:'Artist A; Artist B',genreDisplay:'Rock; Live'}});
const saving=ref(false);
window.fixture={normal(){metadata.value={...file}},legacy(){metadata.value={...file,legacyMetadata:{...file,title:'历史保存的长标题 '.repeat(50),artistDisplay:'Artist A; Artist B',genreDisplay:'Rock; Live'}}},saving(value){saving.value=value},locale(value){i18n.global.locale.value=value}};
createApp({render:()=>h(MetadataEditDialog,{metadata:metadata.value,open:true,saving:saving.value,errorMessage:null,onSave:value=>window.saved=value})}).use(i18n).mount('#app');
`)
const server=await createServer({configFile:false,root,cacheDir:join(root,'vite-cache'),plugins:[vue(),UnoCSS({configFile:resolve('uno.config.ts')})],resolve:{alias:{'@renderer':resolve('src/renderer'),'@shared':resolve('src/shared')}},server:{host:'127.0.0.1',port:0,fs:{allow:[resolve('.')]}}})
await server.listen()
const address=server.httpServer.address()
const url=`http://127.0.0.1:${address.port}/`
await writeFile(join(root,'electron.mjs'),`
import {app,BrowserWindow} from 'electron';import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const root=${JSON.stringify(root)};app.setPath('userData',join(root,'isolated-profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:800,height:650,show:false,webPreferences:{backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true}});
const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
const js=source=>win.webContents.executeJavaScript(source),wait=ms=>new Promise(done=>setTimeout(done,ms));
try{await win.loadURL(${JSON.stringify(url)});for(let i=0;i<100;i++){if(await js('Boolean(window.fixture && document.querySelector("[data-library-overlay]"))'))break;await wait(100)}
await wait(500);const results=[];
for(const [locale,dark] of [['zh-Hans',true],['en',false]]){
await js('window.fixture.locale('+JSON.stringify(locale)+');document.documentElement.setAttribute("data-theme",'+JSON.stringify(dark?'dark':'light')+');window.fixture.legacy()');await wait(250);
const metrics=await js('(()=>{const panel=document.querySelector("[data-library-overlay]");const table=document.querySelector("table");const rect=panel.getBoundingClientRect();return {width:rect.width,height:rect.height,viewport:[innerWidth,innerHeight],tableOverflow:table.parentElement.scrollWidth>table.parentElement.clientWidth+1,buttons:[...document.querySelectorAll("button")].map(button=>({text:button.textContent.trim(),disabled:button.disabled}))}})()');
if(metrics.width>800||metrics.height>650||metrics.tableOverflow)throw new Error('Layout overflow '+JSON.stringify(metrics));
await writeFile(join(root,locale+'.png'),(await win.webContents.capturePage()).toPNG());results.push({locale,...metrics});}
await js('[...document.querySelectorAll("button")].find(button=>button.textContent.includes("Use file tags")).click()');
if(await js('window.saved?.legacyAction')!=='adopt-file')throw new Error('adopt click failed');
await js('window.fixture.saving(true)');await wait(50);
if(!await js('[...document.querySelectorAll("button")].filter(button=>/Use file tags|Write saved/.test(button.textContent)).every(button=>button.disabled)'))throw new Error('busy controls remain enabled');
await js('window.fixture.saving(false);window.fixture.normal()');await wait(80);
if(await js('document.querySelector("input").value')!=='')throw new Error('display fallback entered the form');
await js('const input=document.querySelector("input");input.value="Changed title";input.dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("form").requestSubmit()');await wait(80);
if(!await js('window.saved.title==="Changed title" && window.saved.artistDisplay===null'))throw new Error('normal form submission failed');
await writeFile(join(root,'report.json'),JSON.stringify({passed:true,results,errors},null,2));app.exit(0);
}catch(error){await writeFile(join(root,'failure.png'),(await win.webContents.capturePage()).toPNG());await writeFile(join(root,'report.json'),JSON.stringify({passed:false,error:String(error),errors},null,2));console.error(error);app.exit(1);}});
`)
try{
  await new Promise((done,reject)=>{const child=spawn(resolve('node_modules/electron/dist/electron.exe'),[join(root,'electron.mjs')],{windowsHide:true,stdio:'inherit',env:{...process.env,ELECTRON_RUN_AS_NODE:undefined}});const timer=setTimeout(()=>{child.kill();reject(new Error('UI fixture timeout'))},45000);child.once('error',reject);child.once('exit',code=>{clearTimeout(timer);code===0?done():reject(new Error(`UI fixture exit ${code}`))})})
}finally{await server.close()}
