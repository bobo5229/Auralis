import { app, BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'auralis-badge-inspection-')))
const output = path.resolve(
  process.env.INSPECTION_OUTPUT || 'output/badge-case-material/inspection',
)
const checks = [],
  errors = []
let win, server
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const timeout = setTimeout(() => {
  console.error('Inspection check timed out')
  app.exit(1)
}, 90000)
async function main() {
  await app.whenReady()
  await mkdir(output, { recursive: true })
  const { startServer } = await import(
    pathToFileURL(path.resolve('demo/archive/badge-case-material/serve.mjs'))
  )
  const instance = await startServer(0)
  server = instance.server
  win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 900,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  })
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
  const run = (code) => win.webContents.executeJavaScript(code)
  const assert = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail })
    if (!pass) throw new Error(name + ': ' + JSON.stringify(detail))
  }
  const until = async (code) => {
    for (let i = 0; i < 300; i++) {
      if (await run(code)) return
      await wait(10)
    }
    throw new Error('Timed out: ' + code)
  }
  const state = () => run('window.badgeInspector.snapshot()')
  const ready = () =>
    until(
      `window.badgeInspector.snapshot().phase==='inspecting'&&!window.foamMaterial.snapshot().running`,
    )
  const closed = () => until(`window.badgeInspector.snapshot().phase==='closed'`)
  const key = (value) => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: value })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: value })
  }
  const click = async (selector) => {
    const box = await run(
      `document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect().toJSON()`,
    )
    const x = Math.round(box.x + box.width / 2),
      y = Math.round(box.y + box.height / 2)
    win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x, y, clickCount: 1 })
    win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x, y, clickCount: 1 })
  }
  const deferredCaptures = []
  const capture = async (name, deferEncoding = false) => {
    win.webContents.invalidate()
    await wait(35)
    const image = await win.webContents.capturePage()
    // PNG encoding is synchronous and can outlast a short motion phase. Keep
    // the captured native pixels and encode them after the real turn finishes.
    if (deferEncoding) {
      deferredCaptures.push({ name, image })
      return
    }
    await writeFile(path.join(output, name + '.png'), image.toPNG())
    return image.toPNG()
  }
  await win.loadURL(instance.url)
  await until(`document.documentElement.dataset.ready==='true'`)
  await run('document.fonts.ready')
  await until(`[...document.querySelectorAll('.badge-image')].every(image=>image.complete)`)
  assert('no WebGL renderer until a badge is inspected', (await state()).renderer === null)
  await capture('case-desktop')
  await click('[data-badge="hours-100"]')
  await until(`window.badgeInspector.snapshot().phase==='entering'`)
  const entering = await state()
  assert(
    'a native left click starts the inspection transition',
    entering.badgeId === 'hours-100',
    entering,
  )
  await until(
    `window.badgeInspector.snapshot().renderer.pose.y>1.25&&window.badgeInspector.snapshot().renderer.pose.y<1.8`,
  )
  await capture('turn-edge', true)
  await until(
    `window.badgeInspector.snapshot().renderer.pose.y>2.7&&window.badgeInspector.snapshot().renderer.pose.y<3.6`,
  )
  const back = await state()
  await capture('turn-back', true)
  assert(
    'vertical-axis turn exposes a solid metal back',
    back.phase === 'entering' && back.renderer.meshes === 5 && back.renderer.pose.y > 2.7,
    back,
  )
  await ready()
  for (const { name, image } of deferredCaptures)
    await writeFile(path.join(output, name + '.png'), image.toPNG())
  const front = await capture('inspect-front')
  assert(
    'inspection settles facing forward after one revolution',
    await run(`Math.abs(window.badgeInspector.snapshot().renderer.pose.y-Math.PI*2)<.001`),
  )
  assert(
    'one selected badge owns the live material maps',
    await run(
      `window.badgeInspector.snapshot().renderer.textures===6&&document.querySelectorAll('.inspect-canvas').length===1&&[...document.querySelectorAll('.badge-image')].every(image=>image.tagName==='IMG')`,
    ),
  )
  assert(
    'original badge is lifted and retains its foam impression',
    await run(
      `document.querySelector('[data-badge="hours-100"]').dataset.inspected==='true'&&getComputedStyle(document.querySelector('[data-badge="hours-100"] img')).visibility==='hidden'&&window.foamMaterial.snapshot().fields.find(field=>field.id==='hours-100').pressure===.82`,
    ),
  )
  assert(
    'modal contains no visible detail text',
    await run(
      `document.querySelector('.badge-inspector').textContent.trim()===''&&document.querySelector('.badge-inspector').matches(':modal')`,
    ),
  )
  const box = await run(
    `document.querySelector('.inspect-object').getBoundingClientRect().toJSON()`,
  )
  win.webContents.sendInputEvent({
    type: 'mouseMove',
    x: Math.round(box.x + box.width * 0.77),
    y: Math.round(box.y + box.height * 0.29),
  })
  await until(
    `!window.badgeInspector.snapshot().running&&window.badgeInspector.snapshot().renderer.pose.y>Math.PI*2+.03`,
  )
  const hovered = await capture('inspect-hover')
  assert('hover changes the rendered pose and reflections', !front.equals(hovered), await state())
  const idle = (await state()).renderer.frames
  await wait(200)
  assert('stationary inspection stops rendering', (await state()).renderer.frames === idle)
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 20, y: 20 })
  await until(
    `!window.badgeInspector.snapshot().running&&Math.abs(window.badgeInspector.snapshot().renderer.pose.y-Math.PI*2)<.001`,
  )
  assert('pointer leave returns to a neutral pose', true)
  key('Escape')
  await until(`window.badgeInspector.snapshot().phase==='leaving'`)
  await wait(110)
  await capture('returning')
  await closed()
  await until(`!window.foamMaterial.snapshot().running`)
  assert(
    'Escape returns the badge and keyboard focus to its source',
    await run(
      `document.activeElement.dataset.badge==='hours-100'&&document.querySelector('[data-badge="hours-100"]').getAttribute('aria-pressed')==='false'&&getComputedStyle(document.querySelector('[data-badge="hours-100"] img')).visibility==='visible'`,
    ),
  )
  await capture('returned')
  await click('[data-badge="hours-100"]')
  await until(`window.badgeInspector.snapshot().phase==='entering'`)
  key('Escape')
  await closed()
  assert(
    'early exit during the turn leaves no hidden badge',
    await run(
      `!document.querySelector('[data-inspected]')&&!document.querySelector('.badge-inspector').open`,
    ),
  )
  await click('[data-badge="hours-500"]')
  await ready()
  win.setContentSize(900, 760)
  await wait(150)
  await capture('inspect-compact')
  assert(
    'resize keeps the inspected badge inside the viewport',
    await run(
      `(() => {const box=document.querySelector('.inspect-object').getBoundingClientRect();return box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight})()`,
    ),
  )
  await click('.inspect-close')
  await closed()
  assert('icon button puts the badge back', true)
  await run(`document.querySelector('[data-badge="hours-10"]').click()`)
  await ready()
  // Click actual surrounding blank space, away from the badge and close button.
  win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', x: 25, y: 25, clickCount: 1 })
  win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', x: 25, y: 25, clickCount: 1 })
  await closed()
  assert('blank-space click puts the badge back', true)
  // Hold one new badge's requests to exercise cancellation during concurrent
  // preparation; a later selection must own its complete texture set.
  win.webContents.debugger.attach('1.3')
  const held = []
  const pause = (_event, method, params) => {
    if (method === 'Fetch.requestPaused') held.push(params.requestId)
  }
  win.webContents.debugger.on('message', pause)
  await win.webContents.debugger.sendCommand('Fetch.enable', {
    patterns: [{ urlPattern: '*/materials/days-365/*', requestStage: 'Request' }],
  })
  await run(
    `document.querySelector('[data-series="days"]').click();document.querySelector('[data-badge="days-365"]').click()`,
  )
  await until(`window.badgeInspector.snapshot().phase==='loading'`)
  key('Escape')
  await closed()
  assert(
    'closing during material preparation keeps the source badge visible',
    await run(
      `!document.querySelector('[data-inspected]')&&document.querySelector('[data-badge="days-365"]').getAttribute('aria-pressed')==='false'`,
    ),
  )
  for (const requestId of held)
    await win.webContents.debugger.sendCommand('Fetch.continueRequest', { requestId })
  await win.webContents.debugger.sendCommand('Fetch.disable')
  win.webContents.debugger.removeListener('message', pause)
  win.webContents.debugger.detach()
  await run(`document.querySelector('[data-badge="days-100"]').click()`)
  await ready()
  assert(
    'a later selection replaces cancelled preparation coherently',
    await run(
      `window.badgeInspector.snapshot().renderer.badgeId==='days-100'&&window.badgeInspector.snapshot().renderer.textures===6`,
    ),
  )
  key('Escape')
  await closed()
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  const catalog = await run(`fetch('/catalog.json').then(response=>response.json())`),
    assets = []
  for (const badge of catalog) {
    await run(
      `document.querySelector('[data-series="${badge.series}"]').click();document.querySelector('[data-badge="${badge.id}"]').scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});document.querySelector('[data-badge="${badge.id}"]').click()`,
    )
    await ready()
    assets.push(await state())
    if (badge.id === 'days-100') await capture('inspect-days-100')
    if (badge.id === 'albums-1') await capture('inspect-albums-1')
    key('Escape')
    await closed()
  }
  assert(
    'all eleven badges load their own GLSL front and solid body',
    assets.length === 11 &&
      assets.every(
        (value, i) =>
          value.badgeId === catalog[i].id &&
          value.renderer.ready &&
          value.renderer.meshes === 5 &&
          value.renderer.textures === 6,
      ),
    assets.map((value) => ({ id: value.badgeId, textures: value.renderer.textures })),
  )
  assert(
    'reduced motion reaches the front without a spinning loop',
    assets.every(
      (value) => !value.running && Math.abs(value.renderer.pose.y - Math.PI * 2) < 0.001,
    ),
  )
  win.setContentSize(390, 844)
  await wait(100)
  await run(
    `document.querySelector('[data-series="days"]').click();document.querySelector('[data-badge="days-100"]').scrollIntoView({block:'nearest',inline:'center',behavior:'instant'});document.querySelector('[data-badge="days-100"]').click()`,
  )
  await ready()
  await capture('inspect-narrow')
  assert(
    'narrow inspection is centered and fits the screen',
    await run(
      `(() => {const box=document.querySelector('.inspect-object').getBoundingClientRect();return Math.abs(box.left+box.width/2-innerWidth/2)<2&&box.left>=0&&box.right<=innerWidth&&box.top>=0&&box.bottom<=innerHeight})()`,
    ),
  )
  key('Escape')
  await closed()
  win.webContents.debugger.detach()
  assert('no renderer or shader errors', errors.length === 0, errors)
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        passed: true,
        scope:
          'Isolated Electron prototype; real Three.js/GLSL assets, no product IPC or user data',
        checks,
        errors,
      },
      null,
      2,
    ),
  )
  console.log(JSON.stringify({ passed: true, checks: checks.length, output }))
  clearTimeout(timeout)
  win.destroy()
  server.close()
  app.exit(0)
}
main().catch((error) => {
  console.error(error)
  clearTimeout(timeout)
  server?.close()
  app.exit(1)
})
