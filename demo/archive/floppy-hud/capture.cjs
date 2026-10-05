const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setPath('userData', fs.mkdtempSync(path.join(app.getPath('temp'), 'auralis-floppy-hud-')))
app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1440, height: 900, show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, offscreen: true },
  })
  try {
    await win.loadFile(path.join(__dirname, 'index.html'))
    await win.webContents.executeJavaScript(`Promise.all([document.fonts.ready, ...Array.from(document.images, image => image.decode())])`)
    for (const [name, width, height] of [['preview.png', 1440, 900], ['preview-narrow.png', 860, 700], ['preview-small.png', 480, 700]]) {
      win.setContentSize(width, height)
      await new Promise(resolve => setTimeout(resolve, 300))
      const metrics = await win.webContents.executeJavaScript(`(() => {
        const rect = document.querySelector('.hud').getBoundingClientRect();
        return { viewport: [innerWidth, innerHeight], images: [...document.images].map(i => i.complete && i.naturalWidth > 0), disks: document.querySelectorAll('.disk-media').length, pageOverflow: document.documentElement.scrollWidth > innerWidth, hudBounds: [rect.x, rect.y, rect.right, rect.bottom] };
      })()`)
      if (metrics.images.some(loaded => !loaded) || metrics.disks !== 5 || metrics.pageOverflow || metrics.hudBounds[0] < 0 || metrics.hudBounds[2] > metrics.viewport[0] || metrics.hudBounds[3] > metrics.viewport[1]) throw new Error(JSON.stringify(metrics))
      fs.writeFileSync(path.join(__dirname, name), (await win.webContents.capturePage()).toPNG())
      console.log(name, JSON.stringify(metrics))
    }
    app.exit(0)
  } catch (error) {
    console.error(error)
    app.exit(1)
  }
})
