const { app, BrowserWindow } = require('electron')
const fs = require('node:fs/promises')
const path = require('node:path')
app.setPath('userData', path.join(__dirname, 'isolated-profile'))
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 600, height: 220, show: false, useContentSize: true, webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, backgroundThrottling: false } })
  win.webContents.on('console-message', (_event, level, message) => { if (level >= 2) console.log(message) })
  const js = code => win.webContents.executeJavaScript(code)
  const pause = ms => new Promise(resolve => setTimeout(resolve, ms))
  const evidence = []
  await win.loadURL(process.argv[2])
  for (let i=0;i<100;i++) { if (await js(`!!document.querySelector('.album-detail-track-eq rect')`)) break; await pause(50) }
  for (const theme of ['dark','light']) for (const palette of ['default','red']) for (const preset of ['blocks-wave','equalizer']) for (const playing of [true,false]) for (const selected of [true,false]) {
    await js(`(() => { document.documentElement.dataset.theme='${theme}'; const surface = document.querySelector('main'); surface.style.setProperty('--auralis-theme-accent', '${palette === 'red' ? '#c00000' : '#1dd35e'}'); surface.style.setProperty('--auralis-control-primary-text','${palette === 'red' ? '#ffffff' : '#121212'}'); window.configureIndicator('${preset}',${playing},${selected}); })()`)
    await pause(300)
    const state = await js(`(() => { const row = document.querySelector('[data-track-id="1"]'); const icon = row.querySelector('svg'); const title = row.querySelector('.album-detail-track-title'); return { fill:getComputedStyle(icon.querySelector('rect')).fill, color:getComputedStyle(title).color, height:row.getBoundingClientRect().height, shapes:icon.querySelectorAll('rect').length, background:getComputedStyle(row).backgroundColor }; })()`)
    if (state.fill !== state.color) throw new Error(`Icon foreground mismatch: ${JSON.stringify({theme,palette,preset,playing,selected,...state})}`)
    if (state.shapes !== (preset === 'blocks-wave' ? 9 : 3)) throw new Error('Wrong preset')
    evidence.push({theme,palette,preset,playing,selected,...state})
    if (palette === 'red' && preset === 'blocks-wave' && playing && !selected) {
      await fs.writeFile(path.join(__dirname, `${theme}-red-blocks.png`), (await win.webContents.capturePage()).toPNG())
    }
  }
  await fs.writeFile(path.join(__dirname,'evidence.json'),JSON.stringify(evidence,null,2))
  console.log(`Passed ${evidence.length} actual album track component color scenarios.`)
  win.destroy(); app.exit(0)
}).catch(error => {console.error(error);app.exit(1)})
