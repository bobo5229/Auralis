import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import type { RadioState, SceneSnapshot } from './scene'

const root = dirname(fileURLToPath(import.meta.url))
const test = process.argv.includes('--test')
app.setPath('userData', join(root, 'isolated-profile'))
app.setAppUserModelId('com.auralis.radio-demo')
app.on('window-all-closed', () => app.quit())

void app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      title: 'Auralis · Radio Demo',
      width: 1220,
      height: 820,
      minWidth: 820,
      minHeight: 680,
      backgroundColor: '#e7e2da',
      show: !test,
      autoHideMenuBar: true,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: true,
      },
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    win.webContents.session.setPermissionRequestHandler((_contents, _permission, callback) =>
      callback(false),
    )
    const errors: string[] = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    win.webContents.on('render-process-gone', (_event, details) => {
      console.error(details)
      app.exit(1)
    })
    await win.loadFile(join(root, 'renderer/index.html'))
    if (!test) return
    win.showInactive()
    type Snapshot = RadioState & { ready: boolean; error: string; scene: SceneSnapshot }
    const js = (code: string) => win.webContents.executeJavaScript(code, true)
    const state = (): Promise<Snapshot> => js('window.radioDemoProbe.state()')
    const point = (name: string): Promise<{ x: number; y: number }> =>
      js(`window.radioDemoProbe.project(${JSON.stringify(name)})`)
    async function wait(condition: string) {
      for (let attempt = 0; attempt < 300; attempt++) {
        if (await js(condition)) return
        await delay(50)
      }
      throw new Error(`Demo condition not reached: ${condition}`)
    }
    async function screenshot(name: string) {
      await js(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      )
      await delay(200)
      await writeFile(join(root, name), (await win.webContents.capturePage()).toPNG())
    }
    async function click(x: number, y: number) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', x, y, button: 'left', clickCount: 1 })
      await delay(100)
    }
    async function drag(x: number, y: number, dx: number, dy: number) {
      win.webContents.sendInputEvent({ type: 'mouseMove', x, y })
      win.webContents.sendInputEvent({ type: 'mouseDown', x, y, button: 'left', clickCount: 1 })
      for (let i = 1; i <= 12; i++) {
        win.webContents.sendInputEvent({
          type: 'mouseMove',
          x: Math.round(x + (dx * i) / 12),
          y: Math.round(y + (dy * i) / 12),
          button: 'left',
        })
        await delay(12)
      }
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        x: x + dx,
        y: y + dy,
        button: 'left',
        clickCount: 1,
      })
      await delay(180)
    }
    async function selectView(name: string) {
      await js(`document.querySelector('[data-view="${name}"]').click()`)
      await delay(250)
    }
    try {
      await wait('window.radioDemoProbe?.state().ready || !!window.radioDemoProbe?.state().error')
      assert.equal((await state()).error, '')
      await wait('window.radioDemoProbe.state().scene.modelDrawn')
      await screenshot('home.png')
      await selectView('front')
      const power = await point('On_Off')
      await click(power.x, power.y)
      assert.equal((await state()).on, true, 'Physical power button must start preview')
      await wait(
        'window.radioDemoProbe.audio().contextState === "running" && window.radioDemoProbe.audio().rms > 0.001',
      )
      for (const [name, field] of [
        ['Knob_1_Front', 'volume'],
        ['Knob_2_Front', 'channel'],
        ['Knob_3_Front', 'bass'],
      ] as const) {
        const before = await state()
        const at = await point(name)
        await drag(at.x, at.y, 40, 0)
        const after = await state()
        assert.ok(after[field] > before[field], `${name} must change ${field}`)
        assert.ok(
          Math.abs(after.scene.azimuth - before.scene.azimuth) < 0.001,
          'Knob drag must not orbit camera',
        )
        assert.equal(after.scene.orbitEnabled, true)
      }
      for (let index = 0; index < 7; index++) {
        const preset = await point(`Tuner_Button_${index + 1}`)
        await click(preset.x, preset.y)
        assert.equal((await state()).channel, [88, 92, 94, 96, 102, 104, 107][index])
      }
      const antenna = await point('Antenna')
      const antennaBefore = (await state()).antenna
      await drag(antenna.x, antenna.y, 0, -35)
      assert.ok((await state()).antenna > antennaBefore, 'Antenna must respond to vertical drag')
      await screenshot('front-playing.png')
      const knob = await point('Knob_1_Front')
      win.webContents.sendInputEvent({
        type: 'mouseDown',
        x: knob.x,
        y: knob.y,
        button: 'left',
        clickCount: 1,
      })
      await wait('!window.radioDemoProbe.state().scene.orbitEnabled')
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await wait('window.radioDemoProbe.state().scene.orbitEnabled')
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        x: knob.x,
        y: knob.y,
        button: 'left',
        clickCount: 1,
      })
      for (const name of ['left', 'back', 'right', 'top']) {
        await selectView(name)
        const current = await state()
        assert.ok(current.scene.polar <= Math.PI / 2 + 0.00001)
        await screenshot(`${name}.png`)
      }
      await selectView('front')
      // Drag the unobstructed upper background, exercising real OrbitControls events.
      const rect = await js(
        '(() => { const r = document.querySelector("canvas").getBoundingClientRect(); return { x:r.x, y:r.y, width:r.width, height:r.height }; })()',
      )
      const orbitBefore = (await state()).scene.azimuth
      const zoomBefore = (await state()).scene.distance
      win.webContents.sendInputEvent({
        type: 'mouseWheel',
        x: Math.round(rect.x + 50),
        y: Math.round(rect.y + 130),
        deltaY: 120,
        deltaX: 0,
      })
      await delay(150)
      assert.ok((await state()).scene.distance < zoomBefore, 'Wheel must zoom toward the device')
      await drag(Math.round(rect.x + rect.width * 0.65), Math.round(rect.y + 100), 180, 0)
      assert.ok(Math.abs((await state()).scene.azimuth - orbitBefore) > 0.3)
      await drag(Math.round(rect.x + rect.width * 0.6), Math.round(rect.y + 100), 0, -240)
      assert.ok((await state()).scene.polar <= Math.PI / 2 + 0.00001)
      await js('document.querySelector("[data-control=volume]").focus()')
      const volumeBefore = (await state()).volume
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Right' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Right' })
      await delay(100)
      assert.ok((await state()).volume > volumeBefore, 'Keyboard alternative must update volume')
      await js('document.querySelector("[data-control=power]").click()')
      assert.equal((await state()).on, false)
      await js(
        'new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))',
      )
      await wait('!window.radioDemoProbe.state().scene.pendingFrame')
      const settled = await state()
      await delay(600)
      assert.equal(
        (await state()).scene.frames,
        settled.scene.frames,
        'Static scene must stop rendering',
      )
      win.setSize(840, 700)
      await delay(200)
      await screenshot('compact.png')
      assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true)
      await selectView('home')
      await screenshot('compact.png')
      win.minimize()
      await wait('document.hidden')
      const hiddenFrames = (await state()).scene.frames
      await delay(350)
      assert.equal((await state()).scene.frames, hiddenFrames, 'Hidden window must stop rendering')
      win.restore()
      await wait('!document.hidden')
      await wait(`window.radioDemoProbe.state().scene.frames > ${hiddenFrames}`)
      assert.deepEqual(errors, [])
      assert.equal(await js('window.radioDemoProbe.audio().contextState'), 'suspended')
      const gpu = await app.getGPUInfo('basic')
      await js('window.radioDemoProbe.suspend()')
      assert.equal(await js('document.querySelectorAll("canvas").length'), 0)
      assert.equal((await state()).scene.ready, false)
      await writeFile(
        join(root, 'verification.json'),
        JSON.stringify(
          {
            passed: true,
            physicalControls: ['power', 'volume', 'channel', 'bass', 'preset', 'antenna'],
            views: ['front', 'left', 'back', 'right', 'top'],
            orbitGesture: true,
            bottomRestricted: true,
            keyboard: true,
            cancelDrag: true,
            zoom: true,
            hiddenFrames: 0,
            released: true,
            idleFrames: 0,
            errors,
            snapshot: settled,
            gpu,
          },
          null,
          2,
        ),
      )
      console.log(
        'Radio demo: model, controls, views, keyboard, idle rendering and layout checks passed.',
      )
    } finally {
      win.destroy()
      app.quit()
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
