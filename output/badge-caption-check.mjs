import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
const output = resolve('output/badge-caption')
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
 const wc=window.webContents, js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<1500;i++){if(await js(code))return;await wait(10)}throw new Error('Timed out: '+code)}
 const assert=async(name,code)=>{const pass=!!await js(code);checks.push({name,pass});if(!pass)throw new Error(name);console.log('PASS',name)}
 const click=async selector=>{if(selector.startsWith('[data-badge=')){await js(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest',inline:'nearest',behavior:'instant'});void 0`);await wait(30)}const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2);wc.sendInputEvent({type:'mouseMove',x,y});wc.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1});wc.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1})}
 const key=code=>{wc.sendInputEvent({type:'keyDown',keyCode:code});wc.sendInputEvent({type:'keyUp',keyCode:code})}
 const phase=p=>`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${p}'`
 const capture=async name=>{await wait(180);await writeFile(join(output,name+'.png'),(await wc.capturePage()).toPNG())}
 const caption=`document.querySelector('.inspect-caption')`, condition=`document.querySelector('.inspect-caption__condition')`, name=`document.querySelector('.inspect-caption__name')`
 const visible=`getComputedStyle(${caption}).opacity==='1'&&${caption}.getAttribute('aria-hidden')==='false'`
 const fits=`(()=>{const b=document.querySelector('.inspect-object').getBoundingClientRect(),c=${caption}.getBoundingClientRect();return b.top>=23&&b.bottom+23<=c.top&&c.left>=0&&c.right<=innerWidth&&c.bottom<=innerHeight-23&&${condition}.scrollWidth<=${condition}.clientWidth})()`
 window.setContentSize(1440,900)
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()');if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 await js(`location.hash='#/archive'`);await until(`document.querySelector('[data-milestone-gallery-trigger]')`)
 await click('[data-milestone-gallery-trigger]');await until(`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`)
 await click('[data-badge="hours100"]');await until(phase('entering'))
 await assert('caption remains hidden during entry',`${caption}.getAttribute('aria-hidden')==='true'&&getComputedStyle(${caption}).opacity==='0'`)
 await until(phase('inspecting'));await wait(180)
 await assert('stable inspection names badge and its condition',`${visible}&&${name}.textContent==='成章'&&${condition}.textContent==='累计聆听 100 小时'`)
 await assert('desktop caption sits below badge and stays in viewport',fits)
 await assert('background slot labels are hidden during inspection',`[...document.querySelectorAll('.badge-name')].every(e=>getComputedStyle(e).visibility==='hidden')`)
 await assert('caption has no border or card background',`getComputedStyle(${caption}).borderTopWidth==='0px'&&getComputedStyle(${caption}).backgroundColor==='rgba(0, 0, 0, 0)'`)
 await assert('stage description includes achievement condition',`document.querySelector('.inspect-object').getAttribute('aria-describedby').split(' ').some(id=>document.getElementById(id)===${condition})`)
 await capture('inspection-desktop')
 await click('.inspect-caption__condition');await assert('clicking caption does not return badge',phase('inspecting'))
 // Hold the actual texture requests: retain the real component, controller and renderer.
 await js(`window.__srcMode='hold';window.__srcPending=[];window.__srcOriginal=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...window.__srcOriginal,set(value){if(/lit-(base|material|normal|ao|finish)-/.test(value)&&window.__srcMode!=='normal'){if(window.__srcMode==='fail')queueMicrotask(()=>this.dispatchEvent(new Event('error')));else window.__srcPending.push(()=>window.__srcOriginal.set.call(this,value));return}window.__srcOriginal.set.call(this,value)}});void 0`)
 await click('.inspect-switch--next');await until(`window.__srcPending.length===5`)
 await assert('preparing retains current caption',`${phase('switch-loading')}&&${visible}&&${name}.textContent==='成章'`)
 await js(`window.__srcMode='normal';window.__srcPending.splice(0).forEach(f=>f());void 0`);await until(phase('switch-out'));await wait(60)
 await assert('old caption fades during outgoing slide',`${name}.textContent==='成章'&&Number(getComputedStyle(${caption}).opacity)<1&&${caption}.getAttribute('aria-hidden')==='true'`)
 await until(phase('switch-in'))
 await assert('new caption stays hidden during incoming slide',`${name}.textContent==='共鸣'&&Number(getComputedStyle(${caption}).opacity)===0`)
 await until(phase('inspecting'));await wait(180)
 await assert('new condition fades in only after badge settles',`${visible}&&${condition}.textContent==='累计聆听 500 小时'`)
 await js(`window.__srcMode='fail';void 0`);await click('.inspect-switch--next');await until(`${phase('inspecting')}&&!!document.querySelector('.case-error-icon')`)
 await assert('failed switch retains current caption',`${visible}&&${name}.textContent==='共鸣'&&${condition}.textContent==='累计聆听 500 小时'`)
 await js(`window.__srcMode='hold';window.__srcPending=[];void 0`);await click('.inspect-switch--next');await until(`window.__srcPending.length===5`)
 key('Escape');await until(phase('closed'));await js(`window.__srcMode='normal';window.__srcPending.splice(0).forEach(f=>f());void 0`);await wait(300)
 await assert('late preparation cannot restore closed caption',`${phase('closed')}&&${caption}.getAttribute('aria-hidden')==='true'`)
 await click('[data-badge="hours100"]');await until(phase('inspecting'));await wait(180)
 window.setContentSize(900,620);await wait(250)
 await assert('900x620 fits badge and full caption',fits)
 await capture('inspection-minimum-dark')
 await js(`document.documentElement.dataset.theme='light'`);await capture('inspection-minimum-light')
 window.setMinimumSize(600,500);window.setContentSize(680,620);await wait(250)
 await assert('compact controls remain below caption without overlap',`${fits}&&${caption}.getBoundingClientRect().bottom+15<=document.querySelector('.inspect-switch--next').getBoundingClientRect().top`)
 await capture('inspection-compact')
 // Live locale update through the app's installed vue-i18n bridge.
 await js(`document.querySelector('#app').__vue_app__.config.globalProperties.$i18n.locale='en';void 0`);await wait(180)
 await assert('English name and condition update in place',`${name}.textContent==='Taking Shape'&&${condition}.textContent==='Listen for 100 hours in total'&&${fits}`)
 await capture('inspection-compact-en')
 // A taller text block exercises the actual ResizeObserver, preserving the controller.
 await js(`${condition}.style.fontSize='24px';${condition}.style.lineHeight='32px';${condition}.style.paddingInline='55px';void 0`);await wait(220)
 await assert('larger wrapped text triggers layout measurement and still fits',`${fits}&&${caption}.getBoundingClientRect().height>74`)
 await js(`${condition}.removeAttribute('style');void 0`);window.setContentSize(900,620);await wait(180)
 await js(`localStorage.setItem('auralis-reduced-motion','reduce');window.dispatchEvent(new StorageEvent('storage',{key:'auralis-reduced-motion',newValue:'reduce'}));void 0`)
 await assert('reduced motion disables caption transitions',`getComputedStyle(${caption}).transitionDuration==='0s'`)
 key('Escape');await until(phase('closed'))
 for(let g=0;g<3;g++){
  await js(`document.querySelectorAll('.categories button')[${g}].click();void 0`)
  await until(`!document.querySelector('.badge-row').classList.contains('is-loading')`)
  const ids=await js(`[...document.querySelectorAll('[data-badge]')].map(b=>b.dataset.badge)`)
  for(const id of ids){
   await click(`[data-badge="${id}"]`);await until(phase('inspecting'))
   await assert(id+' has localized caption and condition',`${visible}&&${name}.textContent.trim().length>0&&${condition}.textContent.trim().length>0&&!${condition}.textContent.includes('archive.')&&${fits}`)
   key('Escape');await until(phase('closed'))
  }
 }
 await js(`document.querySelectorAll('.categories button')[0].click();void 0`);await until(`!document.querySelector('.badge-row').classList.contains('is-loading')`)
 await click('[data-badge="hours100"]');await until(phase('inspecting'))
 await click('.inspect-switch--next');await until(`${phase('inspecting')}&&document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours500'`)
 await assert('reduced switch replaces caption atomically',`${visible}&&${condition}.textContent==='Listen for 500 hours in total'`)
 key('Escape');await until(phase('closed'));await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 await assert('no renderer errors',errors.length?'false':'true')
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
