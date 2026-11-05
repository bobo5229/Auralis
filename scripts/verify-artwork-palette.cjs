/* eslint-disable @typescript-eslint/no-require-imports -- Electron test entry is CommonJS. */
// Isolated renderer/worker regression: does not start the player or access its library.
const { spawn } = require('node:child_process')
const path = require('node:path')
const fs = require('node:fs')
const os = require('node:os')
const assert = require('node:assert/strict')

if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename], {
    env,
    stdio: 'inherit',
    windowsHide: true,
  })
  child.on('exit', (code) => {
    process.exitCode = code ?? 1
  })
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const { build } = require('esbuild')
  const root = path.resolve(__dirname, '..')
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-palette-worker-'))
  app.setPath('userData', profile)
  app
    .whenReady()
    .then(async () => {
      const bundle = await build({
        entryPoints: [
          path.join(root, 'src/renderer/features/playback/workers/artworkPalette.worker.ts'),
        ],
        bundle: true,
        format: 'iife',
        platform: 'browser',
        write: false,
        alias: { '@renderer': path.join(root, 'src/renderer') },
      })
      const win = new BrowserWindow({
        show: false,
        webPreferences: {
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          backgroundThrottling: false,
        },
      })
      await win.loadURL('data:text/html,<!doctype html><html><body></body></html>')
      const covers = [
        ['Pink Pony Club', 'demo/albums/color-family-study/pink-pony-club.jpg'],
        ['Doja', 'demo/albums/selection-patch/doja.jpg'],
        ['Lover', 'demo/albums/selection-patch/lover.jpg'],
        ['The White Album', 'demo/playback/palette-comparison/assets/white-album.jpg'],
        ['Unknown Pleasures', 'demo/playback/palette-comparison/assets/unknown-pleasures.jpg'],
      ].map(([name, file]) => ({
        name,
        image: `data:image/jpeg;base64,${fs.readFileSync(path.join(root, file)).toString('base64')}`,
      }))
      const results = await win.webContents.executeJavaScript(`(async () => {
      const covers = ${JSON.stringify(covers)};
      const code = ${JSON.stringify(bundle.outputFiles[0].text)};
      const url = URL.createObjectURL(new Blob([code], {type:'text/javascript'}));
      const worker = new Worker(url);
      const results = [];
      for (const {name,image:src} of covers) {
        const image = new Image(); image.src = src; await image.decode();
        const canvas = document.createElement('canvas'); canvas.width = canvas.height = 48;
        const context = canvas.getContext('2d', {willReadFrequently:true});
        context.drawImage(image, 0, 0, 48, 48);
        const pixels = context.getImageData(0, 0, 48, 48).data;
        const palette = await new Promise((resolve, reject) => {
          worker.onmessage = e => e.data.error ? reject(Error(e.data.error)) : resolve(e.data.palette);
          worker.onerror = e => reject(Error(e.message));
          worker.postMessage({id:1, key:name, pixels}, [pixels.buffer]);
        });
        results.push({name,dominant:palette.dominant,accent:palette.accents[0].sourceRgb});
      }
      worker.terminate(); URL.revokeObjectURL(url); return results;
    })()`)
      const [pink, doja, lover, white, dark] = results
      assert.ok(pink.dominant.r > pink.dominant.g + 40, 'Pink Pony Club should select pink')
      assert.ok(
        doja.dominant.g > doja.dominant.r + 50 && doja.dominant.b > doja.dominant.r + 50,
        'Doja should select cyan',
      )
      assert.ok(
        lover.dominant.r > lover.dominant.g + 15 && lover.dominant.g > 160,
        'Lover should retain light pink',
      )
      assert.ok(
        white.dominant.r > 230 && white.dominant.g > 230 && white.dominant.b > 230,
        'White album should remain light',
      )
      assert.ok(Math.max(...Object.values(dark.dominant)) < 80, 'Dark cover should remain dark')
      for (const result of results) assert.deepEqual(result.accent, result.dominant)
      console.log(JSON.stringify(results))
      win.destroy()
      app.quit()
    })
    .catch((error) => {
      console.error(error)
      app.exit(1)
    })
}
