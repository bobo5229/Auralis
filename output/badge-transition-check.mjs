import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output = resolve('output/badge-transition')
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
const timeout=setTimeout(()=>finish(new Error('timeout')),180000)
async function finish(error) {
 clearTimeout(timeout)
 if(error&&window&&!window.isDestroyed())await writeFile(join(output,'failure-state.json'),JSON.stringify(await window.webContents.executeJavaScript(`({phase:document.querySelector('.badge-inspector')?.dataset.inspectionPhase,id:document.querySelector('.badge-inspector')?.dataset.inspectionBadge,focus:document.activeElement.className,frames:window.__log?.slice(-100)})`),null,2))
 if(error&&window&&!window.isDestroyed())await writeFile(join(output,'failure.png'),(await window.webContents.capturePage()).toPNG())
 await writeFile(join(output,'report.json'),JSON.stringify({passed:!error,checks,errors,error:error?.stack,profile},null,2))
 if(error)console.error(error)
 app.exit(error?1:0)
}
app.on('browser-window-created',(_event,win)=>{
 if(started)return;started=true;window=win
 win.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)})
 win.webContents.on('render-process-gone',(_event,details)=>{console.error('RENDERER EXIT',details);app.exit(2)})
 win.webContents.once('did-finish-load',()=>run().then(()=>finish()).catch(finish))
})
async function run(){
 const wc=window.webContents,js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<1000;i++){if(await js(code))return;await wait(10)}throw new Error('Timed out: '+code)}
 const assert=async(name,code)=>{const detail=await js(code);checks.push({name,pass:!!detail});if(!detail)throw new Error(name);console.log('PASS',name)}
 const click=async selector=>{const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);wc.sendInputEvent({type:'mouseMove',x,y});wc.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1});wc.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1})}
 const key=code=>{wc.sendInputEvent({type:'keyDown',keyCode:code});wc.sendInputEvent({type:'keyUp',keyCode:code})}
 const phase=p=>`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${p}'`
 const ready=`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`
 const closeCase=async()=>{await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)}
 const capture=async name=>{await wait(180);await writeFile(join(output,name+'.png'),(await wc.capturePage()).toPNG())}
 window.setContentSize(1440,900)
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()')
 if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 await js(`location.hash='#/archive'`)
 await until(`document.querySelectorAll('.archive-milestone-case__slot img').length===3&&[...document.querySelectorAll('.archive-milestone-case__slot img')].every(i=>i.complete&&i.naturalWidth)`)
 await js(`
 window.__log=[];window.__sampling=true;window.__contexts=new Set();window.__textureLive=0;window.__texturePeak=0;window.__drawMs=0;window.__drawCalls=0;
 const getContext=HTMLCanvasElement.prototype.getContext;
 HTMLCanvasElement.prototype.getContext=function(...args){const gl=getContext.apply(this,args);if(this.classList.contains('inspect-canvas')&&args[0]==='webgl2'&&gl&&!window.__contexts.has(gl)){window.__contexts.add(gl);for(const name of ['createTexture','deleteTexture','drawElements','drawArrays']){const original=gl[name];gl[name]=function(...a){const begin=performance.now();const value=original.apply(this,a);if(name==='createTexture'){window.__textureLive++;window.__texturePeak=Math.max(window.__texturePeak,window.__textureLive)}else if(name==='deleteTexture')window.__textureLive--;else {window.__drawMs+=performance.now()-begin;window.__drawCalls++}return value}}}return gl};
 function sample(t){const g=document.querySelector('.archive-badge-gallery'),i=document.querySelector('.badge-inspector'),s=document.querySelector('.inspect-object'),b=document.querySelector('.inspect-switch--next'),r=s?.getBoundingClientRect();window.__log.push({t,ready:g?.classList.contains('is-ready')||false,opacity:g?Number(getComputedStyle(g).opacity):0,imgs:g?[...g.querySelectorAll('.badge-image')].every(i=>i.complete&&i.naturalWidth):false,foam:!!g?.querySelector('.foam-surface'),phase:i?.dataset.inspectionPhase,id:i?.dataset.inspectionBadge,buttons:b?getComputedStyle(b).display!=='none':false,x:r?.x,y:r?.y,width:r?.width,objectOpacity:s?Number(getComputedStyle(s).opacity):0,drawMs:window.__drawMs,calls:window.__drawCalls});window.__drawMs=window.__drawCalls=0;if(window.__sampling)requestAnimationFrame(sample)}requestAnimationFrame(sample);
 `)
 await click('[data-milestone-gallery-trigger]');await until(ready);await wait(200)
 await assert('cold case only becomes visible with images and foam together',`window.__log.some(f=>f.ready)&&window.__log.filter(f=>f.opacity>0).every(f=>f.ready&&f.imgs&&f.foam)`)
 await assert('ready case owns initial focus',`document.activeElement.matches('.case-close')`)
 await capture('case-desktop')
 await closeCase()
 // Hold the real decode promise at the resource boundary; retain all component logic.
 await js(`window.__decodeMode='preview';window.__decodePending=[];window.__decodeOriginal=HTMLImageElement.prototype.decode;HTMLImageElement.prototype.decode=function(){const src=this.src;return window.__decodeOriginal.call(this).then(()=>new Promise((resolve,reject)=>{const hold=window.__decodeMode==='preview'?/(hours|days|albums)-.*-(lit|unlit)-/.test(src):window.__decodeMode==='metal'?src.includes('brushed-aluminium'):window.__decodeMode==='foam'?/foam-/.test(src):false;if(hold)window.__decodePending.push({src,resolve,reject});else resolve()}))};void 0`)
 for(const [mode,count] of [['preview',4],['metal',1],['foam',1]]){
  await js(`window.__decodeMode=${JSON.stringify(mode)};window.__decodePending=[]`)
  await click('[data-milestone-gallery-trigger]');await until(`window.__decodePending.length===${count}`);await wait(220)
  await assert(mode+' delayed beyond dialog timeout keeps entire case invisible and inert',`!${ready}&&getComputedStyle(document.querySelector('.archive-badge-gallery')).opacity==='0'&&document.querySelector('.archive-badge-gallery').inert`)
  await js(`window.__decodePending.forEach(p=>p.resolve());void 0`);await until(ready)
  await closeCase()
 }
 await js(`HTMLImageElement.prototype.decode=window.__decodeOriginal;window.__pressureHold=true;window.__pressurePending=[];window.__OriginalWorker=window.Worker;window.Worker=class extends window.__OriginalWorker{constructor(url,options){super(url,options);this.badgePressure=String(url).includes('badgePressure')}set onmessage(callback){super.onmessage=e=>{if(this.badgePressure&&window.__pressureHold)window.__pressurePending.push(()=>callback.call(this,e));else callback.call(this,e)}}};void 0`)
 await click('[data-milestone-gallery-trigger]');await until(`window.__pressurePending.length>0`);await wait(220)
 await assert('worker first pressure frame also gates whole-case presentation',`!${ready}&&getComputedStyle(document.querySelector('.archive-badge-gallery')).opacity==='0'`)
 await js(`window.__pressureHold=false;window.__pressurePending.splice(0).forEach(f=>f());void 0`);await until(ready)
 await closeCase()
 await js(`window.Worker=window.__OriginalWorker;window.__decodeMode='preview';window.__decodePending=[];HTMLImageElement.prototype.decode=function(){const src=this.src;return window.__decodeOriginal.call(this).then(()=>new Promise((resolve,reject)=>{if(/(hours|days|albums)-.*-(lit|unlit)-/.test(src))window.__decodePending.push({resolve,reject});else resolve()}))};void 0`)
 await click('[data-milestone-gallery-trigger]');await until(`window.__decodePending.length===4`)
 key('Escape');await until(`!document.querySelector('.archive-badge-dialog')`)
 await js(`window.__decodePending.forEach(p=>p.resolve());void 0`);await wait(50)
 await assert('Escape cancels hidden case and late decodes cannot reopen it',`!document.querySelector('.archive-badge-dialog')&&document.activeElement.matches('[data-milestone-gallery-trigger]')`)
 await js(`window.__decodePending=[]`);await click('[data-milestone-gallery-trigger]');await until(`window.__decodePending.length===4`)
 await js(`window.__decodePending[0].reject(new Error('controlled decode failure'));window.__decodePending.slice(1).forEach(p=>p.resolve());void 0`);await until(ready)
 await assert('failed first preparation reveals a closable error state',`!!document.querySelector('.case-error-icon')&&document.activeElement.matches('.case-close')`)
 await closeCase();await js(`HTMLImageElement.prototype.decode=window.__decodeOriginal;void 0`)
 await click('[data-milestone-gallery-trigger]');await until(ready)
 await click('[data-badge="hours100"]');await until(phase('entering'))
 await assert('switch buttons are hidden through initial entry and cannot take focus',`[...document.querySelectorAll('.inspect-switch')].every(b=>getComputedStyle(b).display==='none')`)
 await until(phase('inspecting'))
 await assert('stable inspection shows larger contrasting switch buttons',`[...document.querySelectorAll('.inspect-switch')].every(b=>getComputedStyle(b).display!=='none'&&b.getBoundingClientRect().width===52)&&getComputedStyle(document.querySelector('.inspect-switch svg')).width==='26px'`)
 await capture('inspection-buttons')
 const beforeContexts=await js('window.__contexts.size'),beforeTextures=await js('window.__textureLive')
 let start=await js('performance.now()')
 await click('.inspect-switch--next');await until(phase('switch-out'))
 await assert('switching hides buttons and moves focus to the inspection object',`document.activeElement.matches('.inspect-object')&&[...document.querySelectorAll('.inspect-switch')].every(b=>getComputedStyle(b).display==='none')`)
 await until(phase('inspecting'))
 await assert('direct switch reaches next badge without returning or replaying entry',`(()=>{const f=window.__log.filter(f=>f.t>=${start});return document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours500'&&f.some(f=>f.phase==='switch-out')&&f.some(f=>f.phase==='switch-in')&&f.every(f=>!['leaving','closed','entering'].includes(f.phase))})()`)
 await assert('switch uses a constant central size and fixed vertical position',`(()=>{const f=window.__log.filter(f=>f.t>=${start}&&['switch-out','switch-in'].includes(f.phase));return f.length>4&&Math.max(...f.map(f=>f.width))-Math.min(...f.map(f=>f.width))<1&&Math.max(...f.map(f=>f.y))-Math.min(...f.map(f=>f.y))<1})()`)
 await assert('next switch exits left and enters from right',`(()=>{const f=window.__log.filter(f=>f.t>=${start}),center=(innerWidth-420)/2;return f.some(f=>f.phase==='switch-out'&&f.x<center-10)&&f.some(f=>f.phase==='switch-in'&&f.x>center+10)})()`)
 await assert('only one canvas context survives model handoff and old textures are released',`window.__contexts.size===${beforeContexts}&&window.__textureLive===${beforeTextures}&&window.__texturePeak<=${beforeTextures+5}`)
 start=await js('performance.now()');await click('.inspect-switch--previous');await until(phase('switch-out'));await until(phase('inspecting'))
 await assert('previous switch reverses the slide direction',`(()=>{const f=window.__log.filter(f=>f.t>=${start}),center=(innerWidth-420)/2;return f.some(f=>f.phase==='switch-out'&&f.x>center+10)&&f.some(f=>f.phase==='switch-in'&&f.x<center-10)})()`)
 // Hold or fail actual TextureLoader image requests before assigning src.
 await js(`window.__srcMode='hold';window.__srcPending=[];window.__srcOriginal=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...window.__srcOriginal,set(value){if(/lit-(base|material|normal|ao|finish)-/.test(value)&&window.__srcMode!=='normal'){if(window.__srcMode==='fail')queueMicrotask(()=>this.dispatchEvent(new Event('error')));else window.__srcPending.push(()=>window.__srcOriginal.set.call(this,value));return}window.__srcOriginal.set.call(this,value)}});void 0`)
 await click('.inspect-switch--next');await until(`window.__srcPending.length===5`)
 await assert('target preparation retains current visible model',`${phase('switch-loading')}&&document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours100'&&Number(getComputedStyle(document.querySelector('.inspect-object')).opacity)===1`)
 await js(`document.querySelector('.inspect-switch--next').click();document.querySelector('.inspect-switch--previous').click();void 0`)
 await assert('repeated switch inputs do not create extra target requests',`window.__srcPending.length===5`)
 key('Escape');await until(phase('closed'))
 await js(`window.__srcMode='normal';window.__srcPending.splice(0).forEach(f=>f());void 0`);await wait(150)
 await assert('cancelled switch cannot restart after delayed images arrive',`${phase('closed')}&&document.activeElement.dataset.badge==='hours100'`)
 await click('[data-badge="hours100"]');await until(phase('inspecting'))
 await js(`window.__srcMode='fail'`);await click('.inspect-switch--next');await until(`!!document.querySelector('.case-error-icon')`)
 await assert('target load failure retains current inspection and restores controls',`${phase('inspecting')}&&document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours100'&&getComputedStyle(document.querySelector('.inspect-switch--next')).display!=='none'`)
 await js(`window.__srcMode='normal'`);await click('.inspect-switch--next');await until(phase('switch-out'))
 key('Escape');await until(phase('closed'));await wait(100)
 await assert('Escape during outgoing animation returns current badge and keeps buttons hidden',`document.activeElement.dataset.badge==='hours100'&&getComputedStyle(document.querySelector('.inspect-switch--next')).display==='none'`)
 await click('[data-badge="hours100"]');await until(phase('inspecting'))
 await click('.inspect-switch--next');await until(phase('switch-in'));await click('.inspect-close');await until(phase('closed'))
 await assert('return during incoming animation restores new badge to its own slot',`document.activeElement.dataset.badge==='hours500'`)
 await closeCase()
 // Reduced motion still waits for resources, but skips movement and flipping.
 await js(`localStorage.setItem('auralis-reduced-motion','reduce');window.dispatchEvent(new StorageEvent('storage',{key:'auralis-reduced-motion',newValue:'reduce'}));void 0`)
 await click('[data-milestone-gallery-trigger]');await until(ready)
 await assert('reduced-motion collection has no fade transition',`getComputedStyle(document.querySelector('.archive-badge-gallery')).transitionDuration==='0s'`)
 for(const state of ['lit','unlit']){
  await click('[data-badge-state="'+state+'"]')
  for(const [group,count] of [['hours',4],['days',5],['albums',2]]){
   await click('[data-series="'+group+'"]');await until(`document.querySelectorAll('.badge-image').length===${count}&&!document.querySelector('.badge-row').inert`)
   await assert(group+' '+state+' keeps entire set decoded with a visible box',`${ready}&&[...document.querySelectorAll('.badge-image')].every(i=>i.complete&&i.naturalWidth)`)
   await click('.badge-button');await until(phase('inspecting'))
   await assert(group+' '+state+' first badge disables previous only',`document.querySelector('.inspect-switch--previous').disabled&&!document.querySelector('.inspect-switch--next').disabled`)
   let n=0
   for(let i=1;i<count;i++){const previous=await js(`document.querySelector('.badge-inspector').dataset.inspectionBadge`);n=await js('performance.now()');await click('.inspect-switch--next');await until(`${phase('inspecting')}&&document.querySelector('.badge-inspector').dataset.inspectionBadge!==${JSON.stringify(previous)}`);await assert(group+' '+state+' reduced switch '+i+' skips moving phases',`window.__log.filter(f=>f.t>=${n}).every(f=>!['switch-out','switch-in','entering','leaving'].includes(f.phase))`)}
   await assert(group+' '+state+' last badge disables next only',`!document.querySelector('.inspect-switch--previous').disabled&&document.querySelector('.inspect-switch--next').disabled`)
   key('Escape');await until(phase('closed'))
  }
 }
 await closeCase()
 await js(`localStorage.removeItem('auralis-reduced-motion');window.dispatchEvent(new StorageEvent('storage',{key:'auralis-reduced-motion',newValue:null}));void 0`)
 window.setContentSize(900,620);await click('[data-milestone-gallery-trigger]');await until(ready)
 await js(`document.documentElement.dataset.theme='light'`);await capture('case-minimum-light')
 await click('[data-badge="hours100"]');await until(phase('inspecting'))
 await assert('minimum window keeps both controls and inspection within view',`[...document.querySelectorAll('.inspect-switch'),document.querySelector('.inspect-object')].every(e=>{const r=e.getBoundingClientRect();return r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight})`)
 await capture('inspection-minimum-light')
 await wait(800)
 await assert('inspection stops drawing when idle',`window.__log.slice(-20).every(f=>f.calls===0)`)
 const samples=await js(`window.__log.filter(f=>['switch-out','switch-in'].includes(f.phase))`)
 const sorted=samples.filter(f=>f.calls).map(f=>f.drawMs).sort((a,b)=>a-b)
 checks.push({name:'measured switch draw submission milliseconds',pass:true,detail:{frames:sorted.length,p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1),contexts:await js('window.__contexts.size'),maxLiveTextures:await js('window.__texturePeak')}})
 await writeFile(join(output,'frames.json'),JSON.stringify(await js('window.__log'),null,2))
 key('Escape');await until(phase('closed'));await closeCase();await js(`window.__sampling=false`)
 await assert('no renderer errors',errors.length?'false':'true')
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
