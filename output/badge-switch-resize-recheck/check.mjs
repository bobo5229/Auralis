import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = resolve('output/badge-switch-resize-recheck')
mkdirSync(output, { recursive: true })
const profile = mkdtempSync(join(output, 'profile-'))
mkdirSync(join(profile, 'data'))
mkdirSync(join(profile, 'cache'))
writeFileSync(join(profile, 'data', 'auralis.sqlite'), '')
const setPath = app.setPath.bind(app)
app.setPath = (name, value) => setPath(name, name === 'userData' ? profile : name === 'cache' ? join(profile, 'cache') : value)
const appendSwitch = app.commandLine.appendSwitch.bind(app.commandLine)
app.commandLine.appendSwitch = (name, value) => appendSwitch(name, name === 'disk-cache-dir' ? join(profile, 'cache') : value)
app.getAppPath = () => resolve('.')
app.setPath('userData', profile)
app.setPath('cache', join(profile, 'cache'))
delete process.env.AURALIS_SMOKE_TEST
delete process.env.ELECTRON_RENDERER_URL
process.env.AURALIS_QUIET_GPU_LOGS = '1'
const sources = ['src/renderer/features/archive/composables/useBadgeInspection.ts', 'src/renderer/features/archive/composables/useBadgeInspection.test.ts']
const sourceSha256 = Object.fromEntries(sources.map(path => [path, createHash('sha256').update(readFileSync(path)).digest('hex')]))

let win
const errors = [], checks = [], samples = {}
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const timeout = setTimeout(() => { console.error('Recheck timeout'); app.exit(2) }, 45000)
app.on('browser-window-created', (_event, created) => {
  if (win) return
  win = created
  win.setOpacity(0)
  win.setSkipTaskbar(true)
  win.show = () => win.showInactive()
  win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message) })
  win.webContents.on('render-process-gone', (_event, details) => { console.error(details); app.exit(3) })
  win.webContents.once('did-finish-load', () => run().then(() => finish()).catch(finish))
})

async function finish(error) {
  clearTimeout(timeout)
  const report = { passed: !error, profile, baseCommit: '66ce572a051ccea6eeff3ab38cc41a9a4c3386f1', sourceSha256, checks, samples, errors, error: error?.stack }
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2))
  if (error) console.error(error)
  app.exit(error ? 1 : 0)
}

async function run() {
  const js = (code) => win.webContents.executeJavaScript(code)
  const until = async (code) => {
    for (let i = 0; i < 1000; i++) { if (await js(code)) return; await wait(10) }
    throw new Error('Timed out: ' + code)
  }
  const phase = (value) => `document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${value}'`
  const capture = async (name) => writeFile(join(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
  const assert = (name, pass) => { checks.push({ name, pass }); if (!pass) throw new Error(name) }
  const centered = (sample) => Math.abs(sample.rect.left - sample.expectedLeft) < 0.1 && Math.abs(sample.rect.top - sample.expectedTop) < 0.1 && sample.rect.left >= 0 && sample.rect.top >= 0 && sample.rect.right <= sample.viewport.width && sample.rect.bottom <= sample.viewport.height
  const read = `(()=>{const stage=document.querySelector('.inspect-object'),r=stage.getBoundingClientRect(),c=stage.querySelector('canvas');return {phase:document.querySelector('.badge-inspector').dataset.inspectionPhase,badge:document.querySelector('.badge-inspector').dataset.inspectionBadge,draws:window.__draws,rect:r.toJSON(),expectedLeft:(innerWidth-r.width)/2,expectedTop:(innerHeight-r.height)/2,viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},canvas:{width:c.width,height:c.height},transform:stage.style.transform,opacity:getComputedStyle(stage).opacity}})()`
  const sample = async (key) => (samples[key] = await js(read))
  win.setContentSize(1440, 900)
  await until(`!!document.querySelector('[data-app-shell-root]')&&!document.getElementById('splash')`)
  const info = await js('window.auralis.app.getInfo()')
  if (info.databasePath !== join(profile, 'data', 'auralis.sqlite')) throw new Error('Isolation mismatch')
  await js(`location.hash='#/archive'`)
  await until(`!!document.querySelector('[data-milestone-gallery-trigger]')`)
  await js(`document.querySelector('[data-milestone-gallery-trigger]').click()`)
  await until(`document.querySelector('.archive-badge-gallery')?.classList.contains('is-ready')`)
  await js(`window.__draws=0;const original=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(...args){const gl=original.apply(this,args);if(this.classList.contains('inspect-canvas')&&args[0]==='webgl2'&&gl&&!gl.__review){gl.__review=true;for(const name of ['drawElements','drawArrays']){const call=gl[name];gl[name]=function(...a){window.__draws++;return call.apply(this,a)}}}return gl};document.querySelector('[data-badge="hours100"]').click()`)
  await until(phase('inspecting'))
  await wait(100)
  await js(`window.__pending=[];window.__src=Object.getOwnPropertyDescriptor(HTMLImageElement.prototype,'src');Object.defineProperty(HTMLImageElement.prototype,'src',{...window.__src,set(value){if(/lit-(base|material|normal|ao|finish)-/.test(value))window.__pending.push(()=>window.__src.set.call(this,value));else window.__src.set.call(this,value)}});document.querySelector('.inspect-switch--next').click()`)
  await until(`window.__pending.length===5`)
  const before = await sample('before')
  await capture('before-resize')
  win.setContentSize(900, 620)
  await wait(250)
  const after = await sample('afterResize')
  assert('Waiting badge recenters and remains fully within 900x620', centered(after))
  assert('Resize redraws the held badge without advancing the pending switch', after.draws > before.draws && after.phase === 'switch-loading' && after.badge === 'hours100')
  await capture('after-resize')
  await wait(350)
  const idle = await sample('idleAfterResize')
  assert('Waiting does not create a continuous render clock', idle.draws === after.draws && idle.phase === 'switch-loading')
  win.webContents.setZoomFactor(1.25)
  await wait(250)
  const zoomed = await sample('zoomed')
  assert('Actual DPR and canvas size changes still retain the centered current badge', centered(zoomed) && zoomed.canvas.width !== after.canvas.width && zoomed.viewport.dpr !== after.viewport.dpr && zoomed.draws > idle.draws && zoomed.phase === 'switch-loading' && zoomed.badge === 'hours100')
  await capture('zoomed-canvas')
  await wait(350)
  const zoomIdle = await sample('idleAfterZoom')
  assert('Canvas size refresh also stops drawing when idle', zoomIdle.draws === zoomed.draws)
  win.webContents.setZoomFactor(1)
  await wait(200)
  await js(`window.__pending.splice(0).forEach(fn=>fn());void 0`)
  await until(phase('inspecting'))
  const resolved = await sample('resolved')
  assert('Prepared target switches normally after the resize', resolved.badge === 'hours500' && centered(resolved))
  await js(`document.querySelector('.inspect-switch--next').click()`)
  await until(`window.__pending.length===5`)
  await js(`document.querySelector('.inspect-close').click()`)
  await until(phase('closed'))
  await js(`window.__pending.splice(0).forEach(fn=>fn());void 0`)
  await wait(200)
  const cancelled = await sample('cancelled')
  assert('Cancel exits and late target resources do not restart inspection', cancelled.phase === 'closed' && cancelled.badge == null && await js(`document.activeElement.dataset.badge==='hours500'`))
  assert('No renderer errors', errors.length === 0)
  await js(`document.querySelector('.case-close').click()`)
  await until(`!document.querySelector('.archive-badge-dialog')`)
}

await import(pathToFileURL(resolve('out/main/index.js')).href)
