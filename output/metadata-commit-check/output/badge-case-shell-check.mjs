import { app, BrowserWindow } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const output = resolve('output/badge-case-shell')
mkdirSync(output, {recursive:true})
const profileArchive=join(output,'isolated-profile');mkdirSync(profileArchive,{recursive:true})
const profile = mkdtempSync(join(profileArchive, 'profile-'))
mkdirSync(join(profile,'data')); mkdirSync(join(profile,'cache'))
writeFileSync(join(profile,'data','auralis.sqlite'), '')
const setPath = app.setPath.bind(app)
app.setPath = (name, value) => setPath(name, name === 'userData' ? profile : name === 'cache' ? join(profile,'cache') : value)
app.getAppPath = () => resolve('.')
app.setPath('userData', profile)
app.setPath('cache', join(profile,'cache'))
delete process.env.AURALIS_SMOKE_TEST
delete process.env.ELECTRON_RENDERER_URL
process.env.AURALIS_QUIET_GPU_LOGS = '1'
const checks=[], errors=[]
let window, started=false
const wait=ms=>new Promise(r=>setTimeout(r,ms))
const timeout=setTimeout(()=>finish(new Error('integration timeout')),180000)
async function finish(error) {
 clearTimeout(timeout)
 if (error) { console.error(error.stack); if(window&&!window.isDestroyed()) { await writeFile(join(output,'failure.png'),(await window.webContents.capturePage()).toPNG()); console.error(await window.webContents.executeJavaScript(`({phase:document.querySelector('.badge-inspector')?.dataset.inspectionPhase,foam:document.querySelector('.archive-badge-gallery')?.dataset.foamFailed,dialogs:document.querySelectorAll('[role=dialog]').length,splash:!!document.getElementById('splash')})`)) } }
 await writeFile(join(output,'report.json'),JSON.stringify({passed:!error,checks,errors,error:error?.stack,profile},null,2))
 app.exit(error?1:0)
}
app.on('browser-window-created',(_event,win)=> {
 if(started) return
 started=true;window=win
 win.webContents.on('console-message', event=>{if(event.level==='error')errors.push(event.message)})
 win.webContents.once('did-finish-load',()=>run().then(()=>finish()).catch(finish))
})
async function run() {
 const wc=window.webContents
 const js=code=>wc.executeJavaScript(code)
 const assert=(name,value,detail)=>{checks.push({name,pass:!!value,detail});if(!value)throw new Error(name+': '+JSON.stringify(detail));console.log('PASS',name)}
 const until=async code=>{for(let i=0;i<500;i++){if(await js(code))return;await wait(10)}throw new Error('Timed out: '+code)}
 const click=async selector=> {
  const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)
  const x=Math.round(b.x+b.width/2),y=Math.round(b.y+b.height/2)
  wc.sendInputEvent({type:'mouseMove',x,y});wc.sendInputEvent({type:'mouseDown',button:'left',x,y,clickCount:1});wc.sendInputEvent({type:'mouseUp',button:'left',x,y,clickCount:1})
 }
 const key=keyCode=>{wc.sendInputEvent({type:'keyDown',keyCode});if(keyCode==='Enter')wc.sendInputEvent({type:'char',keyCode:'\r'});wc.sendInputEvent({type:'keyUp',keyCode})}
 const capture=async name=>{if(process.env.BADGE_PERF==='1')return;await wait(100);await writeFile(join(output,name+'.png'),(await wc.capturePage()).toPNG())}
 window.setContentSize(1440,900)
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()')
 assert('actual preload uses an isolated database',info.databasePath===join(profile,'data','auralis.sqlite'))
 await js(`location.hash='#/archive'`)
 await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`)
 await click('[data-milestone-gallery-trigger]')
 await until(`!!document.querySelector('.foam-surface')`)
 await until(`[...document.querySelectorAll('.badge-image')].every(i=>i.complete)`)
 await wait(350)
 const shell=await js(`(()=>{const panel=document.querySelector('.archive-badge-dialog'),box=panel.querySelector('.collection-case'),style=getComputedStyle(panel);return {panel:panel.getBoundingClientRect().toJSON(),box:box.getBoundingClientRect().toJSON(),background:style.backgroundColor,border:style.borderWidth,shadow:style.boxShadow,focus:document.activeElement.className}})()`)
 assert('aluminium case is the entire dialog surface',Math.abs(shell.panel.width-shell.box.width)<1&&Math.abs(shell.panel.height-shell.box.height)<1&&shell.background==='rgba(0, 0, 0, 0)'&&shell.border==='0px'&&shell.shadow==='none',shell)
 assert('no standard header, explanatory note or middle-dot connector',await js(`!document.querySelector('.archive-badge-dialog .auralis-dialog-header')&&!document.querySelector('.archive-badge-dialog .case-note')&&!document.querySelector('.archive-badge-dialog').textContent.includes('·')`))
 assert('controls live inside the metal rim with initial focus on close',await js(`!!document.querySelector('.case-toolbar').closest('.aluminium-rim')&&document.activeElement.matches('.case-close')`))
 await capture('case-desktop')
 await click('[data-series="days"]');await wait(150)
 assert('category changes show five day badges',await js(`document.querySelectorAll('.badge-button').length===5`))
 await click('.scroll-arrow--next');await wait(350)
 assert('horizontal arrow browsing works',await js(`document.querySelector('.foam-viewport').scrollLeft>0`))
 await click('[data-series="hours"]');await wait(150)
 const lit=await js(`document.querySelector('.badge-image').src`)
 await click('[data-badge-state="unlit"]')
 await until(`[...document.querySelectorAll('.badge-image')].every(i=>i.complete)`)
 assert('appearance switch changes static assets',lit!==await js(`document.querySelector('.badge-image').src`))
 await click('[data-badge-state="lit"]')
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 assert('click still starts the inspection',true)
 await capture('inspection')
 await js(`document.querySelector('.inspect-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`)
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 assert('failed inspection has a visible icon and accessible status without a text paragraph',await js(`!!document.querySelector('.case-error-icon')&&document.querySelector('.archive-badge-gallery [role="status"]').getBoundingClientRect().height<=1&&document.activeElement.dataset.badge==='hours100'`))
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 assert('inspection can retry and clears the compact failure indicator',await js(`!document.querySelector('.case-error-icon')`))
 await click('.inspect-switch--next');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'&&document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours500'`)
 assert('continuous inspection retains the same category',true)
 key('Escape');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 assert('first Escape returns to the box and original button',await js(`!!document.querySelector('.archive-badge-dialog')&&document.activeElement.dataset.badge==='hours500'`))
 key('Escape');await until(`!document.querySelector('.archive-badge-dialog')`)
 assert('second Escape closes the box and restores archive focus',await js(`document.activeElement.matches('[data-milestone-gallery-trigger]')&&!document.querySelector('[data-app-shell-root]').inert`))
 window.setContentSize(900,620)
 await click('[data-milestone-gallery-trigger]');await until(`!!document.querySelector('.foam-surface')`);await wait(300)
 assert('minimum window fits whole case without inner vertical scrolling',await js(`(()=>{const box=document.querySelector('.collection-case').getBoundingClientRect(),body=document.querySelector('.archive-badge-dialog .auralis-dialog-body');return box.left>=0&&box.top>=0&&box.right<=innerWidth&&box.bottom<=innerHeight&&body.scrollHeight<=body.clientHeight+1})()`))
 await capture('case-minimum-dark')
 await js(`document.documentElement.dataset.theme='light'`);await capture('case-minimum-light')
 await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 assert('rim close button dismisses the collection',true)
 await click('[data-settings-trigger]');await until(`!!document.querySelector('.auralis-dialog-header')`);await wait(200)
 assert('existing settings retains its default dialog header and close button',await js(`(()=>{const h=document.querySelector('.auralis-dialog-header');return h.getBoundingClientRect().height>0&&!!h.querySelector('h2')&&!!h.querySelector('.auralis-dialog-close')})()`))
 key('Escape');await until(`!document.querySelector('.auralis-dialog-header')`)
 assert('default dialog still restores settings trigger focus',await js(`document.activeElement.matches('[data-settings-trigger]')`))
 assert('no renderer errors',errors.length===0,errors)
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
