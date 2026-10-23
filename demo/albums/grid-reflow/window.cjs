const { app, BrowserWindow } = require('electron')
const path = require('node:path')
const verify = process.argv.includes('--verify')
const production = process.argv.includes('--production')
const root = path.resolve('.electron-home/grid-reflow-demo')
let demoWindow
app.setName('Auralis Grid Reflow Demo')
app.setPath(
  'userData',
  path.join(
    root,
    production ? 'production-profile' : verify ? 'verify-profile' : 'interactive-profile',
  ),
)
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1440,
      height: 920,
      minWidth: 900,
      minHeight: 650,
      show: false,
      autoHideMenuBar: true,
      title: 'Auralis · 专辑重排实验（模拟曲库）',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: verify,
      },
    })
    demoWindow = win
    win.on('closed', () => {
      demoWindow = null
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
      path.join(root, production ? 'production-dist/index.html' : 'dist/index.html'),
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
          bounds: win.getBounds(),
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
