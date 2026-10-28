// Run with the repository's Electron binary while serve.mjs is running.
import { app, BrowserWindow } from 'electron'
import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const output = resolve('output/lyric-emphasis-demo')
await mkdir(resolve(output, 'isolated-profile'), { recursive: true })
app.setPath('userData', resolve(output, 'isolated-profile'))
app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required')
const delay = (ms) => new Promise((done) => setTimeout(done, ms))
const report = { checks: [], errors: [] }
let win
const js = (code) => win.webContents.executeJavaScript(code)
function assert(value, message) {
  if (!value) throw Error(message)
  report.checks.push(message)
}
async function click(selector) {
  await js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  await delay(50)
}
async function seek(time) {
  await js(`emphasisDemo.audio.pause();emphasisDemo.seek(${time})`)
  await delay(100)
}
async function capture(name) {
  await delay(250)
  await writeFile(resolve(output, name + '.png'), (await win.webContents.capturePage()).toPNG())
}
async function assertControlsVisible(label) {
  const visible = await js(
    `(()=>{const preview=document.querySelector('.preview-button').getBoundingClientRect();const player=document.querySelector('.player').getBoundingClientRect();return preview.bottom < player.top && preview.left >= 0 && preview.right <= innerWidth})()`,
  )
  assert(visible, label)
}
async function importLrc(text) {
  await js(
    `{const input=document.querySelector('input[accept^=".lrc"]');const transfer=new DataTransfer();transfer.items.add(new File([${JSON.stringify(text)}],'test.lrc',{type:'text/plain'}));input.files=transfer.files;input.dispatchEvent(new Event('change',{bubbles:true}));}`,
  )
  await delay(200)
}
function unit(part) {
  return `[data-unit="${part}"]`
}
const transform = (key) =>
  js(`getComputedStyle(document.querySelector('${unit(key)} .unit-text')).transform`)

app.whenReady().then(async () => {
  try {
    win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        offscreen: true,
        sandbox: true,
        contextIsolation: true,
        backgroundThrottling: false,
      },
    })
    win.webContents.setFrameRate(60)
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') report.errors.push(event.message)
    })
    await win.loadURL('http://127.0.0.1:4196/demo/lyrics/emphasis/')
    await js('document.fonts.ready')
    for (let i = 0; i < 40 && !(await js('Boolean(window.emphasisDemo?.audio.duration)')); i++)
      await delay(100)
    assert(await js('emphasisDemo.audio.duration === 32'), '32-second real media fixture loaded')
    await js('localStorage.clear()')
    await win.reload()
    await delay(700)
    await js('document.fonts.ready')
    await click('.edit-button')
    assert(await js('emphasisDemo.getState().editing'), 'Edit mode entered through real control')
    await seek(4.8)
    await capture('enhanced-editor')
    await assertControlsVisible('Desktop line preview is visible above the player')
    assert(
      (await transform('0:3')) !== 'matrix(1, 0, 0, 1, 0, 0)',
      'Selected sustained segment scales and rises',
    )
    assert(
      (await transform('0:2')) === 'matrix(1, 0, 0, 1, 0, 0)',
      'Unselected segment keeps its geometry',
    )
    assert(
      await js(
        'document.querySelectorAll(\'[data-unit="0:2"]\').length===1 && document.querySelector(\'[data-unit="0:2"]\').textContent.trim()==="安静的"',
      ),
      'Multi-character timing segment remains one selection unit',
    )
    const before = await js('emphasisDemo.getState().time')
    await click(unit('0:2'))
    assert(
      await js('emphasisDemo.getState().selected.includes("0:2")'),
      'Click selects an additional noncontiguous segment',
    )
    assert(
      (await js('emphasisDemo.getState().time')) === before,
      'Editing selection does not seek playback',
    )
    await click('[aria-label="撤销上次选择"]')
    assert(
      !(await js('emphasisDemo.getState().selected.includes("0:2")')),
      'Undo restores previous markers',
    )
    await click('.effect-switch input')
    assert(
      (await transform('0:3')) === 'matrix(1, 0, 0, 1, 0, 0)',
      'Effect comparison switch removes emphasis',
    )
    await click('.effect-switch input')
    const pausedStyle = await transform('0:3')
    await delay(150)
    assert(
      (await transform('0:3')) === pausedStyle,
      'Paused animation stays at its media-time pose',
    )
    await seek(3.8)
    assert(
      (await transform('0:3')) === 'matrix(1, 0, 0, 1, 0, 0)',
      'Backward seek recomputes the emphasis pose',
    )
    await seek(4.8)
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await delay(80)
    assert(
      (await transform('0:3')) === 'matrix(1, 0, 0, 1, 0, 0)',
      'System reduced-motion setting suppresses emphasis transforms',
    )
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', { features: [] })
    win.webContents.debugger.detach()
    await delay(80)
    await click('[aria-label="切换深浅主题"]')
    await capture('enhanced-light')
    await click('[aria-label="切换深浅主题"]')

    // Route decoded audio through a silent output gain so verification does not play sound in the user's room.
    await js(
      `window.demoAudioContext=new AudioContext();window.demoAudioSource=demoAudioContext.createMediaElementSource(emphasisDemo.audio);window.demoAnalyser=demoAudioContext.createAnalyser();const quiet=demoAudioContext.createGain();quiet.gain.value=0;demoAudioSource.connect(demoAnalyser);demoAnalyser.connect(quiet).connect(demoAudioContext.destination);demoAudioContext.resume()`,
    )
    await click('.play-button')
    await delay(400)
    const media = await js(
      `(()=>{const bytes=new Float32Array(demoAnalyser.fftSize);demoAnalyser.getFloatTimeDomainData(bytes);return {time:emphasisDemo.audio.currentTime,rms:Math.sqrt(bytes.reduce((sum,n)=>sum+n*n,0)/bytes.length),playing:emphasisDemo.getState().playing}})()`,
    )
    report.audio = media
    assert(
      media.playing && media.time > 4.9 && media.rms > 0.0001,
      'Real audio decodes to a nonzero signal and advances the playback clock',
    )
    await click('.play-button')
    await click('[data-row="2"] .row-time')
    await click('.preview-button')
    const preview = await js('emphasisDemo.getState()')
    assert(
      preview.previewing && preview.playing && preview.time >= 11.19 && preview.time < 12,
      'Preview starts shortly before the focused line',
    )
    await js('emphasisDemo.audio.currentTime=18.05')
    await delay(180)
    assert(
      await js(
        '!emphasisDemo.getState().playing && !emphasisDemo.getState().previewing && emphasisDemo.audio.currentTime < 18',
      ),
      'Line preview stops at the next line',
    )
    await click(unit('2:0'))
    await click('.edit-button')
    await win.reload()
    await delay(650)
    assert(
      await js('emphasisDemo.getState().selected.includes("2:0")'),
      'Local markers survive reload',
    )
    await click(unit('1:1'))
    assert(
      await js('Math.abs(emphasisDemo.audio.currentTime - 7) < .01'),
      'Listening-mode segment click still seeks the whole line',
    )
    await click('.edit-button')
    await js('document.querySelector(".edit-button").focus()')
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await delay(80)
    assert(
      !(await js('emphasisDemo.getState().editing')),
      'Escape exits editing while a button has focus',
    )
    await click('.sample-switch button:last-child')
    await click('.edit-button')
    await seek(12.7)
    assert(
      await js('document.querySelectorAll(".lyric-unit").length===5'),
      'Ordinary LRC exposes one selection target per line',
    )
    assert(
      (await transform('2:line')) !== 'matrix(1, 0, 0, 1, 0, 0)',
      'Ordinary selected line receives the same emphasis effect',
    )
    await capture('ordinary-editor')
    await seek(13.6)
    assert(
      (await transform('2:line')) === 'matrix(1, 0, 0, 1, 0, 0)',
      'Unknown end uses a fixed 1.5-second envelope',
    )
    await click('[aria-label="进入聆听预览"]')
    await seek(12.7)
    await capture('listening-preview')
    await assertControlsVisible('Listening preview keeps the preview action above the player')
    await click('[aria-label="退出聆听预览"]')

    await click('.sample-switch button:first-child')
    await seek(13.7)
    win.setSize(800, 850)
    await capture('compact-editor')
    await assertControlsVisible('Compact desktop preview action is not covered by the player')
    assert(
      await js('document.documentElement.scrollWidth <= innerWidth'),
      '800px workspace has no horizontal overflow',
    )
    win.setSize(390, 844)
    await delay(200)
    await js('scrollTo(0,0)')
    await capture('mobile-editor')
    await assertControlsVisible('390px line preview remains visible above the player')
    assert(
      await js(
        'document.querySelector(".selection-inspector").getBoundingClientRect().bottom < document.querySelector(".player").getBoundingClientRect().top',
      ),
      '390px selection information is visible in the first viewport',
    )
    assert(
      await js('document.documentElement.scrollWidth <= innerWidth'),
      '390px workspace has no horizontal overflow',
    )
    await click('.edit-button')
    await seek(4.8)
    await delay(450)
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setTouchEmulationEnabled', {
      enabled: true,
    })
    const area = await js(
      '(()=>{const r=document.querySelector(".lyric-viewport").getBoundingClientRect();return {x:r.left+r.width*.7,top:r.top,bottom:r.bottom}})()',
    )
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [{ x: area.x, y: area.bottom - 35 }],
    })
    for (let step = 1; step <= 6; step++) {
      await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {
        type: 'touchMove',
        touchPoints: [{ x: area.x, y: area.bottom - 35 - step * 20 }],
      })
      await delay(30)
    }
    await win.webContents.debugger.sendCommand('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    })
    await delay(450)
    assert(
      await js('Boolean(document.querySelector(".follow-button"))'),
      'Actual touch scrolling suspends auto-follow',
    )
    const touchScroll = await js('document.querySelector(".lyric-viewport").scrollTop')
    await seek(25.9)
    await delay(450)
    assert(
      Math.abs((await js('document.querySelector(".lyric-viewport").scrollTop')) - touchScroll) < 2,
      'Line changes preserve the user touch-scroll position',
    )
    await click('.follow-button')
    await delay(450)
    assert(
      !(await js('Boolean(document.querySelector(".follow-button"))')),
      'Return-to-current-line restores auto-follow after touch scrolling',
    )
    win.webContents.debugger.detach()
    await click('.edit-button')
    await capture('mobile-touch-restored')
    win.setSize(1280, 900)

    await importLrc('[00:00]短行\n[00:00.500]<00:00.500>组合词<00:00.800>雨\n[00:01.000]结束')
    assert(
      await js('emphasisDemo.getState().sample === "custom"'),
      'UTF-8 LRC import uses the production parser',
    )
    assert(
      await js('emphasisDemo.interval(0,null).end===.5 && emphasisDemo.interval(1,1).end===1'),
      'Default emphasis ends early at the next fragment or line',
    )
    await importLrc('没有时间标签的文本')
    assert(
      await js('document.querySelector("[role=alert]").textContent.includes("未找到有效行时间")'),
      'Invalid import reports a recoverable error and preserves the current lyrics',
    )
    await importLrc('[10:00]超过音频时长')
    await click('.preview-button')
    assert(
      await js('document.querySelector("[role=alert]").textContent.includes("超出音频时长")'),
      'Preview reports lyrics beyond the selected audio duration',
    )
    await importLrc(
      '[00:00]<00:00><b>文字</b> 👩‍🎤 é<00:02>一整个计时片段<00:04>\n[00:06]' + '长句换行'.repeat(18),
    )
    assert(
      await js(
        '!document.querySelector(".row-content b") && document.querySelector(".row-content").textContent.includes("<b>")',
      ),
      'Lyrics are rendered as text, with Unicode and multi-character fragments preserved',
    )
    win.setSize(800, 850)
    await capture('long-content')
    assert(
      await js('document.documentElement.scrollWidth <= innerWidth'),
      'Long imported lyrics remain within the workspace',
    )
    await click('.sample-switch button:first-child')
    win.setSize(1280, 900)
    await seek(13.7)
    await capture('final-editor')
    assert(report.errors.length === 0, 'No renderer errors')
    report.passed = true
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
    console.log(JSON.stringify(report, null, 2))
    win.destroy()
    app.exit(0)
  } catch (error) {
    report.passed = false
    report.failure = String(error)
    if (win && !win.isDestroyed()) await capture('failure')
    await writeFile(resolve(output, 'report.json'), JSON.stringify(report, null, 2))
    console.error(error)
    app.exit(1)
  }
})
