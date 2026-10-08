import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writeFile } from 'node:fs/promises'
import { setTimeout as delay } from 'node:timers/promises'
import assert from 'node:assert/strict'
import type { PouchSnapshot } from './scene'

const root = dirname(fileURLToPath(import.meta.url))
const test = process.argv.includes('--test')
app.setPath('userData', join(root, test ? 'test-profile' : 'interactive-profile'))
app.setAppUserModelId('com.auralis.pouch-demo')
app.on('window-all-closed', () => app.quit())
let window: BrowserWindow | null = null
const primaryInstance = test || app.requestSingleInstanceLock()
if (!primaryInstance) app.quit()
app.on('second-instance', () => {
  if (!window) return
  if (window.isMinimized()) window.restore()
  window.show()
  window.focus()
})
void app
  .whenReady()
  .then(async () => {
    if (!primaryInstance) return
    const win = new BrowserWindow({
      title: 'Auralis · Pouch Demo',
      width: 1180,
      height: 850,
      minWidth: 800,
      minHeight: 700,
      show: !test,
      autoHideMenuBar: true,
      backgroundColor: '#ece8e2',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
        backgroundThrottling: !test,
      },
    })
    window = win
    win.on('closed', () => {
      window = null
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
    // Keep real OS mouse input away from the window while synthetic pointer
    // drags run. capturePage still renders the actual Electron scene.
    win.setPosition(-12000, -12000)
    win.showInactive()
    const js = (code: string) => win.webContents.executeJavaScript(code, true)
    const state = (): Promise<PouchSnapshot> => js('window.pouchDemoProbe.state()')
    const point = (name: string): Promise<{ x: number; y: number }> =>
      js(`window.pouchDemoProbe.project(${JSON.stringify(name)})`)
    async function wait(condition: string) {
      for (let i = 0; i < 160; i++) {
        if (await js(condition)) return
        await delay(50)
      }
      throw new Error(`Condition not reached: ${condition}`)
    }
    async function settled() {
      await wait('!window.pouchDemoProbe.state().pending')
    }
    async function shot(name: string, waitForIdle = true) {
      if (waitForIdle) await settled()
      await delay(120)
      await writeFile(join(root, name), (await win.webContents.capturePage()).toPNG())
    }
    async function click(selector: string) {
      const p = await js(
        `(() => {const el=document.querySelector(${JSON.stringify(selector)});el.scrollIntoView({block:'nearest',inline:'nearest'});const r=el.getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`,
      )
      win.webContents.sendInputEvent({ type: 'mouseDown', ...p, button: 'left', clickCount: 1 })
      win.webContents.sendInputEvent({ type: 'mouseUp', ...p, button: 'left', clickCount: 1 })
      await delay(80)
    }
    async function sample(value: 'blue' | 'morning' | 'long') {
      await js('document.querySelector("[data-action=sample]").focus()')
      const keys = [
        'Home',
        ...Array(value === 'long' ? 2 : value === 'morning' ? 1 : 0).fill('Down'),
      ]
      for (const keyCode of keys) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
        await delay(80)
      }
      assert.equal((await state()).cardSample, value, 'Native sample selector must update the card')
    }
    async function drag(
      from: { x: number; y: number },
      to: { x: number; y: number },
      release = true,
    ) {
      from = { x: Math.round(from.x), y: Math.round(from.y) }
      to = { x: Math.round(to.x), y: Math.round(to.y) }
      win.webContents.sendInputEvent({ type: 'mouseMove', ...from })
      win.webContents.sendInputEvent({ type: 'mouseDown', ...from, button: 'left', clickCount: 1 })
      for (let i = 1; i <= 18; i++) {
        win.webContents.sendInputEvent({
          type: 'mouseMove',
          x: Math.round(from.x + ((to.x - from.x) * i) / 18),
          y: Math.round(from.y + ((to.y - from.y) * i) / 18),
          button: 'left',
        })
        await delay(16)
      }
      if (release)
        win.webContents.sendInputEvent({ type: 'mouseUp', ...to, button: 'left', clickCount: 1 })
      await delay(80)
    }
    try {
      await wait('window.pouchDemoProbe?.state().frames > 0')
      await shot('sealed-holo.png')
      const body = await point('body')
      await drag(body, { x: body.x + 35, y: body.y + 20 })
      assert.equal((await state()).progress, 0, 'Dragging bag body must not tear the seal')
      const tip = await point('tip'),
        end = await point('end')
      await drag(tip, { x: (tip.x + end.x) / 2, y: tip.y - 28 })
      const half = await state()
      assert.ok(
        half.progress > 0.35 && half.progress < 0.7,
        'Actual tear drag must open half the seal',
      )
      assert.equal(half.dragging, false)
      await shot('half-torn.png')
      await delay(120)
      assert.equal((await state()).progress, half.progress, 'Release must preserve tear progress')
      const halfTip = await point('tip')
      await drag(halfTip, { x: halfTip.x + 45, y: halfTip.y })
      assert.equal((await state()).progress, half.progress, 'Reverse drag must not reseal the bag')
      const resume = await point('tip'),
        finish = await point('end')
      await drag(resume, { x: finish.x - 25, y: finish.y - 25 })
      assert.equal((await state()).opened, true)
      await settled()
      assert.equal((await state()).pouchGone, true, 'Opened packaging must fall away completely')
      await shot('opened.png')
      const exposedCard = await point('card')
      const cardPoint = { x: Math.round(exposedCard.x), y: Math.round(exposedCard.y) }
      win.webContents.sendInputEvent({
        type: 'mouseDown',
        ...cardPoint,
        button: 'left',
        clickCount: 1,
      })
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        ...cardPoint,
        button: 'left',
        clickCount: 1,
      })
      await delay(100)
      assert.equal((await state()).extracted, true, 'Clicking the exposed card must extract it')
      await click('[data-action=extract]')
      assert.equal((await state()).extracted, false, 'The card must return to its resting position')
      await settled()
      await click('[data-action=extract]')
      assert.equal((await state()).extracted, true)
      await shot('card-out.png')
      await shot('card-bands.png')
      const cardCenter = await point('card-center')
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: Math.round(cardCenter.x + 105),
        y: Math.round(cardCenter.y + 55),
      })
      await wait('Math.abs(window.pouchDemoProbe.state().cardTilt.y) > 0.1')
      await settled()
      assert.ok(Math.abs((await state()).cardTilt.y) > 0.1, 'Pointer must tilt the extracted card')
      await shot('card-bands-tilted.png')
      await click('[data-card-finish=glitter]')
      assert.equal((await state()).cardFinish, 'glitter')
      assert.equal((await state()).extracted, true, 'Changing finish must keep the card extracted')
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: Math.round(cardCenter.x + 105),
        y: Math.round(cardCenter.y + 55),
      })
      await shot('card-glitter.png')
      const stillCard = (await state()).frames
      await delay(400)
      assert.equal(
        (await state()).frames,
        stillCard,
        'Extracted foil card must stop drawing at rest',
      )
      await click('[data-card-finish=bands]')
      assert.equal((await state()).cardFinish, 'bands')
      await click('[data-action=flip-card]')
      assert.equal((await state()).cardBack, true)
      await shot('card-tracklist.png')
      await click('[data-action=flip-card]')
      assert.equal((await state()).cardBack, false)
      await sample('morning')
      await shot('card-light.png')
      await sample('long')
      await shot('card-long-title.png')
      await js('document.querySelector("[data-choice=play]").focus()')
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
      await delay(100)
      assert.equal((await state()).choice, 'play', 'Space must activate Play')
      assert.equal(await js('document.activeElement?.getAttribute("data-action")'), 'reset')
      assert.equal(await js('document.querySelector("[data-choice=discard]").disabled'), true)
      await sample('blue')
      assert.equal((await state()).choice, null)
      await click('[data-choice=discard]')
      assert.equal(
        (await state()).choice,
        'discard',
        'Discard must record a skip without deleting data',
      )
      await shot('card-discard.png', false)
      await delay(450)
      await shot('card-discard-pixels.png', false)
      await settled()
      assert.equal((await state()).discardProgress, 1, 'Discard must finish its pixel animation')
      const discardFrames = (await state()).frames
      await delay(200)
      assert.equal((await state()).frames, discardFrames, 'Completed discard must stop rendering')
      await shot('card-discard-complete.png')
      await click('[data-action=reset]')
      assert.equal((await state()).progress, 0)
      assert.equal((await state()).extracted, false)
      assert.equal((await state()).choice, null)
      assert.equal(
        (await state()).discardProgress,
        0,
        'Reset must cancel and restore discarded card',
      )
      await click('[data-action=turn]')
      await shot('back.png')
      await click('[data-action=turn]')
      await settled()
      const cancel = await point('tip')
      await drag(cancel, { x: cancel.x - 30, y: cancel.y - 10 }, false)
      assert.equal((await state()).dragging, true)
      win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
      win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
      await delay(80)
      assert.equal((await state()).dragging, false, 'Escape must release drag')
      win.webContents.sendInputEvent({
        type: 'mouseUp',
        x: Math.round(cancel.x - 30),
        y: Math.round(cancel.y - 10),
        button: 'left',
        clickCount: 1,
      })
      await click('[data-action=reset]')
      await js(
        'document.querySelector("details").open=true; document.querySelector("[data-action=tear]").focus()',
      )
      await delay(120)
      assert.equal(await js('document.activeElement?.getAttribute("data-action")'), 'tear')
      for (let i = 0; i < 4; i++) {
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Space' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Space' })
        await delay(100)
        assert.equal(
          (await state()).progress,
          (i + 1) / 4,
          'Space must activate the focused tear button',
        )
      }
      assert.equal((await state()).opened, true, 'Keyboard alternative must open the seal')
      await settled()
      const idle = (await state()).frames
      await delay(400)
      assert.equal((await state()).frames, idle, 'Idle scene must stop drawing')
      win.webContents.setBackgroundThrottling(true)
      win.hide()
      await wait('document.hidden')
      const hidden = (await state()).frames
      await delay(300)
      assert.equal((await state()).frames, hidden)
      win.showInactive()
      await wait('!document.hidden')
      win.webContents.setBackgroundThrottling(false)
      await settled()
      win.setSize(820, 720)
      await delay(150)
      await click('[data-action=reset]')
      await shot('compact.png')
      for (let i = 0; i < 4; i++) await click('[data-action=tear]')
      await click('[data-action=extract]')
      assert.equal((await state()).extracted, true)
      await shot('compact-card.png')
      assert.equal(await js('document.documentElement.scrollWidth <= innerWidth'), true)
      assert.deepEqual(errors, [])
      const final = await state()
      await js('window.pouchDemoProbe.dispose()')
      assert.equal((await state()).disposed, true)
      assert.equal(await js('document.querySelectorAll("canvas").length'), 0)
      await writeFile(
        join(root, 'verification.json'),
        JSON.stringify(
          {
            passed: true,
            cardFinishes: true,
            pointerCardTilt: true,
            cardLayoutSamples: true,
            cardTracklist: true,
            playDiscard: true,
            choiceKeyboardAndFocus: true,
            extractedIdleFrames: 0,
            mouseTear: true,
            partialResume: true,
            reverseDrag: true,
            bodyDoesNotTear: true,
            reset: true,
            keyboard: true,
            escape: true,
            idleFrames: 0,
            hiddenFrames: 0,
            released: true,
            errors,
            snapshot: final,
          },
          null,
          2,
        ),
      )
      console.log(
        'Pouch demo: card finishes, tilt, mouse tear, resume, extraction, reset, keyboard, idle, hidden and cleanup checks passed.',
      )
    } finally {
      window?.destroy()
      app.quit()
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
