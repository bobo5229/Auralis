import {app} from 'electron'
import {mkdirSync,mkdtempSync,writeFileSync} from 'node:fs'
import {resolve,join} from 'node:path'
import {pathToFileURL} from 'node:url'
const output=resolve('output/badge-keyboard');mkdirSync(output,{recursive:true})
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
 const click=async selector=>{const b=await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`),p={x:Math.round(b.x+b.width/2),y:Math.round(b.y+b.height/2)};wc.sendInputEvent({type:'mouseMove',...p});wc.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,...p});wc.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,...p})}
 const key=(keyCode,options={})=>{wc.sendInputEvent({type:'keyDown',keyCode,...options});wc.sendInputEvent({type:'keyUp',keyCode})}
 const phase=p=>`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${p}'`
 const id=s=>`document.querySelector('.badge-inspector')?.dataset.inspectionBadge==='${s}'`
 const settled=s=>`${phase('inspecting')}&&${id(s)}`
 const focus=selector=>js(`document.querySelector(${JSON.stringify(selector)}).focus()`)
 const stop=async()=>{key('Escape');await until(phase('closed'));await wait(180)}
 await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 const info=await js('window.auralis.app.getInfo()');if(info.databasePath!==join(profile,'data','auralis.sqlite'))throw new Error('isolation failed')
 win.setContentSize(900,620);await js(`location.hash='#/archive'`);await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`);await click('[data-milestone-gallery-trigger]');await until(`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`);await wait(200)
 await click('[data-badge="hours100"]');await until(phase('entering'));key('PageDown');await until(settled('hours100'))
 await check('entry ignores PageDown and retains current badge',id('hours100'))
 await check('localized native tooltips and shortcut metadata identify both keys',`document.querySelector('.inspect-switch--previous').title==='检视上一枚徽章 (PageUp)'&&document.querySelector('.inspect-switch--previous').getAttribute('aria-keyshortcuts')==='PageUp'&&document.querySelector('.inspect-switch--next').title==='检视下一枚徽章 (PageDown)'&&document.querySelector('.inspect-switch--next').getAttribute('aria-keyshortcuts')==='PageDown'`)
 key('ArrowRight');await wait(100);key('ArrowUp');key('Home');await check('arrow tilt and Home preserve inspection selection',settled('hours100'))
 key('PageDown');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase.startsWith('switch-')`);key('PageDown');key('PageUp');await until(settled('hours500'))
 await check('PageDown switches once and ignores concurrent switching input',id('hours500'))
 await focus('.inspect-close');key('PageUp');await until(settled('hours100'));await check('shortcut works while close button owns focus',id('hours100'))
 await focus('.inspect-switch--next');key('PageUp');await until(settled('hours10'));await check('shortcut works while navigation button owns focus',id('hours10'))
 key('PageUp');await wait(120);await check('first badge cannot wrap backward',settled('hours10'))
 await js(`document.querySelector('.inspect-object').dispatchEvent(new KeyboardEvent('keydown',{key:'PageDown',bubbles:true,cancelable:true,repeat:true}))`);await wait(60);await check('held key repeat cannot restart navigation',settled('hours10'))
 key('PageDown',{modifiers:['control']});await wait(80);await check('modified PageDown is not handled as a badge command',settled('hours10'))
 key('PageDown');await until(settled('hours100'));key('PageDown');await until(settled('hours500'));key('PageDown');await until(settled('hours1000'));key('PageDown');await wait(100);await check('last badge cannot wrap forward',settled('hours1000'))
 await check('keyboard navigation does not scroll the box or document',`window.scrollY===0&&document.querySelector('.auralis-dialog-body').scrollTop===0`)
 await stop();await check('exit restores focus to the currently inspected slot',`document.activeElement.dataset.badge==='hours1000'`)
 await click('[data-badge="hours1000"]');await until(settled('hours1000'));key('PageUp');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase.startsWith('switch-')`);key('Escape');await until(phase('closed'));await wait(550);await check('Escape during shortcut switch does not restart inspection',phase('closed'))
 await click('.case-close');await until(`!document.querySelector('.archive-badge-dialog')`)
 await js(`localStorage.setItem('auralis-reduced-motion','reduce');window.dispatchEvent(new StorageEvent('storage',{key:'auralis-reduced-motion',newValue:'reduce',storageArea:localStorage}))`)
 await click('[data-milestone-gallery-trigger]');await until(`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`);await wait(180);await click('[data-series="albums"]');await until(`!document.querySelector('.badge-row').classList.contains('is-loading')`);await click('[data-badge="albums1"]');await until(settled('albums1'));key('PageDown');await until(settled('albumsLive'));await check('shortcuts work in other categories and reduced motion',id('albumsLive'));await stop();await click('.case-close');await check('no renderer errors',errors.length?'false':'true')
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
