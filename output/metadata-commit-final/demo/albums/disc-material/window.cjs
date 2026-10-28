const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const root = path.resolve(__dirname, '../../../.electron-home/disc-material-demo')
const verify = process.argv.includes('--verify')
const production = process.argv.includes('--production')
app.setName('Auralis Disc Material Demo')
app.setPath(
  'userData',
  path.join(
    root,
    `${production ? 'production-' : ''}${verify ? 'verify-profile' : 'interactive-profile'}`,
  ),
)
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1320,
      height: 930,
      minWidth: 760,
      minHeight: 650,
      show: false,
      autoHideMenuBar: true,
      backgroundColor: '#eeeeec',
      title: 'Auralis · 唱片材质对照',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: verify,
      },
    })
    const errors = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') {
        errors.push(event.message)
        console.error(event.message)
      }
    })
    win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    win.webContents.on('will-navigate', (event) => event.preventDefault())
    await win.loadFile(
      path.join(root, production ? 'production-dist/production.html' : 'dist/index.html'),
    )
    if (verify) {
      await require(production ? './verify-production.cjs' : './verify.cjs')(win, root, errors)
      win.destroy()
      app.quit()
    } else {
      win.center()
      win.show()
      win.restore()
      win.focus()
      console.log(
        JSON.stringify({
          visible: win.isVisible(),
          title: win.getTitle(),
          userData: app.getPath('userData'),
        }),
      )
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
app.on('window-all-closed', () => app.quit())
