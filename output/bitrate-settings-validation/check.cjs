const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 900, show: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const js = code => win.webContents.executeJavaScript(code)
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const waitFor = async selector => {
    for (let i = 0; i < 100; i++) { if (await js(`!!document.querySelector(${JSON.stringify(selector)})`)) return; await pause(50) }
    throw new Error(`Missing ${selector}`)
  }
  const key = async keyCode => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await pause(80)
  }
  const open = async () => {
    await js(`document.querySelector('[data-settings-trigger]').click()`)
    await waitFor('.song-font-weight-details')
    await js(`document.querySelector('.song-font-weight-summary').click(); document.querySelectorAll('.song-font-weight-toolbar .settings-segmented-option')[1].click()`)
    await waitFor('#song-font-weight-cover-bitrate-size')
    await pause(350)
  }
  const measure = selector => js(`(() => {
    const e = document.querySelector(${JSON.stringify(selector)}), s = getComputedStyle(e), r = e.getBoundingClientRect();
    const row = e.closest('.cover-track-row,.song-font-preview-track');
    return { text: e.textContent.trim(), size: s.fontSize, weight: s.fontWeight, width: e.clientWidth, contentWidth: e.scrollWidth, height: r.height, rowHeight: row.getBoundingClientRect().height, color: s.color };
  })()`)
  const evidence = []
  for (const theme of ['dark', 'light']) {
    await win.loadURL(`${process.argv[2]}?mode=cover`)
    await waitFor('.cover-track-bitrate')
    await js(`localStorage.removeItem('auralis-song-font-sizes'); localStorage.removeItem('auralis-song-font-weights')`)
    await win.reload()
    await waitFor('.cover-track-bitrate')
    await js(`document.documentElement.dataset.theme='${theme}'`)
    await open()
    assert(await js(`document.querySelector('#song-font-weight-cover-bitrate-label').textContent.trim() === '比特率'`), 'Missing localized label')
    await js(`const input = document.querySelector('#song-font-weight-cover-bitrate-size'); input.scrollIntoView({block:'center'}); input.focus()`)
    for (let i = 0; i < 6; i++) await key('Up')
    await js(`const weight = document.querySelector('#song-font-weight-cover-bitrate'); weight.focus()`)
    await key('End')
    await key('Return')
    const preview = await measure('.song-font-preview-cover-bitrate')
    const row = await measure('[data-track-id="1"] .cover-track-bitrate')
    const missing = await measure('[data-track-id="2"] .cover-track-bitrate')
    for (const item of [preview, row, missing]) {
      assert(item.size === '18px' && item.weight === '700', `Typography not applied: ${JSON.stringify(item)}`)
      assert(item.rowHeight === 48, 'Track height changed')
      assert(item.contentWidth <= item.width, 'Bitrate text clipped')
    }
    assert(preview.text === '320 K' && row.text === '1411 K' && missing.text === '—', `Wrong bitrate display: ${JSON.stringify({preview,row,missing})}`)
    await fs.writeFile(path.join(__dirname, `${theme}-settings.png`), (await win.webContents.capturePage()).toPNG())
    await js(`document.querySelector('.settings-dialog-header button').click()`)
    await pause(250)
    await fs.writeFile(path.join(__dirname, `${theme}-cover.png`), (await win.webContents.capturePage()).toPNG())
    await win.reload()
    await waitFor('.cover-track-bitrate')
    const restored = await measure('[data-track-id="1"] .cover-track-bitrate')
    assert(restored.size === '18px' && restored.weight === '700', 'Reload lost preferences')
    await open()
    await js(`document.querySelector('.song-font-weight-reset').click()`)
    await pause(100)
    const reset = await measure('[data-track-id="1"] .cover-track-bitrate')
    assert(reset.size === '12px' && reset.weight === '400', 'Reset lost defaults')
    await js(`document.querySelectorAll('.song-font-weight-toolbar .settings-segmented-option')[0].click()`)
    await pause(100)
    assert(!(await js(`!!document.querySelector('#song-font-weight-list-bitrate-size')`)), 'List view exposed unsupported field')
    evidence.push({ theme, preview, row, missing, restored, reset })
  }
  await fs.writeFile(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log('Passed dark/light settings edits, live preview and actual rows, maximum bitrate typography, reload, reset, and list-field scope.')
  win.destroy()
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
