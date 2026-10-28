import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { resolve, join } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = resolve('output/badge-cold-open', process.env.BADGE_RUN || 'run1')
mkdirSync(output, { recursive: true })
const profiles = resolve('output/badge-cold-open/isolated-profile')
mkdirSync(profiles, { recursive: true })
const profile = mkdtempSync(join(profiles, 'profile-'))
mkdirSync(join(profile, 'data'))
mkdirSync(join(profile, 'cache'))
writeFileSync(join(profile, 'data/auralis.sqlite'), '')
const setPath = app.setPath.bind(app)
app.setPath = (name, value) => setPath(name, name === 'userData' ? profile : name === 'cache' ? join(profile, 'cache') : value)
app.getAppPath = () => resolve('.')
app.setPath('userData', profile)
app.setPath('cache', join(profile, 'cache'))
delete process.env.AURALIS_SMOKE_TEST
delete process.env.ELECTRON_RENDERER_URL
process.env.AURALIS_QUIET_GPU_LOGS = '1'
const wait = ms => new Promise(r => setTimeout(r, ms))
let window, started = false
const errors = [], result = { profile, errors, attempts: [] }
const timeout = setTimeout(() => finish(new Error('timeout')), 60000)
async function finish(error) {
  clearTimeout(timeout)
  if (error) result.error = error.stack
  await writeFile(join(output, 'report.json'), JSON.stringify(result, null, 2))
  console.log(JSON.stringify(result, null, 2))
  app.exit(error ? 1 : 0)
}
app.on('browser-window-created', (_event, win) => {
  if (started) return
  started = true
  window = win
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  win.webContents.once('did-finish-load', () => run().then(() => finish()).catch(finish))
})
async function run() {
  const wc = window.webContents
  const js = code => wc.executeJavaScript(code)
  const until = async code => {
    for (let i = 0; i < 500; i++) { if (await js(code)) return; await wait(10) }
    throw new Error('Timed out: ' + code)
  }
  const click = async selector => {
    const b = await js(`document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`)
    const x = Math.round(b.x + b.width / 2), y = Math.round(b.y + b.height / 2)
    wc.sendInputEvent({ type: 'mouseMove', x, y })
    wc.sendInputEvent({ type: 'mouseDown', button: 'left', x, y, clickCount: 1 })
    wc.sendInputEvent({ type: 'mouseUp', button: 'left', x, y, clickCount: 1 })
  }
  window.setContentSize(1440, 900)
  await until(`!!document.querySelector('[data-app-shell-root]') && !document.getElementById('splash')`)
  const info = await js('window.auralis.app.getInfo()')
  if (info.databasePath !== join(profile, 'data', 'auralis.sqlite')) throw new Error('database isolation failed')
  await js(`location.hash = '#/archive'`)
  await until(`document.querySelectorAll('.archive-milestone-case__slot img').length === 3 && [...document.querySelectorAll('.archive-milestone-case__slot img')].every(i => i.complete && i.naturalWidth)`)
  result.previews = await js(`[...document.querySelectorAll('.archive-milestone-case__slot img')].map(i=>({src:i.src,complete:i.complete,width:i.naturalWidth}))`)
  result.environment = await js(`({dpr:devicePixelRatio,width:innerWidth,height:innerHeight,userAgent:navigator.userAgent})`)
  for (const attempt of ['first', 'reopen']) {
    await js(`(() => {
      const start = performance.now(), events = [], frames = [], resources = [];
      window.__badgeCold = {start, events, frames, resources};
      const state = () => [...document.querySelectorAll('.badge-image')].map(i => ({id:i.closest('[data-badge]').dataset.badge,ready:i.complete&&i.naturalWidth>0,src:i.src}));
      const load = e => { if (e.target.matches?.('.badge-image')) events.push({type:e.type,time:performance.now()-start,id:e.target.closest('[data-badge]').dataset.badge}) };
      document.addEventListener('load',load,true);document.addEventListener('error',load,true);
      const observer = new MutationObserver(() => { const s=state(); if(s.length && !events.some(e=>e.type==='mount')) events.push({type:'mount',time:performance.now()-start,state:s}) });
      observer.observe(document.body,{childList:true,subtree:true});
      const resourceObserver = new PerformanceObserver(list=>resources.push(...list.getEntries().filter(e=>/badge|hours|foam|aluminium/.test(e.name)).map(e=>({name:e.name,start:e.startTime-start,end:e.responseEnd-start,duration:e.duration,transfer:e.transferSize}))));
      resourceObserver.observe({type:'resource'});
      let prior='';
      function tick(t) { const s=state(), signature=s.map(i=>i.id+':'+i.ready).join(','); if(signature!==prior) {frames.push({time:performance.now()-start,state:s});prior=signature;} if(performance.now()-start<1200) requestAnimationFrame(tick);else {document.removeEventListener('load',load,true);document.removeEventListener('error',load,true);observer.disconnect();resourceObserver.disconnect();} }
      requestAnimationFrame(tick);
    })()`)
    const captureStart = Date.now(), nativeFrames = []
    wc.beginFrameSubscription(true, frame => {
      const elapsed = Date.now() - captureStart
      if (elapsed > 1100 || nativeFrames.length >= 45) return
      const name = `${attempt}-${String(nativeFrames.length).padStart(2,'0')}-${elapsed}ms.jpg`
      writeFileSync(join(output, name), frame.toJPEG(80))
      nativeFrames.push({ elapsed, name })
    })
    await click('[data-milestone-gallery-trigger]')
    await wait(1400)
    wc.endFrameSubscription()
    const data = await js('window.__badgeCold')
    result.attempts.push({ attempt, ...data, nativeFrames })
    await click('.case-close')
    await until(`!document.querySelector('.archive-badge-dialog')`)
    await wait(100)
  }
}
await import(pathToFileURL(resolve('out/main/index.js')).href)
