/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')

if (!process.versions.electron) {
  const { spawn } = require('node:child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename], {
    env,
    windowsHide: true,
    stdio: 'inherit',
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
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const output = path.join(__dirname, 'captures')
  const results = { errors: [] }
  ;(async () => {
    app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'auralis-metal-comparison-')))
    await app.whenReady()
    await fs.mkdir(output, { recursive: true })
    const window = new BrowserWindow({
      width: 1440,
      height: 1000,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        backgroundThrottling: false,
      },
    })
    window.webContents.on('console-message', (event) => {
      if (event.level === 'error') results.errors.push(event.message)
    })
    const js = (code) => window.webContents.executeJavaScript(code)
    const capture = async (name) => {
      window.webContents.invalidate()
      await wait(100)
      await fs.writeFile(
        path.join(output, `${name}.png`),
        (await window.webContents.capturePage()).toPNG(),
      )
    }
    const canvasStats = () =>
      js(`Array.from(document.querySelectorAll('.surface canvas'), canvas => {
      const gl = canvas.getContext('webgl2');
      const pixels = new Uint8Array(canvas.width*canvas.height*4);
      gl.readPixels(0,0,canvas.width,canvas.height,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let min=255,max=0,sum=0;
      for(let i=0;i<pixels.length;i+=4){const v=(pixels[i]+pixels[i+1]+pixels[i+2])/3;min=Math.min(min,v);max=Math.max(max,v);sum+=v;}
      return {min,max,mean:sum/(pixels.length/4),error:gl.getError()};
    })`)
    try {
      await window.loadFile(path.join(__dirname, 'index.html'))
      await wait(500)
      assert.equal(
        await js('Boolean(window.metalComparison?.ready)'),
        true,
        await js('document.querySelector("#error").textContent'),
      )
      const start = await js('metalComparison.getState()')
      await wait(500)
      assert.ok((await js('metalComparison.getState().time')) > start.time)
      results.animation = true
      await js('document.querySelector("#pause").click(); metalComparison.renderAt(9)')
      await wait(150)
      const paused = await js('metalComparison.getState()')
      await wait(200)
      assert.equal((await js('metalComparison.getState()')).draws, paused.draws)
      assert.deepEqual(paused.sizes[0], paused.sizes[1])
      results.pause = true
      results.silver = await canvasStats()
      results.sizes = paused.sizes
      for (const stats of results.silver) {
        assert.equal(stats.error, 0)
        assert.ok(stats.max - stats.min > 25)
        assert.ok(stats.mean > 5)
      }
      await capture('silver')
      await js('metalComparison.renderAt(14)')
      results.motion = await canvasStats()
      assert.notDeepEqual(results.motion, results.silver)
      await js(
        'document.querySelector("#preset").value="purple";document.querySelector("#preset").dispatchEvent(new Event("change"))',
      )
      assert.equal((await js('metalComparison.getState()')).palette.length, 3)
      await capture('purple')
      await js(
        'document.querySelector("#lyrics").click();document.querySelector("#material-settings").open=true',
      )
      await capture('lyrics-and-controls')
      await js(
        'document.querySelector("[data-paper=repetition]").value="3";document.querySelector("[data-paper=repetition]").dispatchEvent(new Event("input"));document.querySelector("[data-auralis=folds]").value="1.6";document.querySelector("[data-auralis=folds]").dispatchEvent(new Event("input"));document.querySelector("#speed").value="1.25";document.querySelector("#speed").dispatchEvent(new Event("input"))',
      )
      const changed = await js('metalComparison.getState()')
      assert.equal(changed.paper.repetition, 3)
      assert.equal(changed.material.folds, 1.6)
      assert.equal(changed.material.speed, 1.25)
      results.controls = true
      await js('document.querySelector("#reset").click()')
      const reset = await js('metalComparison.getState()')
      assert.equal(reset.time, 0)
      assert.equal(reset.material.speed, 0.7)
      assert.equal(reset.paper.repetition, 1.5)
      results.reset = true
      await js(
        `metalComparison.loadCover(new File([new Uint8Array([1,2,3])],'broken.png',{type:'image/png'}))`,
      )
      assert.equal(await js('document.querySelector("#error").hidden'), false)
      const referencePath = path.join(__dirname, '..', 'liquid-metal', 'assets', 'reference.png')
      const imageData = (await fs.readFile(referencePath)).toString('base64')
      await js(
        `metalComparison.loadCover(new File([Uint8Array.from(atob(${JSON.stringify(imageData)}),c=>c.charCodeAt(0))],'reference.png',{type:'image/png'}))`,
      )
      const uploaded = await js('metalComparison.getState()')
      assert.ok(uploaded.palette.length > 1)
      assert.equal(await js('document.querySelector("#error").hidden'), true)
      results.upload = uploaded.palette.map(({ color, weight }) => ({ color, weight }))
      await capture('cover-palette')
      await js('document.querySelector("[data-view=paper]").click()')
      await wait(150)
      assert.equal(
        await js('getComputedStyle(document.querySelector("#auralis-panel")).display'),
        'none',
      )
      await capture('paper-only')
      await js('document.querySelector("[data-view=auralis]").click()')
      await wait(150)
      assert.equal(
        await js('getComputedStyle(document.querySelector("#paper-panel")).display'),
        'none',
      )
      results.views = true
      await js(
        'document.querySelector("[data-view=both]").click();document.querySelector("#material-settings").open=false;document.querySelector("#lyrics").click();document.querySelector("#reset").click()',
      )
      window.setContentSize(540, 980)
      await wait(200)
      assert.equal(await js('document.documentElement.scrollWidth>innerWidth'), false)
      const narrow = await js('metalComparison.getState()')
      assert.deepEqual(narrow.sizes[0], narrow.sizes[1])
      await capture('narrow')
      results.narrow = true
      results.gpu = await app.getGPUInfo('basic')
      results.renderer = await js(
        `(() => { const gl=document.querySelector('.surface canvas').getContext('webgl2'); const ext=gl.getExtension('WEBGL_debug_renderer_info'); return ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER); })()`,
      )
      assert.deepEqual(results.errors, [])
      await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(results, null, 2))
      console.log(JSON.stringify({ ...results, gpu: results.gpu.gpuDevice }, null, 2))
      window.destroy()
      app.quit()
    } catch (error) {
      console.error(error, results.errors)
      await capture('failure')
      app.exit(1)
    }
  })().catch((error) => {
    console.error(error)
    app.exit(1)
  })
}
