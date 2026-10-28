const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const os = require('node:os')
const install = require('./install-suede-case.cjs')
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-suede-texture-')))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true } })
  await win.loadURL('data:text/html,<section class="placement-badges"></section>')
  const data = await win.webContents.executeJavaScript(`(() => { (${install.toString()})(''); return document.querySelector('.commemoration-case').style.getPropertyValue('--suede-nap'); })()`)
  const base64 = data.match(/base64,([^"\)]+)/)[1]
  fs.writeFileSync(path.resolve(__dirname, '../../src/renderer/features/archive/assets/milestones/suede-nap.png'), Buffer.from(base64, 'base64'))
  app.exit(0)
}).catch(error => { console.error(error); app.exit(1) })
