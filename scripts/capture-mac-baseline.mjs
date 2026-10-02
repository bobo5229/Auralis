import { app, BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

app.commandLine.appendSwitch('disable-gpu-vsync')
app.commandLine.appendSwitch('disable-frame-rate-limit')

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1180,
    height: 760,
    show: false,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
  })

  win.webContents.on('console-message', (_e, level, message) => {
    console.log(`[Renderer ${level}]`, message)
  })

  const outputDir = resolve('.electron-home/archive-mac-preview')
  const htmlPath = resolve('demo/archive/mac-stage-device.html')
  const targetUrl = pathToFileURL(htmlPath).href

  console.log('Loading:', targetUrl)
  await win.loadURL(targetUrl)
  await sleep(1500) // Wait for render and assets

  // Power on the machine
  await win.webContents.executeJavaScript(`
    const bodyPower = document.getElementById('body-power');
    bodyPower?.click();
  `)
  await sleep(500)

  // 1. Machine view (整机)
  const img1 = await win.webContents.capturePage()
  writeFileSync(join(outputDir, 'baseline-machine.png'), img1.toPNG())
  console.log('Captured baseline-machine.png')

  // 2. Double click to switch to screen mode
  await win.webContents.executeJavaScript(`
    const rig = document.getElementById('rig');
    rig.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, clientX: 300, clientY: 300 }));
  `)
  await sleep(1500)
  // Click album entry
  await win.webContents.executeJavaScript(`
    const albumEntry = document.querySelector('[data-entry="album"]');
    albumEntry?.click();
  `)
  await sleep(500)
  const inspect2 = await win.webContents.executeJavaScript('window.macStageDevice?.inspect()')
  console.log('Inspect after album open:', inspect2)
  const imgAlbum = await win.webContents.capturePage()
  writeFileSync(join(outputDir, 'baseline-album-stats.png'), imgAlbum.toPNG())
  console.log('Captured baseline-album-stats.png')

  // 3. Date dropdown open (日期下拉)
  await win.webContents.executeJavaScript(`
    {
      const trigger = document.getElementById('date-trigger');
      trigger?.click();
    }
  `)
  await sleep(500)
  const imgDropdown = await win.webContents.capturePage()
  writeFileSync(join(outputDir, 'baseline-date-dropdown.png'), imgDropdown.toPNG())
  console.log('Captured baseline-date-dropdown.png')

  // Close date dropdown
  await win.webContents.executeJavaScript(`
    {
      const trigger = document.getElementById('date-trigger');
      trigger?.click();
    }
  `)
  await sleep(300)

  // 4. Close album window to show CRT Desktop (CRT 桌面)
  await win.webContents.executeJavaScript(`
    {
      const desktopReturn = document.getElementById('desktop-return');
      desktopReturn?.click();
    }
  `)
  await sleep(600)

  const imgDesktop = await win.webContents.capturePage()
  writeFileSync(join(outputDir, 'baseline-crt-desktop.png'), imgDesktop.toPNG())
  console.log('Captured baseline-crt-desktop.png')

  console.log('All baseline captures complete.')
  app.quit()
})
