
import {app,BrowserWindow} from 'electron'; import {writeFile} from 'node:fs/promises'; import {join} from 'node:path';
const root="D:\\VSCode\\Auralis\\output\\day-top3-preview"; app.setPath('userData',join(root,'profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:1120,height:950,show:false,webPreferences:{backgroundThrottling:false}});win.webContents.on('console-message',e=>console.log('RENDERER',e.message)); const js=s=>win.webContents.executeJavaScript(s);const wait=ms=>new Promise(r=>setTimeout(r,ms));const check=(x,m)=>{if(!x)throw Error(m)};
try{await win.loadURL("http://127.0.0.1:5173/");await wait(1200);await js('document.fonts.ready');
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
