import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output = resolve('output/badge-preload')
mkdirSync(output, {recursive:true})
const profiles=join(output,'isolated-profile');mkdirSync(profiles,{recursive:true})
const profile=mkdtempSync(join(profiles,'profile-'))
mkdirSync(join(profile,'data'));mkdirSync(join(profile,'cache'))
writeFileSync(join(profile,'data/auralis.sqlite'),'')
const setPath=app.setPath.bind(app)
app.setPath=(name,value)=>setPath(name,name==='userData'?profile:name==='cache'?join(profile,'cache'):value)
app.getAppPath=()=>resolve('.')
app.setPath('userData',profile);app.setPath('cache',join(profile,'cache'))
delete process.env.AURALIS_SMOKE_TEST;delete process.env.ELECTRON_RENDERER_URL
process.env.AURALIS_QUIET_GPU_LOGS='1'
const checks=[],errors=[]
let window,started=false
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const timeout=setTimeout(()=>finish(new Error('timeout')),90000)
async function finish(error) {
 clearTimeout(timeout)
 if(error&&window&&!window.isDestroyed())await writeFile(join(output,'failure.png'),(await window.webContents.capturePage()).toPNG())
 await writeFile(join(output,'report.json'),JSON.stringify({passed:!error,checks,errors,error:error?.stack,profile},null,2))
 if(error)console.error(error)
 app.exit(error?1:0)
}
app.on('browser-window-created',(_event,win)=>{
 if(started)return;started=true;window=win
 win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)})
 win.webContents.once('did-finish-load',()=>run().then(()=>finish()).catch(finish))
})
async function run(){
 const wc=window.webContents,js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<600;i++){if(await js(code))return;await wait(10)}throw new Error('Timed out: '+code)}
 const assert=async(name,code)=>{const value=await js(code);checks.push({name,pass:!!value});if(!value)throw new Error(name);console.log('PASS',name)}
 const click=async selector=>{const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);wc.sendInputEvent({type:'mouseMove',x,y});wc.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1});wc.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1})}
 const hidden=`!!document.querySelector('.badge-row')&&getComputedStyle(document.querySelector('.badge-row')).visibility==='hidden'&&document.querySelector('.badge-row').inert`
 const visible=`!!document.querySelector('.badge-row')&&getComputedStyle(document.querySelector('.badge-row')).visibility==='visible'&&!document.querySelector('.badge-row').inert`
 const release=async(start,end)=>js(`window.__decodePending.slice(${start},${end}).forEach(p=>p.release())`)
 const pending=async n=>until(`window.__decodePending.length===${n}`)
 window.setContentSize(1440,900)
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()')
 if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 await js(`location.hash='#/archive'`)
 await until(`document.querySelectorAll('.archive-milestone-case__slot img').length===3&&[...document.querySelectorAll('.archive-milestone-case__slot img')].every(i=>i.complete&&i.naturalWidth)`)
 // Observe the unmodified cold path before introducing controlled decode latency.
 await js(`window.__coldFrames=[];window.__coldSampling=true;function sample(){const r=document.querySelector('.badge-row');if(r)window.__coldFrames.push({visible:getComputedStyle(r).visibility==='visible',ready:[...r.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0)});if(window.__coldSampling)requestAnimationFrame(sample)}requestAnimationFrame(sample)`)
 await click('[data-milestone-gallery-trigger]')
 await until(visible)
 await wait(150)
 await assert('cold open never exposes a partially loaded row',`window.__coldFrames.length>0&&window.__coldFrames.every(f=>!f.visible||f.ready)`)
 await assert('only the current four hour previews are displayed',`document.querySelectorAll('.badge-image').length===4&&document.querySelector('.badge-row').getAttribute('aria-busy')==='false'`)
 await writeFile(join(output,'ready.png'),(await wc.capturePage()).toPNG())
 await js('window.__coldSampling=false')
 await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 await js(`window.__originalDecode=HTMLImageElement.prototype.decode;window.__decodePending=[];HTMLImageElement.prototype.decode=function(){const src=this.src;const decoded=window.__originalDecode.call(this);if(!/(hours|days|albums)-.*-(lit|unlit)-/.test(src))return decoded;return decoded.then(()=>new Promise((release,fail)=>window.__decodePending.push({src,release,fail})))};void 0;`)
 await click('[data-milestone-gallery-trigger]');await pending(4)
 await assert('decode pending keeps the entire row hidden, inert and busy',`${hidden}&&document.querySelector('.badge-row').getAttribute('aria-busy')==='true'`)
 await js(`window.__decodePending.find(p=>/hours-100-lit-/.test(p.src)).release()`);await wait(50)
 await assert('cached 100-hour badge cannot appear ahead of its peers',hidden)
 await js(`window.__decodePending.filter(p=>!/hours-1000-lit-/.test(p.src)).forEach(p=>p.release())`);await wait(50)
 await assert('three completed decodes still wait for the fourth',hidden)
 await release(0,4);await until(visible)
 await assert('all four badges and names reveal together after the last decode',`[...document.querySelectorAll('.badge-image')].every(i=>i.complete&&i.naturalWidth)&&[...document.querySelectorAll('.badge-name')].every(i=>getComputedStyle(i).visibility==='visible')`)
 await click('[data-badge-state="unlit"]');await pending(8)
 await release(4,7);await wait(50)
 await assert('appearance changes also wait for every image',hidden)
 await release(7,8);await until(visible)
 await click('[data-series="days"]');await pending(13)
 await click('[data-series="albums"]');await pending(15)
 await release(8,13);await wait(50)
 await assert('obsolete day decodes cannot reveal the current album group',`${hidden}&&document.querySelectorAll('.badge-image').length===2`)
 await release(13,15);await until(visible)
 await assert('current album decodes reveal only the selected category',`[...document.querySelectorAll('.badge-image')].every(i=>i.src.includes('albums-'))`)
 await click('[data-series="hours"]');await pending(19)
 await js(`window.__decodePending[15].fail(new DOMException('test decode failure','EncodingError'))`)
 await until(`!!document.querySelector('.case-error-icon')`)
 await release(16,19)
 await assert('decode failure ends busy state and reports a compact accessible error',`${hidden}&&document.querySelector('.badge-row').getAttribute('aria-busy')==='false'&&document.querySelector('.archive-badge-gallery [role="status"]').textContent.includes('图片加载失败')`)
 await click('[data-series="days"]');await pending(24);await release(19,24);await until(visible)
 await assert('switching category recovers from decode failure',`!document.querySelector('.case-error-icon')`)
 await click('[data-series="hours"]');await pending(28)
 await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 await assert('closing while decoding restores trigger focus',`document.activeElement.matches('[data-milestone-gallery-trigger]')`)
 await click('[data-milestone-gallery-trigger]');await pending(32)
 await release(24,28);await wait(50)
 await assert('decodes from a closed case cannot reveal a newly opened case',hidden)
 await release(28,32);await until(visible)
 await js(`HTMLImageElement.prototype.decode=window.__originalDecode;void 0`)
 await click('[data-badge="hours100"]')
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 await assert('revealed badge still opens GLSL inspection',`!!document.querySelector('.inspect-canvas')`)
 wc.sendInputEvent({type:'keyDown',keyCode:'Escape'});wc.sendInputEvent({type:'keyUp',keyCode:'Escape'})
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 await assert('returning from inspection preserves the ready collection',visible)
 await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 await assert('no renderer errors',errors.length?'false':'true')
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
