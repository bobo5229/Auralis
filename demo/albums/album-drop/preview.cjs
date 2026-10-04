const { spawn } = require('node:child_process')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { join } = require('node:path')
const { tmpdir } = require('node:os')

if (!process.versions.electron) {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {
    env: environment,
    windowsHide: false,
    stdio: 'inherit',
  })
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const profile = mkdtempSync(join(tmpdir(), 'auralis-album-drop-preview-'))
  app.setPath('userData', profile)
  app.setName('Auralis · 专辑落盘预览')
  const snapshots = process.argv.includes('--snapshots')
  const record = process.argv.includes('--record')
  const narrow = process.argv.includes('--narrow')
  app
    .whenReady()
    .then(async () => {
      const window = new BrowserWindow({
        width: narrow ? 820 : 1280,
        height: narrow ? 840 : 900,
        minWidth: 680,
        minHeight: 600,
        title: 'Auralis · 长按专辑落盘预览',
        backgroundColor: '#111210',
        autoHideMenuBar: true,
        show: !snapshots && !record,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          backgroundThrottling: false,
          offscreen: snapshots || record,
        },
      })
      window.webContents.on('console-message', (event) => {
        if (event.level === 'error') console.error(event.message)
      })
      await window.loadFile(join(__dirname, 'index.html'))
      if (snapshots || record) {
        const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
        const snapshot = async (name) => {
          const picture = await window.webContents.capturePage()
          writeFileSync(join(profile, `${name}${narrow ? '-narrow' : ''}.png`), picture.toPNG())
        }
        await delay(400)
        const position = await window.webContents.executeJavaScript(
          `document.getElementById('speed').value='${record ? '1' : '1.65'}'; document.getElementById('reduce-motion').checked=false; document.body.classList.remove('reduced-motion'); const rect = document.querySelector('[data-album="${narrow ? 2 : 0}"]').getBoundingClientRect(); ({ x: Math.round(rect.left + rect.width / 2), y: Math.round(rect.top + rect.height / 2) })`,
        )
        if (record) {
          const frames = join(profile, 'frames')
          mkdirSync(frames)
          const startedAt = performance.now()
          window.webContents.sendInputEvent({
            type: 'mouseDown',
            ...position,
            button: 'left',
            clickCount: 1,
          })
          let released = false
          for (let frame = 0; frame < 55; frame += 1) {
            await delay(Math.max(0, startedAt + frame * (1000 / 15) - performance.now()))
            if (!released && performance.now() - startedAt >= 620) {
              window.webContents.sendInputEvent({
                type: 'mouseUp',
                ...position,
                button: 'left',
                clickCount: 1,
              })
              released = true
            }
            const picture = await window.webContents.capturePage()
            writeFileSync(join(frames, `${String(frame).padStart(3, '0')}.jpg`), picture.toJPEG(85))
          }
          const { execFileSync } = require('node:child_process')
          const { resolve } = require('node:path')
          execFileSync(
            resolve(__dirname, '../../../resources/audio/ffmpeg.exe'),
            [
              '-hide_banner',
              '-loglevel',
              'error',
              '-framerate',
              '15',
              '-i',
              join(frames, '%03d.jpg'),
              '-filter_complex',
              'scale=960:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=96[p];[b][p]paletteuse=dither=bayer:bayer_scale=3',
              '-loop',
              '0',
              join(profile, 'album-drop.gif'),
            ],
            { windowsHide: true },
          )
        } else {
          await snapshot('idle')
          window.webContents.sendInputEvent({
            type: 'mouseDown',
            ...position,
            button: 'left',
            clickCount: 1,
          })
          await delay(600)
          window.webContents.sendInputEvent({
            type: 'mouseUp',
            ...position,
            button: 'left',
            clickCount: 1,
          })
          await delay(620)
          await snapshot('extract')
          await delay(800)
          await snapshot('flight')
          await delay(1700)
          await snapshot('landed')
        }
        const state = await window.webContents.executeJavaScript('window.albumDropPreview.state()')
        console.log(JSON.stringify({ outputDirectory: profile, ...state }))
        app.quit()
      }
    })
    .catch((error) => {
      console.error(error)
      app.quit()
    })
  app.on('window-all-closed', () => app.quit())
}
