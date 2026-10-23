const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const output = __dirname
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-smart-layout-')))
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
let win
const measure = `(() => {
  const rect = (selector) => {
    const node = document.querySelector(selector)
    const r = node.getBoundingClientRect()
    const css = getComputedStyle(node)
    return { top:r.top, bottom:r.bottom, width:r.width, height:r.height,
      clientHeight:node.clientHeight, scrollHeight:node.scrollHeight,
      display:css.display, rows:css.gridTemplateRows, maxHeight:css.maxHeight }
  }
  const panel=rect('.auralis-dialog-panel'), body=rect('.auralis-dialog-body'),
    stage=rect('.stage'), controls=rect('.controls'), footer=rect('.auralis-dialog-footer')
  return { viewport:{width:innerWidth,height:innerHeight}, dpr:devicePixelRatio,
    panel,body,stage,controls,footer, choices:rect('.choices'),
    blankBelowControls: Math.round(footer.top-controls.bottom),
    visibleChoices:document.querySelectorAll('.choice').length,
    alerts:[...document.querySelectorAll('[role=alert]')].map(n=>n.textContent.trim()) }
})()`

async function capture(name) {
  const result = await win.webContents.executeJavaScript(measure)
  results.push({ name, ...result })
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(output, name + '.png'), image.toPNG())
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(name, JSON.stringify(result))
}

app.whenReady().then(async () => {
  win = new BrowserWindow({ width:1440,height:900,useContentSize:true,show:false,
    webPreferences:{ offscreen:true, backgroundThrottling:false } })
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 2) console.log('RENDERER', message)
  })
  const url = 'http://[::1]:5173/@fs/' + path.join(output, 'index.html').replaceAll('\\', '/')
  await win.loadURL(url)
  let ready = false
  for (let i=0;i<100;i++) {
    ready = await win.webContents.executeJavaScript('window.reviewReady === true')
    if (ready) break
    await delay(100)
  }
  if (!ready) throw new Error('Review harness did not become ready')
  await delay(300)
  await capture('900h-many-options')
  win.setContentSize(1280,720)
  await delay(180)
  await capture('720h-many-options')
  win.setContentSize(1440,900)
  await win.webContents.executeJavaScript('window.reviewSetFixture(4)')
  await delay(180)
  await capture('900h-few-options')
  await win.webContents.executeJavaScript('window.reviewSetFixture(0)')
  await delay(180)
  await capture('900h-empty')
  await win.webContents.executeJavaScript('window.reviewSetFixture(40)')
  await delay(180)
  await win.webContents.executeJavaScript(`document.querySelector('.auralis-dialog-panel').style.height = 'auto'`)
  await delay(120)
  await capture('900h-auto-height-control')
  win.destroy()
  app.quit()
}).catch((error) => {
  console.error(error.stack || error)
  if (win) win.destroy()
  app.exit(1)
})
