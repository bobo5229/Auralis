/* Runs only the standalone badge page, with a fresh temporary Electron profile. */
const fs = require('node:fs/promises')
const os = require('node:os')
const path = require('node:path')
const assert = require('node:assert/strict')
const crypto = require('node:crypto')
const { pathToFileURL } = require('node:url')
const { app, BrowserWindow } = require('electron')
// Set the isolated profile synchronously, before Electron can create its default
// session while an asynchronous filesystem operation yields to app readiness.
const profile = require('node:fs').mkdtempSync(path.join(os.tmpdir(), 'auralis-badge-profile-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')

const output =
  process.env.BADGE_CHECK_OUTPUT ||
  path.resolve(__dirname, '../../../../output/enamel-glsl-validation')
const timeout = setTimeout(() => {
  console.error('Badge verification timed out')
  app.exit(1)
}, 90000)
let win, server
const errors = []
const report = { scenarios: [], errors }
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (source) => win.webContents.executeJavaScript(source)
const snapshot = () => js('badgeStudy.snapshot()')
const poll = (expression) =>
  js(
    `new Promise((resolve,reject)=>{const started=performance.now();const check=()=>{if(${expression})resolve(true);else if(performance.now()-started>12000)reject(new Error('Timed out: ${expression}'));else setTimeout(check,20)};check()})`,
  )
const settle = () =>
  poll(
    'window.badgeStudy && (badgeStudy.snapshot().failed || (badgeStudy.snapshot().ready && !badgeStudy.snapshot().running && badgeStudy.snapshot().frames > 0))',
  )
async function capture(name) {
  await settle()
  await wait(60)
  const image = await win.webContents.debugger.sendCommand('Page.captureScreenshot', {
    format: 'png',
  })
  await fs.writeFile(path.join(output, `${name}.png`), Buffer.from(image.data, 'base64'))
}
async function pointer(x, y) {
  const point = await js(
    `(()=>{const r=document.querySelector('#live-stage').getBoundingClientRect();return {x:Math.round(r.x+r.width*${x}),y:Math.round(r.y+r.height*${y})}})()`,
  )
  win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
  await wait(40)
}
async function state(next) {
  await js(`document.querySelector('#${next}').click()`)
  await settle()
}

;(async () => {
  await fs.mkdir(output, { recursive: true })
  const phase = (value) =>
    require('node:fs').writeFileSync(
      path.join(output, 'phase.json'),
      JSON.stringify({ phase: value }),
    )
  phase('waiting for Electron')
  await app.whenReady()
  phase('importing local server')
  const serving = await import(pathToFileURL(path.join(__dirname, 'server.mjs')).href)
  phase('starting local server')
  const instance = await serving.startServer(0)
  server = instance.server
  win = new BrowserWindow({
    width: 1280,
    height: 1080,
    show: false,
    useContentSize: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      offscreen: true,
    },
  })
  phase('loading page')
  win.webContents.setFrameRate(60)
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message)
  })
  win.webContents.on('render-process-gone', (_event, detail) =>
    errors.push(`Renderer gone: ${JSON.stringify(detail)}`),
  )
  await win.loadURL(instance.url)
  phase('attaching debugger after navigation')
  win.webContents.debugger.attach('1.3')
  phase('setting initial device metrics')
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  })
  phase('page loaded')
  await settle()
  assert.equal((await snapshot()).failed, false, 'WebGL must actually render for this validation')
  await js('document.fonts.ready')
  assert.equal(
    await js('Array.from(document.images).every(i=>i.complete && i.naturalWidth>0)'),
    true,
  )
  assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true)
  report.smallPreview = await js(
    `(()=>{const c=document.querySelector('#small-canvas');const p=c.getContext('2d').getImageData(0,0,c.width,c.height).data;return {width:c.width,height:c.height,opaque:p.filter((v,i)=>i%4===3&&v>0).length,mainWidth:document.querySelector('#badge-canvas').width,stageWidth:document.querySelector('#live-stage').clientWidth}})()`,
  )
  assert.ok(report.smallPreview.opaque > 100, JSON.stringify(report.smallPreview))
  await capture('dark-front')
  // A static page must not keep a perpetual render loop alive.
  const initial = await snapshot()
  await wait(250)
  assert.equal((await snapshot()).frames, initial.frames)
  report.scenarios.push('initial rendering and idle RAF stop')
  for (const [name, x, y] of [
    ['left', 0.08, 0.5],
    ['right', 0.92, 0.5],
    ['top', 0.5, 0.08],
    ['bottom', 0.5, 0.92],
  ]) {
    await pointer(x, y)
    await settle()
    const current = await snapshot()
    assert.ok(Math.abs(current.pose.x) + Math.abs(current.pose.y) > 0.08, name)
    assert.ok(
      Math.max(Math.abs(current.pose.x), Math.abs(current.pose.y)) <= (Math.PI * 8) / 180 + 0.00001,
    )
    await capture(`dark-${name}`)
  }
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 2, y: 2 })
  await wait(40)
  await settle()
  assert.equal((await snapshot()).pose.x, 0)
  assert.equal((await snapshot()).pose.y, 0)
  await js(`document.querySelector('#live-stage').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
  await wait(30)
  await settle()
  assert.ok((await snapshot()).pose.y > 0)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' })
  await wait(30)
  await settle()
  assert.equal((await snapshot()).pose.y, 0)
  report.scenarios.push('four pointer directions, leave reset, arrow keys and Home')
  await js(`document.querySelector('#reflection').click()`)
  await capture('dark-no-reflection')
  assert.equal((await snapshot()).reflections, false)
  await js(`document.querySelector('#reflection').click();document.querySelector('#theme').click()`)
  await capture('light-front')
  await state('unlit')
  await capture('light-unlit')
  await js(`document.querySelector('#theme').click()`)
  await capture('dark-unlit')
  await state('lit')
  report.scenarios.push('reflection toggle, both material states, both backgrounds')
  for (const dpr of [1.25, 2]) {
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 1080,
      deviceScaleFactor: dpr,
      mobile: false,
    })
    await wait(100)
    await settle()
    await poll(`Math.abs(badgeStudy.snapshot().dpr - ${dpr}) < .001`)
    await capture(`desktop-dpr-${dpr}`)
  }
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 390,
    height: 844,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await wait(100)
  await settle()
  assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true)
  await capture('narrow-top')
  await js(`document.querySelector('#live-stage').scrollIntoView({block:'center'})`)
  await capture('narrow-material')
  await state('unlit')
  await capture('narrow-unlit')
  await state('lit')
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1280,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  })
  await js('scrollTo(0,0)')
  await wait(100)
  await settle()
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await wait(80)
  await pointer(0.9, 0.9)
  await wait(100)
  assert.equal((await snapshot()).reducedMotion, true)
  assert.equal((await snapshot()).pose.x, 0)
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
  report.scenarios.push('DPR 1/1.25/2, 390px layout and reduced motion')

  // Record actual WebGL output while dispatching pointer events through the same
  // DOM handlers as mouse input. Deterministic trajectory makes comparisons useful.
  const recording = await js(`(async()=>{
    const canvas=document.querySelector('#badge-canvas');
    const stream=canvas.captureStream(30);
    const recorder=new MediaRecorder(stream,{mimeType:'video/webm;codecs=vp9',videoBitsPerSecond:2500000});
    const chunks=[];recorder.ondataavailable=e=>chunks.push(e.data);
    const done=new Promise(resolve=>recorder.onstop=resolve);
    recorder.start();
    const host=document.querySelector('#live-stage'),box=host.getBoundingClientRect();
    const intervals=[],start=performance.now();let previous=start;
    await new Promise(resolve=>{function step(now){intervals.push(now-previous);previous=now;const t=(now-start)/1000;host.dispatchEvent(new PointerEvent('pointermove',{clientX:box.x+box.width*(.5+.42*Math.sin(t*2)),clientY:box.y+box.height*(.5+.42*Math.cos(t*2)),pointerType:'mouse'}));if(t<4)requestAnimationFrame(step);else resolve()}requestAnimationFrame(step)});
    host.dispatchEvent(new PointerEvent('pointerleave'));await new Promise(r=>setTimeout(r,400));
    recorder.stop();await done;stream.getTracks().forEach(t=>t.stop());
    const blob=new Blob(chunks,{type:'video/webm'});const data=await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(blob)});
    return {data,intervals:intervals.slice(2)};
  })()`)
  await fs.writeFile(path.join(output, 'interaction.webm'), Buffer.from(recording.data, 'base64'))
  const timings = recording.intervals.slice().sort((a, b) => a - b)
  report.performance = {
    frames: timings.length,
    p50: timings[Math.floor(timings.length * 0.5)],
    p95: timings[Math.floor(timings.length * 0.95)],
    over33ms: timings.filter((t) => t > 33.4).length,
    over50ms: timings.filter((t) => t > 50).length,
    note: 'rAF frame intervals during 4s of real canvas recording; includes capture overhead, not GPU timings',
  }
  await settle()
  const after = await snapshot()
  await wait(250)
  assert.equal((await snapshot()).frames, after.frames)
  report.scenarios.push('actual canvas video and render loop settling after continuous input')
  report.gpu = await app.getGPUInfo('complete')
  report.environment = {
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    platform: process.platform,
    dpr: (await snapshot()).dpr,
  }
  await js('badgeStudy.forceContextLoss()')
  await poll('badgeStudy.snapshot().failed')
  assert.equal(
    await js(
      `!document.querySelector('#fallback').hidden && document.querySelector('#badge-canvas').hidden`,
    ),
    true,
  )
  await capture('context-loss-fallback')
  await state('unlit')
  assert.match(await js(`document.querySelector('#fallback').src`), /unlit/)
  await win.loadURL(`${instance.url}?fallback`)
  await settle()
  assert.equal((await snapshot()).failed, true)
  assert.equal(await js(`document.querySelector('#reflection').disabled`), true)
  report.scenarios.push('context loss and unavailable renderer fallback, including state changes')
  const manifest = JSON.parse(
    await fs.readFile(path.join(__dirname, 'assets/manifest.json'), 'utf8'),
  )
  for (const [file, expected] of Object.entries(manifest.sourceAssetHashes)) {
    const bytes = await fs.readFile(path.join(__dirname, '..', file))
    assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), expected, file)
  }
  assert.equal(Object.keys(manifest.sourceAssetHashes).length, 44)
  report.scenarios.push('all 44 original assets unchanged')
  assert.deepEqual(errors, [])
  report.passed = true
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  console.log(
    JSON.stringify({
      passed: true,
      output,
      scenarios: report.scenarios,
      performance: report.performance,
    }),
  )
})()
  .catch(async (error) => {
    report.passed = false
    report.failure = error.stack
    console.error(error)
    await fs.mkdir(output, { recursive: true })
    await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
    process.exitCode = 1
  })
  .finally(() => {
    clearTimeout(timeout)
    win?.destroy()
    server?.close()
    app.exit(process.exitCode || 0)
  })
