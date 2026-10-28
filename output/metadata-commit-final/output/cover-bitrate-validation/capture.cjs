const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 940, height: 480, useContentSize: true, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true, sandbox: true, backgroundThrottling: false } })
  const errors = []
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 3) errors.push(message) })
  await win.loadURL(process.argv[2])
  await win.webContents.executeJavaScript('document.fonts.ready')
  const evidence = []
  for (const width of [600, 940]) for (const theme of ['dark','light']) for (const collapsed of [false,true]) for (const max of [false,true]) for (const zoom of [1,1.25]) {
    win.setContentSize(width, 540)
    win.webContents.setZoomFactor(zoom)
    await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='${theme}'; window.setScenario(${collapsed},${max})`)
    const rows = await win.webContents.executeJavaScript(`new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => {
      const rows = [...document.querySelectorAll('.cover-track-row')].map(row => {
        const rect = row.getBoundingClientRect(), group = row.querySelector('.cover-track-technical'), duration = row.querySelector('.cover-track-duration'), bitrate = row.querySelector('.cover-track-bitrate')
        const g = group.getBoundingClientRect(), d = duration.getBoundingClientRect(), b = bitrate.getBoundingClientRect()
        return { height: rect.height, bitrate: bitrate.textContent.trim(), bitrateSize: getComputedStyle(bitrate).fontSize, bitrateLineHeight: getComputedStyle(bitrate).lineHeight,
          color: getComputedStyle(bitrate).color, primaryColor: getComputedStyle(row).getPropertyValue('--auralis-control-primary-text').trim(),
          clipped: bitrate.scrollWidth > bitrate.clientWidth, durationClipped: duration.scrollWidth > duration.clientWidth,
          centered: Math.abs(g.top + g.height / 2 - rect.top - rect.height / 2) < 1,
          inside: g.top >= rect.top && g.bottom <= rect.bottom, twoLines: d.bottom <= b.top + 0.1,
          rightAligned: Math.abs(d.right - b.right) < 0.1, rowFits: rect.right <= innerWidth,
          dpr: devicePixelRatio }
      }); resolve(rows)
    })))`)
    if (rows.length !== 6 || rows.some(r => Math.abs(r.height - 48) > 0.01 || r.clipped || r.durationClipped || !r.centered || !r.inside || !r.twoLines || !r.rightAligned || !r.rowFits || r.bitrateSize !== '12px' || r.bitrateLineHeight !== '18px')) throw new Error(JSON.stringify({ width,theme,collapsed,max,zoom,rows }))
    evidence.push({ width, theme, collapsed, max, zoom, rows })
    if (zoom === 1 && !collapsed && !max) await fs.writeFile(path.join(__dirname, `${theme}-${width}.png`), (await win.webContents.capturePage()).toPNG())
    if (width === 600 && theme === 'dark' && collapsed && max && zoom === 1.25) await fs.writeFile(path.join(__dirname,'dark-narrow-max-125.png'), (await win.webContents.capturePage()).toPNG())
  }
  if (errors.length) throw new Error(JSON.stringify(errors))
  await fs.writeFile(path.join(__dirname, 'evidence.json'), JSON.stringify(evidence, null, 2))
  console.log(`Passed ${evidence.length} rendered scenarios (${evidence.length * 6} track rows).`)
  app.quit()
}).catch(error => { console.error(error); app.exit(1) })
