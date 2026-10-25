import { app, BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'auralis-case-material-')))
const root = process.cwd()
const output = path.join(
  root,
  process.env.CASE_CHECK_OUTPUT || 'output/badge-case-material/retained-impressions',
)
const checks = [],
  errors = []
let win, server
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const timeout = setTimeout(() => {
  console.error('Material demo verification timed out')
  app.exit(1)
}, 60000)
async function main() {
  await app.whenReady()
  await mkdir(output, { recursive: true })
  const { startServer } = await import(
    pathToFileURL(path.join(root, 'demo/archive/badge-case-material/serve.mjs')).href
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
  const evaluate = (source) => win.webContents.executeJavaScript(source)
  const assert = (name, pass, detail) => {
    checks.push({ name, pass: !!pass, detail })
    if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`)
  }
  const until = async (source) => {
    for (let i = 0; i < 120; i++) {
      if (await evaluate(source)) return
      await wait(25)
    }
    throw new Error(`Timed out: ${source}`)
  }
  const loaded = () =>
    until(
      `[...document.querySelectorAll('.badge-image')].every(img=>img.complete&&img.naturalWidth===330)`,
    )
  const capture = async (name, settled = true) => {
    await loaded()
    await evaluate(
      `Promise.all([...document.querySelectorAll('.badge-image')].map(image=>image.decode()))`,
    )
    if (settled) await until(`!window.foamMaterial.snapshot().running`)
    await wait(settled ? 60 : 0)
    let screenshot
    const visible = await evaluate(
      `({width:innerWidth,height:innerHeight,images:[...document.querySelectorAll('.badge-button[aria-pressed="false"] .badge-image')].map(image=>image.getBoundingClientRect().toJSON()).filter(box=>box.left>=0&&box.right<=innerWidth)})`,
    )
    // Decode completion precedes GPU composition in offscreen Electron. Wait for
    // the actual pixels of visible colored badges rather than saving a blank frame.
    for (let attempt = 0; attempt < 5; attempt++) {
      win.webContents.invalidate()
      await wait(settled ? 120 : 16)
      screenshot = await win.webContents.capturePage()
      const bitmap = screenshot.toBitmap(),
        size = screenshot.getSize()
      const samples = visible.images.map((box) => {
        // Silver lettering can be almost neutral; sample a central patch instead
        // of assuming one coordinate always lands on colored enamel.
        let bright = 0
        for (let gy = 0; gy < 5; gy++)
          for (let gx = 0; gx < 5; gx++) {
            const x = Math.floor(
              ((box.left + box.width * (0.3 + gx * 0.1)) * size.width) / visible.width,
            )
            const y = Math.floor(
              ((box.top + box.height * (0.3 + gy * 0.1)) * size.height) / visible.height,
            )
            const i = (y * size.width + x) * 4
            if (Math.max(bitmap[i], bitmap[i + 1], bitmap[i + 2]) > 80) bright++
          }
        return { bright, complete: bright > 5 }
      })
      const complete = samples.every((sample) => sample.complete)
      if (complete) break
      if (attempt === 4) {
        await writeFile(path.join(output, name + '-failure.png'), screenshot.toPNG())
        console.error(
          JSON.stringify({
            size,
            scales: screenshot.getScaleFactors(),
            bitmapLength: bitmap.length,
            visible,
            samples,
          }),
        )
        throw new Error('Offscreen capture is missing visible badge pixels: ' + name)
      }
    }
    await writeFile(path.join(output, name + '.png'), screenshot.toPNG())
  }
  await win.loadURL(instance.url)
  await until(`document.documentElement.dataset.ready==='true'`)
  await evaluate('document.fonts.ready')
  await loaded()
  assert(
    'four hour badges loaded',
    await evaluate(`document.querySelectorAll('.badge-image').length===4`),
  )
  assert(
    'one shared Canvas2D foam surface and static badge PNGs',
    await evaluate(
      `document.querySelectorAll('.foam-surface').length===1&&document.querySelector('.foam-surface').dataset.renderer==='canvas2d'&&window.foamMaterial.snapshot().fields.length===4&&window.badgeInspector.snapshot().renderer===null&&![...document.querySelectorAll('.badge-image')].some(img=>img.tagName==='CANVAS')`,
    ),
  )
  assert(
    'hard cut-out pockets removed',
    await evaluate(`document.querySelectorAll('.badge-pocket,clipPath,filter').length===0`),
  )
  const geometry = await evaluate(
    `(() => {const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},rim:box('.aluminium-rim'),foam:box('.foam-viewport'),bodyOverflow:document.documentElement.scrollWidth>innerWidth}})()`,
  )
  assert(
    'rim surrounds foam with visible material width',
    geometry.foam.left - geometry.rim.left > 20 && geometry.foam.right < geometry.rim.right - 20,
    geometry,
  )
  assert('desktop has no horizontal page overflow', !geometry.bodyOverflow)
  await capture('desktop')
  const surfaceLuminance = () =>
    evaluate(`(() => {
    const canvas=document.querySelector('.foam-surface'), context=canvas.getContext('2d'),
      surface=canvas.getBoundingClientRect(), badge=document.querySelector('[data-badge="hours-100"]').getBoundingClientRect(),
      sx=canvas.width/surface.width,sy=canvas.height/surface.height;
    const average=(left,top,width,height)=>{
      const pixels=context.getImageData(Math.round(left*sx),Math.round(top*sy),Math.round(width*sx),Math.round(height*sy)).data;
      let total=0;for(let i=0;i<pixels.length;i+=4) total+=pixels[i]*.2126+pixels[i+1]*.7152+pixels[i+2]*.0722;
      return total/(pixels.length/4);
    };
    return {
      deep:average(badge.left+badge.width*.35-surface.left,badge.top+badge.height*.35-surface.top,badge.width*.3,badge.height*.3),
      unpressed:average(badge.left+badge.width*.35-surface.left,4,badge.width*.3,10)
    };
  })()`)
  const pressedLuminance = await surfaceLuminance()
  const idle = await evaluate(`window.foamMaterial.snapshot().frames`)
  await wait(150)
  assert(
    'material stops drawing at rest',
    (await evaluate(`window.foamMaterial.snapshot().frames`)) === idle,
  )
  await evaluate(
    `document.querySelector('#empty-toggle').click();for(const button of document.querySelectorAll('.badge-button')) if(button.dataset.badge!=='hours-100') button.click()`,
  )
  await until(
    `document.querySelector('[data-badge="hours-100"]').getAttribute('aria-pressed')==='true'`,
  )
  await wait(170)
  const releasing = await evaluate(
    `window.foamMaterial.snapshot().fields.find(field=>field.id==='hours-100')`,
  )
  assert(
    'lifting only partially releases the compression',
    releasing.target > 0.7 &&
      releasing.target < 1 &&
      releasing.pressure >= releasing.target &&
      releasing.pressure < 1,
    releasing,
  )
  await capture('release-transient', false)
  await until(`!window.foamMaterial.snapshot().running`)
  assert(
    'foam settles with an obvious retained impression',
    await evaluate(
      `(() => {const field=window.foamMaterial.snapshot().fields.find(field=>field.id==='hours-100');return field.pressure>.7&&field.pressure<1&&field.velocity===0})()`,
    ),
  )
  await capture('one-retained')
  const retainedLuminance = await surfaceLuminance()
  assert(
    'retained impression stays darker than nearby unpressed foam',
    retainedLuminance.deep < retainedLuminance.unpressed * 0.85 &&
      retainedLuminance.deep >= pressedLuminance.deep,
    { pressedLuminance, retainedLuminance },
  )
  const retainedFrames = await evaluate(`window.foamMaterial.snapshot().frames`)
  await wait(450)
  assert(
    'retained impression stays visible without continuous drawing',
    await evaluate(
      `window.foamMaterial.snapshot().frames===${retainedFrames}&&window.foamMaterial.snapshot().fields.find(field=>field.id==='hours-100').pressure>.7`,
    ),
  )
  await evaluate(
    `document.querySelector('[data-series="days"]').click();document.querySelector('[data-series="hours"]').click()`,
  )
  assert(
    'category changes preserve removed badges and their impressions',
    await evaluate(
      `document.querySelector('[data-badge="hours-100"]').getAttribute('aria-pressed')==='true'&&window.foamMaterial.snapshot().fields.find(field=>field.id==='hours-100').pressure>.7`,
    ),
  )
  await evaluate(`document.querySelector('#empty-toggle').click()`)
  assert(
    'empty control removes every badge in category',
    await evaluate(
      `[...document.querySelectorAll('.badge-button')].every(button=>button.getAttribute('aria-pressed')==='true')`,
    ),
  )
  await capture('all-retained')
  assert(
    'all removed badges retain their soft impressions',
    await evaluate(
      `window.foamMaterial.snapshot().fields.every(field=>field.pressure>.7&&field.pressure<1&&field.velocity===0)`,
    ),
  )
  await evaluate(
    `document.querySelector('#empty-toggle').click();document.querySelector('[data-series="days"]').click()`,
  )
  await loaded()
  assert(
    'days category contains all five designs',
    await evaluate(`document.querySelectorAll('.badge-image').length===5`),
  )
  await until(`!document.querySelector('.scroll-arrow--next').disabled`)
  await evaluate(`document.querySelector('.scroll-arrow--next').click()`)
  await until(`document.querySelector('.foam-viewport').scrollLeft>10`)
  assert('next arrow actually scrolls', true)
  await evaluate(
    `document.querySelector('.foam-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-150,bubbles:true,cancelable:true}))`,
  )
  await until(`document.querySelector('.foam-viewport').scrollLeft<100`)
  assert('vertical wheel supports horizontal browsing', true)
  await evaluate(`document.querySelector('[data-series="albums"]').click()`)
  await loaded()
  assert(
    'albums category contains both designs',
    await evaluate(`document.querySelectorAll('.badge-image').length===2`),
  )
  await evaluate(
    `document.querySelector('[data-series="hours"]').click();document.querySelector('#environment-toggle').click()`,
  )
  await capture('light-environment')
  assert(
    'light environment preserves black foam',
    await evaluate(
      `document.documentElement.dataset.environment==='light'&&getComputedStyle(document.querySelector('.foam-viewport')).backgroundColor==='rgb(32, 33, 31)'`,
    ),
  )
  await evaluate(
    `document.querySelector('#environment-toggle').click();document.querySelector('[data-series="days"]').click()`,
  )
  win.setContentSize(900, 760)
  await wait(150)
  await capture('compact')
  assert(
    'compact page fits, tray scrolls',
    await evaluate(
      `document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.foam-viewport').scrollWidth>document.querySelector('.foam-viewport').clientWidth`,
    ),
  )
  win.setContentSize(390, 844)
  await wait(150)
  await capture('narrow')
  assert(
    'narrow page fits while badges retain size',
    await evaluate(
      `document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.badge-button').clientWidth===184`,
    ),
  )
  await evaluate(`document.querySelector('.badge-button').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
  await until(`document.querySelector('.badge-button').getAttribute('aria-pressed')==='true'`)
  await until(`window.badgeInspector.snapshot().phase==='inspecting'`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await until(`window.badgeInspector.snapshot().phase==='closed'`)
  await until(`document.querySelector('.badge-button').getAttribute('aria-pressed')==='false'`)
  assert('native keyboard can inspect and return a badge', true)
  // Fast direction changes must settle into the last requested pressure state.
  await evaluate(
    `document.querySelector('#empty-toggle').click();document.querySelector('#empty-toggle').click();document.querySelector('#empty-toggle').click()`,
  )
  await until(`!window.foamMaterial.snapshot().running`)
  assert(
    'rapid toggles settle at the retained depth without overshoot',
    await evaluate(
      `window.foamMaterial.snapshot().fields[0].pressure>.7&&window.foamMaterial.snapshot().fields[0].pressure<1&&window.foamMaterial.snapshot().fields.every(field=>Number.isFinite(field.pressure)&&field.pressure>=0&&field.pressure<=1)`,
    ),
  )
  win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await wait(50)
  await evaluate(`document.querySelector('#empty-toggle').click()`)
  assert(
    'reduced motion updates pressure immediately without a loop',
    await evaluate(
      `window.foamMaterial.snapshot().fields[0].pressure===1&&!window.foamMaterial.snapshot().animating`,
    ),
  )
  await evaluate(`document.querySelector('#empty-toggle').click()`)
  assert(
    'reduced motion also retains the impression when removed',
    await evaluate(
      `window.foamMaterial.snapshot().fields[0].pressure>.7&&window.foamMaterial.snapshot().fields[0].pressure<1&&!window.foamMaterial.snapshot().animating`,
    ),
  )
  win.webContents.debugger.detach()
  await until(`!window.foamMaterial.snapshot().running`)
  const material = await evaluate(`window.foamMaterial.snapshot()`)
  assert('no runtime errors', errors.length === 0, errors)
  await writeFile(
    path.join(output, 'report.json'),
    JSON.stringify(
      {
        passed: true,
        scope:
          'Standalone pressure material prototype, shared Canvas2D; static badge PNGs, no production IPC or database',
        checks,
        errors,
        geometry,
        material,
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
main().catch(async (error) => {
  console.error(error)
  clearTimeout(timeout)
  server?.close()
  app.exit(1)
})
