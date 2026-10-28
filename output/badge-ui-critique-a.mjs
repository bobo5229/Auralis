import { app } from 'electron'
import { mkdirSync,mkdtempSync,writeFileSync,existsSync,readFileSync,unlinkSync } from 'node:fs'
import { resolve,join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const output=resolve('output/badge-ui-critique');mkdirSync(output,{recursive:true})
const profile=mkdtempSync(join(output,'profile-a-'));mkdirSync(join(profile,'data'));mkdirSync(join(profile,'cache'));writeFileSync(join(profile,'data/auralis.sqlite'),'')
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?profile:name==='cache'?join(profile,'cache'):value)
app.getAppPath=()=>resolve('.');app.setPath('userData',profile);app.setPath('cache',join(profile,'cache'))
app.commandLine.appendSwitch('remote-debugging-port','9334');app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1')
delete process.env.AURALIS_SMOKE_TEST;delete process.env.ELECTRON_RENDERER_URL;process.env.AURALIS_QUIET_GPU_LOGS='1'
const wait=ms=>new Promise(r=>setTimeout(r,ms));let started=false
setTimeout(()=>app.exit(),600000)
app.on('browser-window-created',(_e,win)=>{if(started)return;started=true;globalThis.reviewWindow=win;win.webContents.once('did-finish-load',()=>run(win).catch(e=>{console.error(e);app.exit(1)}))})
async function run(win){
 const wc=win.webContents,js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<600;i++){if(await js(code))return;await wait(30)}throw new Error('timeout '+code)}
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()');if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed '+info.databasePath)
 const Database=createRequire(import.meta.url)('better-sqlite3'),db=new Database(info.databasePath);db.pragma('busy_timeout=5000')
 for(let i=0;i<8;i++){const d=new Date();d.setDate(d.getDate()-i);const day=[d.getFullYear(),String(d.getMonth()+1).padStart(2,'0'),String(d.getDate()).padStart(2,'0')].join('-');db.prepare('INSERT INTO badge_legacy_daily VALUES(?,?)').run(day,i===0?14400:3600)}db.close()
 await new Promise(r=>{wc.once('did-finish-load',r);wc.reload()});await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 win.setContentSize(1440,900);await js(`location.hash='#/archive'`);await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`)
 await js(`document.querySelector('[data-milestone-gallery-trigger]').click()`);await until(`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`)
 await wait(600);writeFileSync(join(output,'a-hours-dark.png'),(await wc.capturePage()).toPNG())
 writeFileSync(join(output,'a-runtime.json'),JSON.stringify({profile,info,port:9334,pid:process.pid},null,2));console.log('READY',JSON.stringify({profile,port:9334,pid:process.pid}))
 setInterval(async()=>{const path=join(output,'a-command.json');if(!existsSync(path))return;let c;try{c=JSON.parse(readFileSync(path,'utf8'));unlinkSync(path);if(c.size)win.setContentSize(...c.size);const result=c.js?await js(c.js):null;await wait(c.wait??300);if(c.capture)writeFileSync(join(output,c.capture+'.png'),(await wc.capturePage()).toPNG());writeFileSync(join(output,'a-result.json'),JSON.stringify({id:c.id,result},null,2));console.log('COMMAND',c.id,result)}catch(e){console.error(e)}},200)
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
