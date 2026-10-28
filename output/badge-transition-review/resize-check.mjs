import { app } from 'electron'
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const output = resolve('output/badge-transition-review')
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

let win
const errors = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const timeout = setTimeout(() => { console.error('Review timeout'); app.exit(2) }, 45000)
app.on('browser-window-created', (_event, created) => {
  if (win) return
  win = created
  win.setOpacity(0)
  win.setSkipTaskbar(true)
  win.show = () => win.showInactive()
  win.webContents.on('console-message', (event) => { if (event.level === 'error') errors.push(event.message) })
  win.webContents.on('render-process-gone', (_event, details) => { console.error(details); app.exit(3) })
  win.webContents.once('did-finish-load', () => run().then(() => { clearTimeout(timeout); app.exit(0) }).catch(async (error) => {
    await writeFile(join(output, 'resize-error.json'), JSON.stringify({ error: error.stack, errors }, null, 2))
    console.error(error)
    app.exit(1)
  }))
})

async function run() {
  const js = (code) => win.webContents.executeJavaScript(code)
  const until = async (code) => {
    for (let i = 0; i < 1000; i++) { if (await js(code)) return; await wait(10) }
    throw new Error('Timed out: ' + code)
  }
  const phase = (value) => `document.querySelector('.badge-inspector')?.dataset.inspectionPhase==='${value}'`
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
  const read = `(()=>{const stage=document.querySelector('.inspect-object'),r=stage.getBoundingClientRect();return {phase:document.querySelector('.badge-inspector').dataset.inspectionPhase,badge:document.querySelector('.badge-inspector').dataset.inspectionBadge,draws:window.__draws,rect:r.toJSON(),expectedLeft:(innerWidth-r.width)/2,expectedTop:(innerHeight-r.height)/2,viewport:{width:innerWidth,height:innerHeight},transform:stage.style.transform,opacity:getComputedStyle(stage).opacity}})()`
  const before = await js(read)
  await writeFile(join(output, 'resize-before.png'), (await win.webContents.capturePage()).toPNG())
  win.setContentSize(900, 620)
  await wait(250)
  const after = await js(read)
  await writeFile(join(output, 'resize-after.png'), (await win.webContents.capturePage()).toPNG())
  await js(`window.__pending.splice(0).forEach(fn=>fn());void 0`)
  await until(phase('inspecting'))
  const resolved = await js(read)
  const report = { profile, before, after, resolved, errors }
  await writeFile(join(output, 'resize-report.json'), JSON.stringify(report, null, 2))
  console.log(JSON.stringify(report))
}

await import(pathToFileURL(resolve('out/main/index.js')).href)
