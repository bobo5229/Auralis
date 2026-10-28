import { app, BrowserWindow } from 'electron'
import { readFile, writeFile } from 'node:fs/promises'
import { mkdirSync, mkdtempSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output=resolve('output/badge-player-performance')
mkdirSync(output,{recursive:true})
app.setPath('userData',mkdtempSync(join(output,'prototype-profile-')))
app.commandLine.appendSwitch('force_high_performance_gpu')
const wait=ms=>new Promise(r=>setTimeout(r,ms))
async function main() {
const timeout=setTimeout(()=>{console.error('Native prototype timed out');app.exit(1)},45000)
await app.whenReady()
const { startServer }=await import(pathToFileURL(resolve('demo/archive/badge-case-material/serve.mjs')))
const {server,url}=await startServer(0)
const win=new BrowserWindow({width:1440,height:900,useContentSize:true,frame:false,show:true,webPreferences:{sandbox:true,contextIsolation:true,nodeIntegration:false,backgroundThrottling:false}})
win.webContents.on('console-message', e=>{if(e.level==='error')console.error('RENDERER',e.message)})
const js=code=>win.webContents.executeJavaScript(code).catch(error=>{console.error('SCRIPT',code);throw error})
const until=async code=>{for(let i=0;i<500;i++){if(await js(code))return;await wait(10)}throw new Error('Timeout: '+code)}
try {
 await win.loadURL(url)
 await until(`document.documentElement.dataset.ready==='true'`)
 const instrumentation=(await readFile('output/badge-player-instrumentation.js','utf8')).replace("document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='entering'","window.badgeInspector.snapshot().phase==='entering'")
 await js(instrumentation)
 await js('document.fonts.ready')
 const rounds=[]
 for(let round=0;round<3;round++) {
  await js('window.__badgeProbe.entries=[];window.__badgeProbe.record=true')
  const b=await js(`document.querySelector('[data-badge="hours-100"]').getBoundingClientRect().toJSON()`)
  const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2)
  const started=performance.now()
  win.webContents.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1});win.webContents.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1})
  await until(`window.badgeInspector.snapshot().phase==='entering'`)
  const prepareMs=performance.now()-started
  await until(`window.badgeInspector.snapshot().phase==='inspecting'`)
  const times=await js('window.__badgeProbe.record=false;window.__badgeProbe.entries')
  rounds.push({round,prepareMs,intervals:times.slice(1).map((t,i)=>t-times[i])})
  win.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'})
  await until(`window.badgeInspector.snapshot().phase==='closed'`);await wait(350)
 }
 const intervals=rounds.slice(1).flatMap(r=>r.intervals).sort((a,b)=>a-b)
 const report={scope:'Optimized prototype in native Electron window, same submission instrumentation as production integration, no screenshots during timing. Prototype has no audio player or archive backdrop.',rounds,summary:{count:intervals.length,p95:intervals[Math.ceil(intervals.length*.95)-1],max:Math.max(...intervals),over25:intervals.filter(v=>v>25).length},environment:await js(`({width:innerWidth,height:innerHeight,dpr:devicePixelRatio,gpu:window.__badgeProbe.gpu,foamWidth:document.querySelector('.foam-surface').width,foamHeight:document.querySelector('.foam-surface').height,canvasWidth:document.querySelector('.inspect-canvas').width,canvasHeight:document.querySelector('.inspect-canvas').height})`)}
 await writeFile(join(output,'prototype-native.json'),JSON.stringify(report,null,2))
 console.log(JSON.stringify(report.summary));clearTimeout(timeout);server.close();app.exit(0)
} catch(e){console.error(e);server.close();app.exit(1)}

}
void main().catch(error=>{console.error(error);app.exit(1)})
