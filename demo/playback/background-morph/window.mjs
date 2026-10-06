import { app, BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath } from 'node:url'

const directory = fileURLToPath(new URL('.', import.meta.url))

const verify = process.argv.includes('--verify')
const workspace = path.resolve(directory, '../../..')
// The prototype never opens the app's profile, database, preload or IPC.
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-background-morph-'))
app.setPath('userData', profile)
const artifacts = path.join(workspace, '.electron-home', 'background-morph-check')
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const assert = (condition, message) => {
  if (!condition) throw new Error(message)
}
let win

app.whenReady().then(async () => {
  win = new BrowserWindow({
    title: 'Auralis · 背景材质演化',
    width: 1440,
    height: 960,
    minWidth: 800,
    minHeight: 620,
    backgroundColor: '#17191d',
    autoHideMenuBar: true,
    show: !verify,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: !verify,
      offscreen: verify,
    },
  })
  await win.loadURL(process.env.AURALIS_MORPH_DEMO_URL)
  if (verify) {
    try {
      await check()
      app.exit(0)
    } catch (error) {
      console.error(error)
      app.exit(1)
    }
  } else {
    for (let i = 0; i < 120 && !win.isDestroyed(); i++) {
      if (await win.webContents.executeJavaScript('window.morphDemo?.ready===true')) {
        console.log('MORPH_DEMO_READY')
        break
      }
      await wait(100)
    }
  }
})
app.on('window-all-closed', () => app.quit())
app.on('before-quit', () => win?.destroy())

async function check() {
  fs.mkdirSync(artifacts, { recursive: true })
  const errors = []
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
  const run = (code) =>
    win.webContents.executeJavaScript(code).catch((error) => {
      throw new Error(`${error.message}\nWhile evaluating: ${code}\nConsole: ${errors.join('; ')}`)
    })
  for (let i = 0; i < 160; i++) {
    if (await run('window.morphDemo?.ready===true')) break
    const error = await run(
      'document.querySelector("#error").hidden ? null : document.querySelector("#error").textContent',
    )
    if (error) throw new Error(error)
    await wait(100)
  }
  assert(await run('window.morphDemo?.ready===true'), 'Demo did not become ready')
  await run('document.fonts.ready.then(()=>true)')
  await wait(800)
  await run('window.morphDemo.setFrozen(true)')
  await wait(100)
  const geometry = await run(
    'JSON.stringify([...document.querySelectorAll("#artwork,.lyrics-column")].map(element=>element.getBoundingClientRect().toJSON()))',
  )
  const stages = []
  for (const phase of [0, 0.25, 0.5, 0.75, 1]) {
    await run(`window.morphDemo.setPhase(${phase})`)
    await wait(100)
    const diagnostics = await run('window.morphDemo.diagnostics()')
    assert(diagnostics.glError === 0, 'WebGL error')
    assert(
      diagnostics.pixelMean > 15 && diagnostics.pixelMax - diagnostics.pixelMin > 20,
      `Black or empty frame at ${phase}`,
    )
    assert(
      (await run(
        'JSON.stringify([...document.querySelectorAll("#artwork,.lyrics-column")].map(element=>element.getBoundingClientRect().toJSON()))',
      )) === geometry,
      'Foreground layout moved',
    )
    fs.writeFileSync(
      path.join(artifacts, `phase-${Math.round(phase * 100)}.png`),
      (await win.webContents.capturePage()).toPNG(),
    )
    stages.push(diagnostics)
  }
  const endpointDifference = await run('window.morphDemo.verifyMetalEndpoint()')
  assert(
    endpointDifference <= 1,
    `Metal endpoint differs from production shader: ${endpointDifference}`,
  )
  await run(`document.querySelector('[data-mode="0"]').click()`)
  await wait(300)
  const reverse = await run('window.morphDemo.diagnostics()')
  assert(
    reverse.transitioning && reverse.phase > 0 && reverse.phase < 1,
    'Reverse transition did not progress',
  )
  await run(`document.querySelector('[data-mode="1"]').click()`)
  await wait(1200)
  assert(
    await run('window.morphDemo.diagnostics().phase===1'),
    'Interrupted transition failed to reach target',
  )
  await run(
    'document.querySelector("#phase").value="0.35";document.querySelector("#phase").dispatchEvent(new Event("input",{bubbles:true}))',
  )
  await wait(100)
  assert(await run('window.morphDemo.diagnostics().phase===0.35'), 'Scrubber input failed')
  const paletteChecks = []
  for (const key of ['tide', 'ember']) {
    await run(`window.morphDemo.setSample('${key}').then(()=>true)`)
    await wait(500)
    paletteChecks.push(await run('window.morphDemo.diagnostics()'))
    assert(
      await run(
        'document.querySelector("#artwork").complete && document.querySelector("#artwork").naturalWidth>0',
      ),
      'Sample image failed to load',
    )
  }
  await run(
    `document.querySelector('#duration').value='0.4';document.querySelector('#duration').dispatchEvent(new Event('input',{bubbles:true}));document.querySelector('#slow').click();window.morphDemo.setPhase(0);document.querySelector('[data-mode="1"]').click()`,
  )
  await wait(650)
  assert(
    await run('window.morphDemo.diagnostics().transitioning'),
    'Slow playback did not lengthen transition',
  )
  await wait(750)
  assert(await run('window.morphDemo.diagnostics().phase===1'), 'Slow playback did not complete')
  await run('document.querySelector("#slow").click();document.querySelector("#cycle").click()')
  await wait(2750)
  assert(
    await run(
      'document.querySelector("#cycle").getAttribute("aria-pressed")==="true" && window.morphDemo.diagnostics().target===1',
    ),
    'Round-trip cycle failed',
  )
  await run(
    'document.querySelector("#cycle").click();window.morphDemo.setPhase(0);window.morphDemo.setFrozen(false);window.morphDemo.goTo(1)',
  )
  await wait(1000)
  const performance = await run('window.morphDemo.diagnostics()')
  await win.webContents.debugger.attach('1.3')
  await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
    features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
  })
  await wait(100)
  await run(`document.querySelector('[data-mode="0"]').click()`)
  await wait(100)
  assert(
    await run(
      'window.morphDemo.diagnostics().phase===0 && !window.morphDemo.diagnostics().transitioning && document.querySelector("#cycle").disabled',
    ),
    'Reduced-motion mode did not switch directly',
  )
  win.webContents.debugger.detach()
  assert(errors.length === 0, `Renderer console errors: ${errors.join('; ')}`)
  const result = { stages, endpointDifference, reverse, paletteChecks, performance }
  fs.writeFileSync(path.join(artifacts, 'result.json'), JSON.stringify(result, null, 2))
  console.log('MORPH_DEMO_CHECK_OK ' + JSON.stringify(result))
}
