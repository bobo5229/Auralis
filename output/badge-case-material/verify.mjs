import { app, BrowserWindow } from 'electron'
import { mkdtempSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'auralis-case-material-')))
const root = process.cwd()
const output = path.join(root, 'output/badge-case-material/round-2')
const checks = [], errors = []
let win, server
const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
const timeout = setTimeout(() => { console.error('Material demo verification timed out'); app.exit(1) }, 60000)
async function main() {
  await app.whenReady()
  await mkdir(output, { recursive: true })
  const { startServer } = await import(pathToFileURL(path.join(root, 'demo/archive/badge-case-material/serve.mjs')).href)
  const instance = await startServer(0)
  server = instance.server
  win = new BrowserWindow({ show: false, width: 1440, height: 900, useContentSize: true,
    webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, offscreen: true, backgroundThrottling: false } })
  win.webContents.on('console-message', event => { if (event.level === 'error') errors.push(event.message) })
  const evaluate = source => win.webContents.executeJavaScript(source)
  const assert = (name, pass, detail) => { checks.push({ name, pass: !!pass, detail }); if (!pass) throw new Error(`${name}: ${JSON.stringify(detail)}`) }
  const until = async source => {
    for (let i = 0; i < 120; i++) { if (await evaluate(source)) return; await wait(25) }
    throw new Error(`Timed out: ${source}`)
  }
  const loaded = () => until(`[...document.querySelectorAll('.badge-image')].every(img=>img.complete&&img.naturalWidth===330)`)
  const capture = async name => {
    await loaded()
    await evaluate(`Promise.all([...document.querySelectorAll('.badge-image')].map(image=>image.decode()))`)
    await wait(350)
    win.webContents.invalidate()
    await wait(150)
    await writeFile(path.join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
  }
  await win.loadURL(instance.url)
  await until(`document.documentElement.dataset.ready==='true'`)
  await evaluate('document.fonts.ready')
  await loaded()
  assert('four hour badges loaded', await evaluate(`document.querySelectorAll('.badge-image').length===4`))
  assert('no live badge canvas or WebGL renderer', await evaluate(`document.querySelectorAll('canvas').length===0`))
  const geometry = await evaluate(`(() => {const box=s=>document.querySelector(s).getBoundingClientRect().toJSON();return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},rim:box('.aluminium-rim'),foam:box('.foam-viewport'),bodyOverflow:document.documentElement.scrollWidth>innerWidth}})()`)
  assert('rim surrounds foam with visible material width', geometry.foam.left - geometry.rim.left > 20 && geometry.foam.right < geometry.rim.right - 20, geometry)
  assert('desktop has no horizontal page overflow', !geometry.bodyOverflow)
  await capture('desktop')
  await evaluate(`document.querySelector('[data-badge="hours-100"]').click()`)
  await until(`document.querySelector('[data-badge="hours-100"]').getAttribute('aria-pressed')==='true'`)
  assert('removing badge exposes real contour pocket', await evaluate(`document.querySelector('[data-badge="hours-100"] .badge-pocket path').getAttribute('d').includes('Q172 12')`))
  await capture('one-empty-pocket')
  await evaluate(`document.querySelector('#empty-toggle').click()`)
  assert('empty control removes every badge in category', await evaluate(`[...document.querySelectorAll('.badge-button')].every(button=>button.getAttribute('aria-pressed')==='true')`))
  await capture('all-empty-pockets')
  await evaluate(`document.querySelector('#empty-toggle').click();document.querySelector('[data-series="days"]').click()`)
  await loaded()
  assert('days category contains all five designs', await evaluate(`document.querySelectorAll('.badge-image').length===5`))
  await until(`!document.querySelector('.scroll-arrow--next').disabled`)
  await evaluate(`document.querySelector('.scroll-arrow--next').click()`)
  await until(`document.querySelector('.foam-viewport').scrollLeft>10`)
  assert('next arrow actually scrolls', true)
  await evaluate(`document.querySelector('.foam-viewport').dispatchEvent(new WheelEvent('wheel',{deltaY:-150,bubbles:true,cancelable:true}))`)
  await until(`document.querySelector('.foam-viewport').scrollLeft<100`)
  assert('vertical wheel supports horizontal browsing', true)
  await evaluate(`document.querySelector('[data-series="albums"]').click()`)
  await loaded()
  assert('albums category contains both designs', await evaluate(`document.querySelectorAll('.badge-image').length===2`))
  await evaluate(`document.querySelector('[data-series="hours"]').click();document.querySelector('#environment-toggle').click()`)
  await capture('light-environment')
  assert('light environment preserves black foam', await evaluate(`document.documentElement.dataset.environment==='light'&&getComputedStyle(document.querySelector('.foam-viewport')).backgroundColor==='rgb(32, 33, 31)'`))
  await evaluate(`document.querySelector('#environment-toggle').click();document.querySelector('[data-series="days"]').click()`)
  win.setContentSize(900, 760)
  await wait(150)
  await capture('compact')
  assert('compact page fits, tray scrolls', await evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.foam-viewport').scrollWidth>document.querySelector('.foam-viewport').clientWidth`))
  win.setContentSize(390, 844)
  await wait(150)
  await capture('narrow')
  assert('narrow page fits while badges retain size', await evaluate(`document.documentElement.scrollWidth<=innerWidth&&document.querySelector('.badge-button').clientWidth===184`))
  await evaluate(`document.querySelector('.badge-button').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
  await until(`document.querySelector('.badge-button').getAttribute('aria-pressed')==='true'`)
  assert('native keyboard can remove and replace badge', true)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
  win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
  await until(`document.querySelector('.badge-button').getAttribute('aria-pressed')==='false'`)
  assert('no runtime errors', errors.length === 0, errors)
  await writeFile(path.join(output, 'report.json'), JSON.stringify({ passed: true, scope: 'Standalone material prototype, no production IPC or database', checks, errors, geometry }, null, 2))
  console.log(JSON.stringify({ passed: true, checks: checks.length, output }))
  clearTimeout(timeout)
  win.destroy()
  server.close()
  app.exit(0)
}
main().catch(async error => { console.error(error); clearTimeout(timeout); server?.close(); app.exit(1) })
