import { app, BrowserWindow } from 'electron'
import * as fs from 'node:fs/promises'
import { mkdtempSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { previewFingerprint } from './fingerprint.mjs'
const directory = fileURLToPath(new URL('./', import.meta.url))
app.setPath('userData', mkdtempSync(path.join(os.tmpdir(), 'auralis-badges-')))
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
const root = path.resolve(directory, '../..')
const run = `run-${Date.now()}`
const output = path.resolve(
  root,
  process.env.BADGE_CHECK_OUTPUT || `output/badge-glsl-validation/${run}`,
)
const timeout = setTimeout(() => {
  console.error('Badge rendering timed out')
  app.exit(1)
}, 90000)
let win, server
const errors = [],
  checks = []
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const js = (source) => win.webContents.executeJavaScript(source)
const poll = async (source) => {
  for (let i = 0; i < 160; i++) {
    if (await js(source)) return
    await wait(25)
  }
  throw new Error(`Timed out: ${source}`)
}
const assert = (name, pass) => {
  checks.push({ name, pass: !!pass })
  if (!pass) throw new Error(name)
}
;(async () => {
  await fs.mkdir(output, { recursive: true })
  const phase = (value) =>
    fs.writeFile(path.join(output, 'phase.json'), JSON.stringify({ phase: value }))
  await phase('Electron ready')
  await app.whenReady()
  const serving = await import(pathToFileURL(path.join(directory, 'serve.mjs')).href)
  const instance = await serving.startServer(0)
  server = instance.server
  win = new BrowserWindow({
    show: false,
    width: 1440,
    height: 1080,
    useContentSize: true,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  })
  win.webContents.setFrameRate(60)
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3) errors.push(message)
  })
  win.webContents.on('render-process-gone', (_event, detail) => {
    console.error(detail)
    app.exit(2)
  })
  await win.loadURL(instance.url)
  await poll('window.badgeWorkbench && !badgeWorkbench.snapshot().loading')
  assert('WebGL initializes', await js('!badgeWorkbench.snapshot().failed'))
  const entries = await js('badgeWorkbench.entries')
  const materialManifest = JSON.parse(
    await fs.readFile(path.join(serving.materialDirectory, 'manifest.json'), 'utf8'),
  )
  const previewManifest = { version: 1, fingerprints: {} }
  const previewDirectory = path.join(serving.materialDirectory, 'previews')
  await fs.mkdir(previewDirectory, { recursive: true })
  for (const entry of entries)
    previewManifest.fingerprints[entry.id] = await previewFingerprint(
      materialManifest.badges[entry.id],
      serving.materialDirectory,
    )
  for (const entry of entries)
    for (const state of ['lit', 'unlit']) {
      await phase(`${entry.id}/${state}`)
      assert(
        `load ${entry.id}/${state}`,
        await js(`badgeWorkbench.select(${JSON.stringify(entry.id)},${JSON.stringify(state)})`),
      )
      await poll('!badgeWorkbench.snapshot().running && !badgeWorkbench.snapshot().loading')
      const snapshot = await js('badgeWorkbench.snapshot()')
      assert(
        `ready ${entry.id}/${state}`,
        !snapshot.failed &&
          snapshot.textures === 5 &&
          snapshot.badgeId === entry.id &&
          snapshot.state === state,
      )
      const data = await js('badgeWorkbench.capture()')
      await fs.writeFile(
        path.join(previewDirectory, `${entry.id}-${state}.png`),
        Buffer.from(data.split(',')[1], 'base64'),
      )
      const poses = []
      for (const [x, y] of [
        [-8, 0],
        [8, 0],
        [0, -8],
        [0, 8],
      ]) {
        // Real DOM keyboard path is checked below; rendering every material at each pose catches shader failures.
        await js(
          `document.querySelector('#stage').dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(y < 0 ? 'ArrowLeft' : y > 0 ? 'ArrowRight' : x < 0 ? 'ArrowDown' : 'ArrowUp')},bubbles:true,cancelable:true}))`,
        )
        await poll('!badgeWorkbench.snapshot().running')
        poses.push(await js('badgeWorkbench.snapshot().pose'))
        await js(`document.querySelector('#reset').click()`)
        await poll('!badgeWorkbench.snapshot().running')
      }
      assert(
        `four tilt directions ${entry.id}/${state}`,
        poses.every((pose) => Math.abs(pose.x) + Math.abs(pose.y) > 1),
      )
      console.log(`Rendered ${entry.id}/${state}`)
    }
  await js(`badgeWorkbench.select(${JSON.stringify(entries[0].id)},'lit')`)
  await poll('!badgeWorkbench.snapshot().running')
  const frames = await js('badgeWorkbench.snapshot().frames')
  await wait(200)
  assert('idle stops drawing', frames === (await js('badgeWorkbench.snapshot().frames')))
  await js(`document.querySelector('#stage').focus()`)
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
  await poll('badgeWorkbench.snapshot().target.targetY>0')
  await poll('!badgeWorkbench.snapshot().running')
  assert('native keyboard changes pose', await js('badgeWorkbench.snapshot().pose.y>0'))
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Home' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Home' })
  await poll('badgeWorkbench.snapshot().target.targetY===0 && !badgeWorkbench.snapshot().running')
  win.webContents.debugger.attach('1.3')
  for (const dpr of [1, 1.25, 2]) {
    await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
      width: 1280,
      height: 960,
      deviceScaleFactor: dpr,
      mobile: false,
    })
    await poll(`Math.abs(badgeWorkbench.snapshot().dpr-${dpr})<0.01`)
    assert(`DPR ${dpr}`, true)
  }
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await js(
    `document.querySelector('#stage').dispatchEvent(new PointerEvent('pointermove',{clientX:1200,clientY:250,bubbles:true,pointerType:'mouse'}))`,
  )
  await wait(60)
  assert(
    'reduced motion ignores hover',
    await js(
      'badgeWorkbench.snapshot().target.targetX===0&&badgeWorkbench.snapshot().target.targetY===0',
    ),
  )
  await js('badgeWorkbench.forceContextLoss()')
  await poll('badgeWorkbench.snapshot().failed')
  assert('context loss uses static fallback', await js('document.querySelector("#live").hidden'))
  assert('no shader or renderer errors', errors.length === 0)
  await fs.writeFile(
    path.join(previewDirectory, 'manifest.json'),
    JSON.stringify(previewManifest, null, 2) + '\n',
  )
  const gpu = await app.getGPUInfo('basic')
  const report = {
    passed: true,
    entries: entries.map((entry) => entry.id),
    states: entries.length * 2,
    checks,
    errors,
    gpu,
    features: app.getGPUFeatureStatus(),
    output,
  }
  await fs.writeFile(path.join(output, 'report.json'), JSON.stringify(report, null, 2))
  await fs.mkdir(path.join(root, 'output/badge-glsl-validation'), { recursive: true })
  await fs.writeFile(
    path.join(root, 'output/badge-glsl-validation/latest.json'),
    JSON.stringify({ output }, null, 2),
  )
  // Contact sheet comes from the rendered GLSL PNGs, displayed by the browser.
  await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride', {
    width: 1440,
    height: 1080,
    deviceScaleFactor: 1,
    mobile: false,
  })
  const cards = entries
    .flatMap((entry) =>
      ['lit', 'unlit'].map(
        (state) =>
          `<figure><img src="${instance.url}materials/previews/${entry.id}-${state}.png"><figcaption>${entry.name} · ${state === 'lit' ? '点亮' : '未点亮'}</figcaption></figure>`,
      ),
    )
    .join('')
  await win.loadURL(
    'data:text/html;charset=utf-8,' +
      encodeURIComponent(
        `<style>body{margin:20px;background:#13171d;color:#d5dce5;font:14px system-ui}h1{font-size:20px}main{display:grid;grid-template-columns:repeat(8,1fr);gap:8px}figure{margin:0;background:#1d222a;border-radius:8px;text-align:center;padding:8px}img{width:100%;height:210px;object-fit:contain}figcaption{padding:4px}</style><h1>Auralis · 全部徽章 GLSL 材质 / 两种状态</h1><main>${cards}</main>`,
      ),
  )
  await poll('[...document.images].every(image=>image.complete&&image.naturalWidth>0)')
  await fs.writeFile(
    path.join(output, 'all-badges.png'),
    (await win.webContents.capturePage()).toPNG(),
  )
  console.log(
    JSON.stringify({ passed: true, states: entries.length * 2, checks: checks.length, output }),
  )
  clearTimeout(timeout)
  win.destroy()
  server.close()
  app.exit(0)
})().catch(async (error) => {
  console.error(error)
  try {
    await fs.writeFile(
      path.join(output, 'failure.json'),
      JSON.stringify({ error: String(error), checks, errors }, null, 2),
    )
  } catch {}
  clearTimeout(timeout)
  server?.close()
  app.exit(1)
})
