const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1440, height: 780, show: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  const js = code => win.webContents.executeJavaScript(code)
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  const assert = (condition, message) => { if (!condition) throw new Error(message) }
  const key = async keyCode => {
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode })
    await pause(260)
  }
  const row = id => js(`(() => {
    const e = document.querySelector('[data-track-id="${id}"]'); const s = getComputedStyle(e); const r = e.getBoundingClientRect();
    const c = document.createElement('canvas').getContext('2d'); c.fillStyle = s.backgroundColor; c.fillRect(0,0,1,1); const rgb = Array.from(c.getImageData(0,0,1,1).data).slice(0,3);
    return { selected: e.getAttribute('aria-pressed'), context: e.classList.contains('library-track-context-selected'), background: s.backgroundColor, rgb, text: getComputedStyle(e.querySelector('.song-title-main,.cover-track-title')).color, height:r.height, x:r.left+r.width*0.65, y:r.top+r.height/2 };
  })()`)
  const luminance = rgb => rgb.map(v => v/255).map(v => v<=0.04045 ? v/12.92 : ((v+0.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[0.2126,0.7152,0.0722][i],0)
  const evidence = []
  for (const theme of ['dark', 'light']) for (const mode of ['flat', 'cover', 'cover-long']) {
    await win.loadURL(`${process.argv[2]}?mode=${mode === 'flat' ? 'flat' : 'cover'}${mode === 'cover-long' ? '&long=1' : ''}`)
    for (let i=0;i<80;i++) { if (await js(`!!document.querySelector('[data-track-id="2"]')`)) break; await pause(50) }
    await js(`document.documentElement.dataset.theme='${theme}'; document.querySelector('[data-track-id="1"]').focus()`)
    await key('Space')
    const selected = await row(1)
    assert(selected.selected === 'true' && !selected.context, 'Ordinary selection failed')
    const target = await row(2)
    const x = Math.round(target.x), y = Math.round(target.y)
    win.webContents.sendInputEvent({ type:'mouseMove', x, y })
    win.webContents.sendInputEvent({ type:'mouseDown', button:'right', x, y, clickCount:1 })
    win.webContents.sendInputEvent({ type:'mouseUp', button:'right', x, y, clickCount:1 })
    await pause(260)
    const context = await row(2)
    assert(await js(`!!document.querySelector('.library-context-menu-main-panel')`), 'Native right click did not open menu')
    assert(context.context && context.selected === 'true', 'Missing right-click target styling')
    assert(theme === 'light'
      ? luminance(context.rgb) > luminance(selected.rgb) * 1.2
      : luminance(context.rgb) < luminance(selected.rgb) * 0.8,
      `Right-click target did not use the ${theme === 'light' ? 'lighter' : 'darker'} theme color`)
    const textRgb = context.text.match(/[\d.]+/g).slice(0,3).map(Number)
    const bgL = luminance(context.rgb), textL = luminance(textRgb)
    const contrast = (Math.max(bgL,textL)+0.05)/(Math.min(bgL,textL)+0.05)
    assert(contrast >= 4.5, `Unreadable context text: ${contrast}`)
    assert(selected.height === 48 && context.height === 48, 'Track height changed')
    await fs.writeFile(path.join(__dirname, `${theme}-${mode}.png`), (await win.webContents.capturePage()).toPNG())
    await key('Escape')
    assert(!(await row(2)).context && (await row(1)).selected === 'true', 'Escape did not restore ordinary selection')
    // Keyboard menu follows the same temporary target path, and clicking outside clears it.
    await js(`document.querySelector('[data-track-id="2"]').focus()`)
    win.webContents.sendInputEvent({ type:'keyDown', keyCode:'F10', modifiers:['shift'] })
    win.webContents.sendInputEvent({ type:'keyUp', keyCode:'F10', modifiers:['shift'] })
    await pause(150)
    assert((await row(2)).context, 'Keyboard menu target did not use the context color')
    win.webContents.sendInputEvent({ type:'mouseDown', button:'left', x:1390, y:700, clickCount:1 })
    win.webContents.sendInputEvent({ type:'mouseUp', button:'left', x:1390, y:700, clickCount:1 })
    await pause(120)
    assert(!(await row(2)).context && (await row(1)).selected === 'true', 'Outside click did not restore selection')
    evidence.push({ theme, mode, selected, context, contrast })
  }
  await fs.writeFile(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log('Passed 6 Renderer scenarios: ordinary/context colors, contrast, native right-click, keyboard menu, Escape, outside click, normal/virtual cover rows.')
  win.destroy()
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
