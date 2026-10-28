import { app, BrowserWindow } from 'electron'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
const require=createRequire(import.meta.url)
const output = resolve(process.env.BADGE_PERF === '1' ? 'output/badge-player-performance' : 'output/badge-player-integration')
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
 await until(`!!document.querySelector('[data-app-shell-root]')`)
 const info=await js('window.auralis.app.getInfo()')
 assert('real preload and main use isolated database',info.databasePath===join(profile,'data','auralis.sqlite'),info)
 await until(`!document.getElementById('splash')`)
 const Database=require('better-sqlite3')
 const db=new Database(info.databasePath)
 const library=join(profile,'fixture-library');mkdirSync(library)
 const wav=Buffer.alloc(44+22050*2*240)
 wav.write('RIFF',0);wav.writeUInt32LE(wav.length-8,4);wav.write('WAVEfmt ',8);wav.writeUInt32LE(16,16);wav.writeUInt16LE(1,20);wav.writeUInt16LE(1,22);wav.writeUInt32LE(22050,24);wav.writeUInt32LE(44100,28);wav.writeUInt16LE(2,32);wav.writeUInt16LE(16,34);wav.write('data',36);wav.writeUInt32LE(wav.length-44,40)
 const file=join(library,'badge-probe.wav');writeFileSync(file,wav)
 db.prepare('INSERT INTO library_roots(path) VALUES(?)').run(library)
 db.prepare('INSERT INTO tracks(id,file_path,title,artist,album,duration_seconds) VALUES(991,?,?,?,?,240)').run(file,'Badge integration fixture','Auralis QA','Isolated fixture')
 db.close()
 wc.reload()
 await until(`!!document.querySelector('[data-track-id="991"]')&&!document.getElementById('splash')`)
 await js(await readFile('output/badge-player-instrumentation.js','utf8'))
 await js(`window.auralis.playback.onNativeEvent(e=>window.__badgeProbe.nativeEvents.push(e));void 0`)
 const b=await js(`document.querySelector('[data-track-id="991"]').getBoundingClientRect().toJSON()`)
 const tx=Math.round(b.x+b.width/2),ty=Math.round(b.y+b.height/2)
 wc.sendInputEvent({type:'mouseDown',button:'left',x:tx,y:ty,clickCount:2});wc.sendInputEvent({type:'mouseUp',button:'left',x:tx,y:ty,clickCount:2})
 await until(`window.__badgeProbe.nativeEvents.some(e=>e.isPlaying&&e.currentTime>.1)`)
 assert('real native playback runs with isolated PCM fixture',true)
 await js(`location.hash='#/archive'`)
 await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`)
 await js(`document.fonts.ready`)
 await capture('archive-entry')
 await click('[data-milestone-gallery-trigger]')
 await until(`!!document.querySelector('.foam-surface')`)
 await until(`[...document.querySelectorAll('.badge-image')].every(i=>i.complete)`)
 await wait(400)
 assert('formal gallery contains static images and shared foam canvas',await js(`document.querySelectorAll('.badge-image').length===4&&document.querySelectorAll('.foam-surface').length===1`))
 await capture('collection-case')
 assert('no badge WebGL until inspection',await js('window.__badgeProbe.gl===0'))
 if(process.env.BADGE_PERF==='1') {
  const rounds=[]
  for(let round=0;round<3;round++) {
   await js('window.__badgeProbe.entries=[];window.__badgeProbe.record=true')
   const started=performance.now()
   await click('[data-badge="hours100"]')
   await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='entering'`)
   const prepareMs=performance.now()-started
   await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
   const times=await js('window.__badgeProbe.record=false;window.__badgeProbe.entries')
   const intervals=times.slice(1).map((t,i)=>t-times[i])
   rounds.push({round,prepareMs,intervals})
   key('Escape');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`);await wait(350)
  }
  const intervals=rounds.slice(1).flatMap(r=>r.intervals).sort((a,b)=>a-b)
  const summary={scope:'Built Electron app, real main/preload/native playback, isolated PCM fixture; GL submission update intervals, not presented FPS. No captures during measurements.',rounds,summary:{count:intervals.length,p95:intervals[Math.ceil(intervals.length*.95)-1],max:Math.max(...intervals),over25:intervals.filter(v=>v>25).length},environment:await js(`({dpr:devicePixelRatio,width:innerWidth,height:innerHeight,gpu:window.__badgeProbe.gpu,foamWidth:document.querySelector('.foam-surface').width,foamHeight:document.querySelector('.foam-surface').height,canvasWidth:document.querySelector('.inspect-canvas').width,canvasHeight:document.querySelector('.inspect-canvas').height,playing:window.__badgeProbe.nativeEvents.at(-1)})`)}
  await writeFile(join(output,'performance.json'),JSON.stringify(summary,null,2))
  assert('warm inspection updates meet 20ms P95 target',summary.summary.p95<=20,summary.summary)
  key('Escape');await until(`!document.querySelector('.archive-badge-dialog')`)
  return
 }
 if(process.env.BADGE_SETTINGS_ONLY!=='1') {
 await click('[data-badge="hours100"]')
 await until(`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='inspecting'`)
 assert('native left click opens completed inspection',true)
 if(process.env.BADGE_DPR_QUICK==='1') {
  wc.debugger.attach('1.3')
  await js(`window.__dprEvents=[];window.addEventListener('resize',()=>window.__dprEvents.push('resize'));matchMedia('(resolution: 1.5dppx)').addEventListener('change',e=>window.__dprEvents.push('media:'+e.matches));void 0`)
  await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1.25,mobile:false})
  await wait(800)
  console.log('DPR_PROBE',await js(`({dpr:devicePixelRatio,canvas:document.querySelector('.inspect-canvas').width,stage:document.querySelector('.inspect-object').getBoundingClientRect().toJSON(),media:matchMedia('(resolution: 1.5dppx)').matches,events:window.__dprEvents,foam:document.querySelector('.foam-surface').width,sheet:document.querySelector('.foam-sheet').clientWidth})`))
  return
 }
 await capture('inspect-front')
 assert('turn shows the metal back before facing front',await js('window.__badgeProbe.sawBack'))
 key('Escape')
 await until(`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='closed'`)
 assert('Escape returns badge and preserves collection box',await js(`!!document.querySelector('.archive-badge-dialog')&&document.activeElement.dataset.badge==='hours100'`))
 key('Escape')
 await until(`!document.querySelector('.archive-badge-dialog')`)
 assert('second Escape closes box and restores entry focus',await js(`document.activeElement.matches('[data-milestone-gallery-trigger]')&&!document.querySelector('[data-app-shell-root]').inert`))
 assert('closing the box terminates its Worker and WebGL',await js('window.__badgeProbe.workers===0&&window.__badgeProbe.gl===0'),await js('window.__badgeProbe'))
 await click('[data-milestone-gallery-trigger]');await until(`!!document.querySelector('.foam-surface')`);await wait(250)
 // Keyboard entry and native blank-area return go through the actual DOM controls.
 await js(`document.querySelector('[data-badge="hours10"]').focus()`);key('Enter')
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 assert('Enter opens the focused badge',await js(`document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours10'`))
 wc.sendInputEvent({type:'mouseDown',button:'left',x:20,y:100,clickCount:1});wc.sendInputEvent({type:'mouseUp',button:'left',x:20,y:100,clickCount:1})
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 assert('native blank-area click returns badge before closing box',await js(`!!document.querySelector('.archive-badge-dialog')`))
 // All supported designs and both existing appearance states use the formal renderer.
 if(process.env.BADGE_SKIP_MATRIX!=='1') for(const state of ['lit','unlit']) {
  await click(`[data-badge-state="${state}"]`)
  for(const group of ['hours','days','albums']) {
   await click(`[data-series="${group}"]`);await wait(150)
   const ids=await js(`[...document.querySelectorAll('.badge-button')].map(b=>b.dataset.badge)`)
   for(const id of ids) {
    await js(`document.querySelector('[data-badge="${id}"]').scrollIntoView({inline:'center',block:'nearest',behavior:'instant'})`)
    await click(`[data-badge="${id}"]`)
    await until(`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='inspecting'`)
    assert(`${id}/${state} inspects with one context`,await js(`window.__badgeProbe.gl===1&&document.querySelector('.badge-inspector').dataset.inspectionBadge==='${id}'`))
    key('Escape');await until(`document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='closed'`)
   }
  }
 }
 await click('[data-series="days"]');await wait(150)
 await js(`document.querySelector('.foam-viewport').scrollTo({left:0,behavior:'instant'})`)
 await wait(50)
 assert('overflow exposes next scroll arrow',await js(`!document.querySelector('.scroll-arrow--next').disabled`))
 await click('.scroll-arrow--next');await wait(350)
 assert('scroll arrow advances the real viewport',await js(`document.querySelector('.foam-viewport').scrollLeft>100`))
 const wheelBefore=await js(`document.querySelector('.foam-viewport').scrollLeft`)
 await js(`document.querySelector('.foam-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-80,bubbles:true,cancelable:true}))`)
 await wait(350)
 assert('vertical wheel browses the horizontal row',await js(`document.querySelector('.foam-viewport').scrollLeft<${wheelBefore}`))
 await click('[data-series="hours"]');await click('[data-badge-state="lit"]');await wait(150)
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 for(let tab=0;tab<4;tab++){key('Tab');await wait(20)}
 assert('Tab remains inside the inspection controls',await js(`!!document.activeElement.closest('.badge-inspector')`))
 await click('.inspect-object');await wait(700)
 const idle=await js('window.__badgeProbe.drawFrames');await wait(400)
 assert('inspection stops drawing while stationary',idle===await js('window.__badgeProbe.drawFrames'))
 const pose=await js('window.__badgeProbe.pose')
 const stage=await js(`document.querySelector('.inspect-object').getBoundingClientRect().toJSON()`)
 wc.sendInputEvent({type:'mouseMove',x:Math.round(stage.right-12),y:Math.round(stage.top+12)})
 await wait(350)
 assert('hover tilts the actual model and updates reflection',Math.abs(pose-await js('window.__badgeProbe.pose'))>.03)
 key('Home');await wait(400);const resetPose=await js('window.__badgeProbe.pose')
 key('Left');await wait(350)
 assert('arrow keys tilt without switching badges',await js(`document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours100'`)&&Math.abs(resetPose-await js('window.__badgeProbe.pose'))>.01)
 await click('.inspect-switch--next');await until(`document.querySelector('.badge-inspector').dataset.inspectionBadge==='hours500'&&document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 assert('next button continuously inspects within the category',true)
 await wait(400)
 assert('empty position retains residual foam pressure',await js('window.__badgeProbe.lastPressures.some(v=>Math.abs(v-.82)<.001)'))
 wc.debugger.attach('1.3')
 await wc.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:900,deviceScaleFactor:1.25,mobile:false})
 await until(`Math.abs(devicePixelRatio-1.25)<.001&&document.querySelector('.inspect-canvas').width===Math.floor(420*devicePixelRatio)`)
 assert('DPR-only change updates badge and foam density',await js(`document.querySelector('.foam-surface').width===Math.ceil(document.querySelector('.foam-sheet').clientWidth*devicePixelRatio)`))
 await wc.debugger.sendCommand('Emulation.clearDeviceMetricsOverride');wc.debugger.detach()
 await until(`Math.abs(devicePixelRatio-1.5)<.001&&document.querySelector('.inspect-canvas').width===Math.floor(420*devicePixelRatio)`)
 window.minimize();await wait(150)
 const hiddenFrames=await js('window.__badgeProbe.drawFrames');await wait(200)
 assert('minimized inspection stops submitting frames',hiddenFrames===await js('window.__badgeProbe.drawFrames'))
 window.restore();await wait(300)
 // Actual supported desktop window minimum and themes, while inspecting.
 window.setContentSize(900,620);await wait(300);await capture('inspect-minimum')
 assert('inspection fits minimum desktop window',await js(`(()=>{const b=document.querySelector('.inspect-object').getBoundingClientRect();return b.left>=0&&b.top>=0&&b.right<=innerWidth&&b.bottom<=innerHeight})()`))
 await js(`document.documentElement.dataset.theme='light'`);await capture('inspect-light')
 key('Escape');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`);await capture('collection-minimum-light')
 assert('minimum window retains horizontal scroll',await js(`document.querySelector('.foam-viewport').scrollWidth>document.querySelector('.foam-viewport').clientWidth`))
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='entering'`);key('Escape')
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 assert('Escape during the flip returns to the source',await js(`document.activeElement.dataset.badge==='hours100'`))
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 // A background application navigation unmounts the full gallery session.
 await js(`location.hash='#/songs'`);await until(`!document.querySelector('.archive-badge-dialog')`)
 assert('leaving archive releases Worker and context',await js('window.__badgeProbe.workers===0&&window.__badgeProbe.gl===0'))
 assert('native playback continues across inspection and navigation',await js('window.__badgeProbe.nativeEvents.at(-1).isPlaying&&window.__badgeProbe.nativeEvents.at(-1).currentTime>5'))

 }
 // Reduced motion is an application setting backed by storage; reload exercises its real initialization.
 await js(`localStorage.setItem('auralis-reduced-motion','reduce')`)
 wc.reload();await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
 await js(`location.hash='#/archive'`)
 await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`)
 await js(await readFile('output/badge-player-instrumentation.js','utf8'))
 await click('[data-milestone-gallery-trigger]');await until(`!!document.querySelector('.foam-surface')`);await wait(100)
 // Delay only the external Image resource boundary; the renderer and cancellation code remain real.
 await js(`(()=>{const source=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');window.__heldImages=[];Object.defineProperty(HTMLImageElement.prototype,'src',{...source,set(value){if(String(value).includes('lit-'))window.__heldImages.push([this,value]);else source.set.call(this,value)}});window.__releaseImages=()=>{Object.defineProperty(HTMLImageElement.prototype,'src',source);for(const [image,value] of window.__heldImages)source.set.call(image,value)}})()`)
 await click('[data-badge="hours100"]')
 await until(`window.__heldImages.length===5`)
 assert('material requests are held during real preparation',await js(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='loading'`))
 key('Escape')
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 await js(`window.__releaseImages();void 0`)
 assert('preparation can be cancelled before first render',await js(`!document.querySelector('[data-inspected="true"]')`))
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 assert('reduced motion skips the authored revolution',await js('!window.__badgeProbe.sawBack'))
 await js(`document.querySelector('.inspect-canvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()`)
 await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`)
 assert('context loss restores static display and error feedback',await js(`!!document.querySelector('.case-error')&&document.querySelector('[data-badge="hours100"] img').complete`))
 key('Escape');await until(`!document.querySelector('.archive-badge-dialog')`)
 await js('window.__badgeProbe.failWorker=true')
 await click('[data-milestone-gallery-trigger]');await until(`!!document.querySelector('.foam-surface')`);await wait(250)
 await click('[data-badge="hours100"]');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='inspecting'`)
 assert('Worker-unavailable path keeps inspection and foam usable',await js(`window.__badgeProbe.workers===0&&!document.querySelector('.archive-badge-gallery').dataset.foamFailed`))
 key('Escape');await until(`document.querySelector('.badge-inspector').dataset.inspectionPhase==='closed'`);key('Escape');await until(`!document.querySelector('.archive-badge-dialog')`)
 assert('no renderer errors',errors.length===0,errors)
}
const snapshot=JSON.parse(await readFile('output/badge-player-build-snapshot.json','utf8'))
await import(pathToFileURL(join(snapshot.directory,'main/index.js')).href)
