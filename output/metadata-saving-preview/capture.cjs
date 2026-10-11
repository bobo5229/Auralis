const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 900, height: 760, useContentSize: true, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, _level, message) => console.log(message))
  await win.loadURL(process.argv[2])
  const evidence = await win.webContents.executeJavaScript(`(async () => {
    const deadline = Date.now() + 20000
    while (!document.querySelector('.metadata-dialog-panel')) {
      if (Date.now() > deadline) throw new Error('Dialog did not mount')
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    await document.fonts.ready
    await new Promise(resolve => setTimeout(resolve, 500))
    const labels = [...document.querySelectorAll('.metadata-dialog-label')].map(el => ({ text: el.firstChild.textContent.trim(), size: getComputedStyle(el).fontSize, lineHeight: getComputedStyle(el).lineHeight }))
    const save = document.querySelector('button[type="submit"]')
    if (labels.length !== 6 || labels.some(item => item.size !== '12px' || item.lineHeight !== '18px') || !save.disabled || save.textContent.trim() !== '正在保存…') throw new Error('Unexpected saving state')
    return { labels, savingText: save.textContent.trim(), inputsDisabled: [...document.querySelectorAll('input')].every(el => el.disabled) }
  })()`)
  await fs.writeFile(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2))
  await fs.writeFile(path.join(__dirname, 'metadata-saving.png'), (await win.webContents.capturePage()).toPNG())
  console.log(JSON.stringify(evidence))
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
