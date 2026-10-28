
import {app,BrowserWindow} from 'electron';import {writeFile} from 'node:fs/promises';import {join} from 'node:path';
const root="D:\\VSCode\\Auralis\\output\\metadata-ui-check";app.setPath('userData',join(root,'isolated-profile'));
app.whenReady().then(async()=>{const win=new BrowserWindow({width:800,height:650,show:false,webPreferences:{backgroundThrottling:false,nodeIntegration:false,contextIsolation:true,sandbox:true}});
const errors=[];win.webContents.on('console-message',event=>{if(event.level==='error')errors.push(event.message)});
const js=source=>win.webContents.executeJavaScript(source),wait=ms=>new Promise(done=>setTimeout(done,ms));
try{await win.loadURL("http://127.0.0.1:5173/");for(let i=0;i<100;i++){if(await js('Boolean(window.fixture && document.querySelector("[data-library-overlay]"))'))break;await wait(100)}
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
