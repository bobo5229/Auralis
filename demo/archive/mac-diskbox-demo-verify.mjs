import { spawn } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { resolve, join } from 'node:path'
import { tmpdir } from 'node:os'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

const output = resolve('.electron-home/mac-diskbox-demo-evidence')
const quick = process.argv.includes('--quick')
mkdirSync(output, { recursive: true })
const port = 9338
const browser = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', [
  '--headless=new', `--remote-debugging-port=${port}`,
  '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
  `--user-data-dir=${join(tmpdir(), 'auralis-diskbox-qa-' + Date.now())}`,
  '--no-first-run', '--no-default-browser-check', 'about:blank'
], { windowsHide: true, stdio: ['ignore', 'ignore', 'pipe'] })
browser.on('error', error => { console.error(error); process.exitCode = 1 })
let socket, nextId = 0
const pending = new Map(), errors = [], checks = []
const sleep = ms => new Promise(r => setTimeout(r, ms))
function send(method, params = {}) {
  return new Promise((resolve, reject) => {
    const id = ++nextId
    pending.set(id, { resolve, reject })
    socket.send(JSON.stringify({ id, method, params }))
  })
}
async function evaluate(expression) {
  const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
  if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails))
  return result.result.value
}
async function inspect() { return evaluate('window.archiveDiskboxDemo.inspect()') }
async function waitPhase(phase) {
  const start = Date.now()
  while (Date.now() - start < 8000) { if ((await inspect()).phase === phase) return; await sleep(40) }
  throw new Error('Timed out waiting for ' + phase + ': ' + JSON.stringify(await inspect()))
}
async function click(selector) { await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`) }
async function key(key) { await send('Input.dispatchKeyEvent',{type:'keyDown',key,code:key}); await send('Input.dispatchKeyEvent',{type:'keyUp',key,code:key}) }
async function cubeKey(keyName,count=1) { await evaluate('document.getElementById("computer-cube").focus()'); for(let i=0;i<count;i++)await key(keyName); await sleep(500) }
async function cubeDrag(dx,dy,screen=false) {
  const point=await evaluate(screen?`(() => {const r=document.getElementById('screen-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`:`(() => {for(const face of document.querySelectorAll('.computer-cube>[class^="shell-"]')){const r=face.getBoundingClientRect();for(let y=r.top+15;y<r.bottom-15;y+=15)for(let x=r.left+15;x<r.right-15;x+=15){const e=document.elementFromPoint(x,y);if(e?.closest('#computer-cube')&&!e.closest('button'))return {x,y}}}})()`)
  assert(point,'Mac exposes a draggable face')
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:point.x,y:point.y,button:'left',clickCount:1})
  for(let i=1;i<=12;i++)await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:point.x+dx*i/12,y:point.y+dy*i/12,button:'left',buttons:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:point.x+dx,y:point.y+dy,button:'left',clickCount:1})
  await sleep(500)
}
async function visibleFaces() {
  return evaluate(`(() => {const cube=document.getElementById('computer-cube'),r=document.querySelector('.machine-position').getBoundingClientRect(),faces=new Set();for(let y=r.top-170;y<r.bottom+150;y+=8)for(let x=r.left-180;x<r.right+180;x+=8){const e=document.elementFromPoint(x,y),face=e?.closest('.shell-front,.shell-back,.shell-right,.shell-left,.shell-top,.shell-bottom');if(face&&cube.contains(face))faces.add(face.className)}return [...faces]})()`)
}
async function capture(name, width, height) {
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false })
  await evaluate('window.scrollTo(0,0)')
  await evaluate('document.activeElement?.blur()')
  await sleep(950)
  if (!quick || ['desktop-read','desktop-back','mobile-read'].includes(name)) {
    const result = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true, fromSurface: true })
    writeFileSync(join(output, name + '.png'), Buffer.from(result.data, 'base64'))
  }
  const geometry = await evaluate(`(() => ({ viewport:innerWidth, scrollWidth:document.documentElement.scrollWidth, height:document.documentElement.scrollHeight, disks:[...document.querySelectorAll('.disk-rack .disk')].map(e=>{const r=e.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom}}) }))()`)
  assert(geometry.scrollWidth <= width, `${name}: horizontal overflow`)
  checks.push({ name: 'Layout ' + name, geometry })
}
try {
  let pages
  for (let i=0;i<50;i++) {
    try { pages = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).filter(page=>page.type === 'page'); if (pages.length) break } catch {}
    await sleep(100)
  }
  if (!pages?.length) throw new Error('Edge did not expose its debugging page')
  socket = new WebSocket(pages[0].webSocketDebuggerUrl)
  await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j})
  socket.onmessage = event => {
    const message = JSON.parse(event.data)
    if (message.id) { const p = pending.get(message.id); pending.delete(message.id); if(message.error)p?.reject(new Error(JSON.stringify(message.error))); else p?.resolve(message.result) }
    if (message.method === 'Runtime.exceptionThrown') errors.push(message.params)
    if (message.method === 'Log.entryAdded' && message.params.entry.level === 'error') errors.push(message.params.entry)
  }
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable')
  await send('Emulation.setDeviceMetricsOverride',{width:1360,height:940,deviceScaleFactor:1,mobile:false})
  await send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:1})
  await send('Page.navigate',{url:pathToFileURL(resolve('demo/archive/mac-diskbox-demo.html')).href})
  await send('Page.bringToFront')
  await sleep(600)
  assert.equal((await inspect()).phase,'idle')
  await capture('desktop-empty',1360,940)
  const seen=new Set(await visibleFaces())
  const initial=(await inspect()).view
  await cubeDrag(600,0,true)
  assert(Math.abs((await inspect()).view.yaw-initial.yaw-390)<1)
  assert.equal((await inspect()).view.zoomed,false,'Dragging the screen must not click it')
  assert.equal((await inspect()).view.dragging,false)
  await click('#reset-view'); await sleep(500)
  for(let turn=0;turn<4;turn++){
    const faces=await visibleFaces();faces.forEach(face=>seen.add(face))
    assert(!faces.includes('shell-bottom'),'Bottom must never be exposed')
    await cubeKey('ArrowRight',5)
  }
  assert(['shell-front','shell-left','shell-right','shell-back','shell-top'].every(face=>seen.has(face)),JSON.stringify([...seen]))
  await click('#reset-view'); await cubeKey('ArrowRight',9)
  const backFaces=await visibleFaces()
  assert(backFaces.includes('shell-back')); assert(!backFaces.includes('shell-front'),'Opaque back must cover screen')
  await capture('desktop-back',1360,940)
  await cubeKey('ArrowUp',12); assert.equal((await inspect()).view.pitch,-50)
  assert(!(await visibleFaces()).includes('shell-bottom'))
  await capture('desktop-top-back',1360,940)
  await cubeKey('ArrowDown',12); assert.equal((await inspect()).view.pitch,-8)
  assert(!(await visibleFaces()).includes('shell-bottom'))
  await click('#reset-view'); await sleep(500)
  await cubeDrag(95,-100); assert.equal((await inspect()).view.pitch,-8)
  await cubeDrag(-130,170); assert.equal((await inspect()).view.pitch,-50)
  assert(!(await visibleFaces()).includes('shell-bottom'))
  await click('#reset-view'); await sleep(500)
  assert.equal((await inspect()).view.normalizedYaw,337)
  assert.equal((await inspect()).view.pitch,-16)
  checks.push({name:'Real pointer 390 degree rotation + repeated drag + screen click suppression + all five faces + opaque rear + pitch clamps + reset',passed:true,seen:[...seen]})
  const diskHitPoints = await evaluate(`(() => [...document.querySelectorAll('.disk-rack .disk')].map(d => { const r=d.getBoundingClientRect(); for(let y=r.top+3;y<r.bottom;y+=4)for(let x=r.left+3;x<r.right;x+=4)if(document.elementFromPoint(x,y)?.closest('.disk')===d)return {x,y}; return null }))()`)
  assert(diskHitPoints.every(Boolean),'Every physical disk must expose a pointer hit area')
  const pointer = diskHitPoints[2]
  await send('Input.dispatchMouseEvent',{type:'mouseMoved',x:pointer.x,y:pointer.y})
  // Hover raises the selected object, so recalculate its real hit area.
  await sleep(500)
  const raised = await evaluate(`(() => {const d=document.querySelector('.disk[data-day="2"]'),r=d.getBoundingClientRect();for(let y=r.top+3;y<r.bottom;y+=4)for(let x=r.left+3;x<r.right;x+=4)if(document.elementFromPoint(x,y)?.closest('.disk')===d)return {x,y}})()`)
  await send('Input.dispatchMouseEvent',{type:'mousePressed',x:raised.x,y:raised.y,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',x:raised.x,y:raised.y,button:'left',clickCount:1})
  await waitPhase('ready'); assert.equal((await inspect()).date,'2026.10.03')
  await click('#eject'); await waitPhase('idle')
  checks.push({name:'Physical disk pointer hit testing: all 7 exposed, real mouse inserts third disk',passed:true})
  await click('#date-strip button:nth-child(1)'); await waitPhase('ready')
  assert.deepEqual((await inspect()).top5,['In Rainbows','Vespertine','Mezzanine','Dummy','Moon Safari'])
  assert.equal(await evaluate('document.querySelectorAll("#crt img").length'),0)
  checks.push({name:'Insert + reading + Top 5 text-only',passed:true})
  await capture('desktop-read',1360,940)
  await click('#date-strip button:nth-child(1)')
  assert.equal((await inspect()).phase,'ready'); assert.equal((await inspect()).ghosts,0)
  checks.push({name:'Repeated insert of same day',passed:true})
  await click('#date-strip button:nth-child(2)'); await sleep(80)
  await click('#date-strip button:nth-child(5)'); await sleep(80)
  await click('#date-strip button:nth-child(7)'); await waitPhase('ready')
  assert.equal((await inspect()).date,'2026.10.07'); assert.equal((await inspect()).ghosts,0)
  assert.equal((await inspect()).top5[0],'Selected Ambient Works 85–92')
  checks.push({name:'Rapid date switches: latest request wins, no ghost leak',passed:true})
  await click('#eject'); await waitPhase('idle'); assert.equal((await inspect()).inserted,null)
  await click('#date-strip button:nth-child(3)'); await sleep(150); await click('#eject'); await waitPhase('idle')
  await sleep(1400); assert.equal((await inspect()).phase,'idle'); assert.equal((await inspect()).ghosts,0)
  checks.push({name:'Eject from ready and during insertion cancels stale reading',passed:true})
  await click('#date-strip button:nth-child(4)'); await waitPhase('reading'); await click('#eject'); await waitPhase('idle')
  checks.push({name:'Eject during reading',passed:true})
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'ArrowRight',code:'ArrowRight',windowsVirtualKeyCode:39})
  await waitPhase('ready'); assert.equal((await inspect()).date,'2026.10.05')
  await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27})
  await waitPhase('idle')
  checks.push({name:'Keyboard next date + Escape',passed:true})
  await click('#date-strip button:nth-child(6)'); await waitPhase('ready')
  await click('#material-toggle'); await capture('desktop-smoke',1360,940)
  await click('#zoom'); await capture('desktop-close',1360,940)
  assert.equal(await evaluate('document.getElementById("zoom").getAttribute("aria-pressed")'),'true')
  await click('#zoom'); await click('#material-toggle')
  await click('#reset-view'); await sleep(500)
  // A native screen tap opens close view; after a drag it must remain untouched.
  const screenPoint=await evaluate(`(()=>{const r=document.getElementById('screen-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  await send('Input.dispatchMouseEvent',{type:'mousePressed',...screenPoint,button:'left',clickCount:1})
  await send('Input.dispatchMouseEvent',{type:'mouseReleased',...screenPoint,button:'left',clickCount:1})
  assert.equal((await inspect()).view.zoomed,true)
  await click('#reset-view'); await sleep(500)
  // Rear-facing insert should align the slot before animating a new disk.
  await cubeKey('ArrowRight',9)
  await click('#date-strip button:nth-child(4)'); await waitPhase('ready')
  assert.equal((await inspect()).view.normalizedYaw,337)
  assert.equal((await inspect()).top5[0],'Random Access Memories')
  checks.push({name:'Native screen tap and rear-facing insertion restore a visible front slot',passed:true})
  await capture('compact-read',800,900); await capture('mobile-read',390,960)
  await capture('mobile-small',320,960)
  await send('Emulation.setDeviceMetricsOverride',{width:390,height:960,deviceScaleFactor:1,mobile:false})
  await sleep(900)
  const touchPoint=await evaluate(`(()=>{const r=document.getElementById('screen-open').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`)
  const beforeTouch=(await inspect()).view.yaw
  await send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...touchPoint,id:1}]})
  for(let i=1;i<=8;i++)await send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touchPoint.x+120*i/8,y:touchPoint.y+30*i/8,id:1}]})
  await send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]})
  await sleep(500)
  assert((await inspect()).view.yaw>beforeTouch+60,JSON.stringify({beforeTouch,after:await inspect(),touchPoint})); assert.equal((await inspect()).view.zoomed,false)
  assert.equal((await inspect()).view.dragging,false)
  await cubeKey('ArrowRight',5); await capture('mobile-back',390,960)
  await click('#reset-view')
  checks.push({name:'Mobile touch rotation preserves scroll outside Mac and suppresses screen click',passed:true})
  await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
  await click('#date-strip button:nth-child(2)'); await waitPhase('ready')
  assert.equal((await inspect()).top5[0],'周杰伦的床边故事')
  await click('#eject'); await waitPhase('idle')
  checks.push({name:'Reduced motion + Chinese Top 5 + reinsertion',passed:true})
  assert.equal(errors.length,0,JSON.stringify(errors))
  writeFileSync(join(output,'verification.json'),JSON.stringify({browser:await send('Browser.getVersion'),checks,errors,final:await inspect()},null,2))
  console.log(JSON.stringify({passed:true,checks:checks.length,output,errors:errors.length},null,2))
} finally {
  if(socket?.readyState === WebSocket.OPEN) { try { await send('Browser.close') } catch {} socket.close() }
  browser.kill()
}
