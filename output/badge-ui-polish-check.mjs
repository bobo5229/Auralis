import {app} from 'electron'
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
import {createRequire} from 'node:module'
const output=resolve('output/badge-ui-polish');mkdirSync(output,{recursive:true})
const profile=mkdtempSync(join(output,'profile-'));mkdirSync(join(profile,'data'));mkdirSync(join(profile,'cache'));writeFileSync(join(profile,'data/auralis.sqlite'),'')
const setPath=app.setPath.bind(app);app.setPath=(name,value)=>setPath(name,name==='userData'?profile:name==='cache'?join(profile,'cache'):value)
app.getAppPath=()=>resolve('.');app.setPath('userData',profile);app.setPath('cache',join(profile,'cache'))
delete process.env.ELECTRON_RENDERER_URL;delete process.env.AURALIS_SMOKE_TEST;process.env.AURALIS_QUIET_GPU_LOGS='1'
const wait=ms=>new Promise(r=>setTimeout(r,ms)),checks=[],errors=[];let started=false,win
const timeout=setTimeout(()=>finish(new Error('timeout')),90000)
async function finish(error){clearTimeout(timeout);if(error&&win&&!win.isDestroyed()){writeFileSync(join(output,'failure.png'),(await win.webContents.capturePage()).toPNG());console.error(error)}writeFileSync(join(output,'report.json'),JSON.stringify({passed:!error,profile,checks,errors,error:error?.stack},null,2));app.exit(error?1:0)}
app.on('browser-window-created',(_e,w)=>{if(started)return;started=true;win=w;w.webContents.on('console-message',e=>{if(e.level==='error')errors.push(e.message)});w.webContents.once('did-finish-load',()=>run().then(()=>finish()).catch(finish))})
async function run(){
 const wc=win.webContents,js=code=>wc.executeJavaScript(code)
 const until=async code=>{for(let i=0;i<600;i++){if(await js(code))return;await wait(20)}throw new Error('Timeout: '+code)}
 const check=async(name,code)=>{const pass=!!await js(code);checks.push({name,pass});if(!pass)throw new Error(name);console.log('PASS',name)}
 const move=async(selector)=>{const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`);const p={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};wc.sendInputEvent({type:'mouseMove',...p});return p}
 const click=async selector=>{const p=await move(selector);wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p})}
 const key=keyCode=>{wc.sendInputEvent({type:'keyDown',keyCode});wc.sendInputEvent({type:'keyUp',keyCode})}
 const phase=p=>`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${p}'`
 const capture=async name=>{writeFileSync(join(output,name+'.png'),(await wc.capturePage()).toPNG())}
 const hidden=`getComputedStyle(document.querySelector('.case-toolbar')).visibility==='hidden'&&[...document.querySelectorAll('.scroll-arrow')].every(e=>getComputedStyle(e).visibility==='hidden')`
 const shown=`getComputedStyle(document.querySelector('.case-toolbar')).opacity==='1'&&getComputedStyle(document.querySelector('.case-toolbar')).visibility==='visible'`
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()');if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 const Database=createRequire(import.meta.url)('better-sqlite3'),db=new Database(info.databasePath);db.pragma('busy_timeout=5000');db.prepare('INSERT INTO badge_legacy_daily VALUES(?,39600)').run('2026-10-27');db.close()
 await new Promise(r=>{wc.once('did-finish-load',r);wc.reload()});await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 win.setContentSize(1440,900);await js(`location.hash='#/archive'`);await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`);await click('[data-milestone-gallery-trigger]');await until(`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`);await wait(250)
 await check('box controls initially visible',shown)
 const image=`document.querySelector('[data-badge="hours100"] .badge-image')`
 await move('.case-toolbar');await wait(300);const resting=await js(`getComputedStyle(${image}).transform`)
 await move('[data-badge="hours100"]');await wait(320)
 await check('unearned badge has zoom-in cursor',`getComputedStyle(document.querySelector('[data-badge="hours100"]')).cursor==='zoom-in'`)
 await check('unearned hover lifts without changing achievement material',`getComputedStyle(${image}).transform!==${JSON.stringify(resting)}&&getComputedStyle(${image}).filter.includes('brightness(1.05)')&&document.querySelector('[data-badge="hours100"]').dataset.achievementState==='unlit'`)
 await capture('unearned-hover-dark')
 await move('.case-toolbar');for(let i=0;i<8;i++){if(await js(`document.activeElement?.dataset.badge==='hours100'`))break;key('Tab');await wait(25)}await wait(300)
 await check('keyboard focus receives the same unearned pickup feedback',`document.querySelector('[data-badge="hours100"]').matches(':focus-visible')&&getComputedStyle(${image}).filter.includes('brightness(1.05)')`)
 await click('[data-badge="hours100"]');await until(phase('entering'));await wait(190)
 await check('background controls hidden during entry',hidden)
 await check('background is inert while controls fade',`document.querySelector('.archive-badge-gallery').inert`)
 await check('front navigation waits for entry to finish',`getComputedStyle(document.querySelector('.inspect-switch')).display==='none'`)
 await until(phase('inspecting'));await wait(180)
 await check('front navigation retains 52px size and bright background',`(()=>{const s=getComputedStyle(document.querySelector('.inspect-switch'));return s.width==='52px'&&s.height==='52px'&&s.backgroundColor==='rgb(195, 203, 207)'})()`)
 await check('front controls available while background hidden',`${hidden}&&getComputedStyle(document.querySelector('.inspect-close')).visibility==='visible'`)
 await capture('inspection-dark')
 await click('.inspect-switch--next');await until(`document.querySelector('.badge-inspector')?.dataset.inspectionPhase.startsWith('switch-')`);await check('background remains hidden throughout direct switch',hidden);await until(phase('inspecting'))
 key('Escape');await until(phase('leaving'));await check('background stays hidden until return completes',hidden);await until(phase('closed'));await wait(200)
 await check('controls and interactivity restore after return',`${shown}&&!document.querySelector('.archive-badge-gallery').inert&&document.activeElement.dataset.badge==='hours500'`)
 await check('pressed state cleared after return',`[...document.querySelectorAll('.badge-button')].every(e=>e.getAttribute('aria-pressed')==='false')`)
 win.setContentSize(900,620);await js(`document.documentElement.dataset.theme='light'`);await wait(200);await click('[data-badge="hours100"]');await until(phase('inspecting'));await wait(180)
 await check('small light view hides rear controls',hidden)
 await check('small window caption remains inside viewport',`(()=>{const r=document.querySelector('.inspect-caption').getBoundingClientRect();return r.bottom<=innerHeight-23})()`)
 await capture('inspection-small-light');key('Escape');await until(phase('closed'));await wait(200)
 await check('small view restores available scrolling arrow',`${shown}&&[...document.querySelectorAll('.scroll-arrow')].some(e=>!e.disabled&&getComputedStyle(e).visibility==='visible')`)
 await js(`localStorage.setItem('auralis-reduced-motion','reduce');window.dispatchEvent(new StorageEvent('storage',{key:'auralis-reduced-motion',newValue:'reduce',storageArea:localStorage}))`);await move('.case-toolbar');await wait(100);const reducedRest=await js(`getComputedStyle(${image}).transform`);await move('[data-badge="hours100"]');await wait(80)
 await check('reduced motion retains static feedback without hover displacement',`getComputedStyle(${image}).transform===${JSON.stringify(reducedRest)}&&getComputedStyle(${image}).filter.includes('brightness(1.05)')`)
 await click('[data-badge="hours100"]');await until(phase('inspecting'));await check('reduced motion hides controls without transition',`${hidden}&&getComputedStyle(document.querySelector('.case-toolbar')).transitionDuration==='0s'`);key('Escape');await until(phase('closed'));await check('reduced motion restores background immediately',shown)
 await check('no renderer errors',errors.length?'false':'true');await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
