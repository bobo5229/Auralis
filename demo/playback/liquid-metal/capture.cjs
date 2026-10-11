/* eslint-disable @typescript-eslint/no-require-imports -- Electron validation uses an isolated CommonJS entry. */
const { app, BrowserWindow } = require('electron')
const { mkdtemp, mkdir, writeFile } = require('node:fs/promises')
const { tmpdir } = require('node:os')
const { join } = require('node:path')
const assert = require('node:assert/strict')
const output = process.argv[2]
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

;(async () => {
  app.setPath('userData', await mkdtemp(join(tmpdir(), 'auralis-metal-prototype-')))
  await app.whenReady()
  await mkdir(output, { recursive: true })
  const window = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      offscreen: true,
      backgroundThrottling: false,
    },
  })
  const results = { errors: [] }
  window.webContents.on('console-message', (event) => {
    if (event.level === 'error') results.errors.push(event.message)
  })
  const js = (code) => window.webContents.executeJavaScript(code)
  const capture = async (name) => {
    window.webContents.invalidate()
    await wait(65)
    const image = await window.webContents.capturePage()
    await writeFile(join(output, name + '.png'), image.toPNG())
    return image
  }
  try {
    await window.loadURL('http://127.0.0.1:4176/')
    for (let i = 0; i < 100; i++) {
      if (await js('Boolean(window.metalDemo?.ready) || document.body.dataset.failed === "true"'))
        break
      await wait(50)
    }
    assert.equal(await js('Boolean(window.metalDemo?.ready)'), true)
    await wait(1500)
    results.running = await js('metalDemo.renderer.getState()')
    assert.equal(results.running.error, 0)
    assert.ok(results.running.draws > 20)
    await js('metalDemo.renderer.setPaused(true); metalDemo.renderer.renderAt(9)')
    const initial = await capture('desktop')
    await js('document.querySelector("#clean").click()')
    window.setContentSize(1600, 1200)
    await wait(100)
    await capture('material-reference-size')
    window.setContentSize(1440, 900)
    await wait(100)
    const before = await capture('motion-start')
    await js('metalDemo.renderer.renderAt(14)')
    const after = await capture('motion-end')
    const a = before.toBitmap(),
      b = after.toBitmap()
    let changed = 0
    for (let i = 0; i < a.length; i += 4)
      if (
        Math.abs(a[i] - b[i]) + Math.abs(a[i + 1] - b[i + 1]) + Math.abs(a[i + 2] - b[i + 2]) >
        30
      )
        changed++
    results.motionChangedFraction = changed / (a.length / 4)
    assert.ok(results.motionChangedFraction > 0.03)
    const draws = await js('metalDemo.renderer.getState().draws')
    await wait(180)
    assert.equal(await js('metalDemo.renderer.getState().draws'), draws)
    results.pauseStopped = true
    await js(
      'document.querySelector("#restore").click();document.querySelector("[data-preset=blue]").click()',
    )
    await capture('blue')
    results.bluePalette = await js('metalDemo.getPalette()')
    await js('document.querySelector("[data-preset=rose]").click()')
    await capture('rose')
    await js('document.querySelector("[data-preset=mono]").click()')
    await capture('monochrome')
    await js(
      'document.querySelector("#speed").value="1.25";document.querySelector("#speed").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#folds").value="1.6";document.querySelector("#folds").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#roughness").value=".24";document.querySelector("#roughness").dispatchEvent(new Event("input",{bubbles:true}))',
    )
    results.controls = await js('metalDemo.renderer.getState()')
    assert.equal(results.controls.speed, 1.25)
    assert.equal(results.controls.folds, 1.6)
    assert.equal(results.controls.roughness, 0.24)
    await js('document.querySelector("#reset").click()')
    assert.equal(await js('metalDemo.renderer.getState().folds'), 1.15)
    await js(
      'metalDemo.loadCover(new File([new Uint8Array([1,2,3])],"broken.png",{type:"image/png"}))',
    )
    assert.ok(await js('document.querySelector("#status").textContent.includes("无法解码")'))
    await js(
      '(async()=>{const blob=await (await fetch("./assets/reference.png")).blob();await metalDemo.loadCover(new File([blob],"黄绿参考取色.png",{type:"image/png"}))})()',
    )
    results.upload = await js(
      '({name:document.querySelector("#palette-name").textContent,palette:metalDemo.getPalette(),width:document.querySelector("#cover").naturalWidth})',
    )
    assert.equal(results.upload.palette.length, 6)
    assert.ok(Math.abs(results.upload.palette.reduce((sum, p) => sum + p.weight, 0) - 1) < 1e-6)
    await capture('uploaded-reference-palette')
    await js('document.querySelector("#lyrics").click()')
    await capture('lyrics-preview')
    window.setContentSize(430, 900)
    await wait(120)
    await capture('narrow')
    results.narrow = await js(
      '({width:innerWidth,scrollWidth:document.documentElement.scrollWidth,controlsBottom:document.querySelector(".controls").getBoundingClientRect().bottom,height:innerHeight})',
    )
    results.narrow.coverAndSwatchesSeparate = await js(
      '(()=>{const cover=document.querySelector(".cover-info").getBoundingClientRect();const swatches=document.querySelector("#swatches").getBoundingClientRect();return cover.bottom<=swatches.top})()',
    )
    assert.equal(results.narrow.coverAndSwatchesSeparate, true)
    assert.ok(results.narrow.scrollWidth <= results.narrow.width)
    assert.ok(results.narrow.controlsBottom <= results.narrow.height)
    window.setContentSize(1280, 720)
    await js(
      'document.querySelector("#lyrics").click();document.querySelector("#reference").click()',
    )
    assert.equal(await js('document.querySelector("#reference-dialog").open'), true)
    await capture('reference-dialog')
    await js('document.querySelector("#close-reference").click()')
    assert.equal(await js('document.querySelector("#reference-dialog").open'), false)
    await js('metalDemo.usePreset("lemon");metalDemo.renderer.renderAt(9)')
    await capture('preview')
    // Resume and lose/restore the real WebGL context, preserving current material and palette.
    await js(
      'metalDemo.renderer.setPaused(false);window.loss=document.querySelector("#metal").getContext("webgl2").getExtension("WEBGL_lose_context");loss.loseContext()',
    )
    await wait(100)
    const lostDraws = await js('metalDemo.renderer.getState().draws')
    await wait(150)
    assert.equal(await js('metalDemo.renderer.getState().draws'), lostDraws)
    await js('loss.restoreContext()')
    await wait(300)
    results.restored = await js('metalDemo.renderer.getState()')
    assert.equal(results.restored.lost, false)
    assert.equal(results.restored.error, 0)
    assert.ok(results.restored.draws > lostDraws)
    results.contextRecovery = true
    await js(
      'metalDemo.renderer.setPaused(true);document.querySelector("#clean").click();document.querySelector("#restore").hidden=true',
    )
    window.setContentSize(960, 600)
    await mkdir(join(output, 'frames'), { recursive: true })
    for (let i = 0; i < 48; i++) {
      await js(`metalDemo.renderer.renderAt(${9 + (i * 0.7) / 12})`)
      await capture('frames/' + String(i).padStart(3, '0'))
    }
    results.initialSize = initial.getSize()
    assert.deepEqual(results.errors, [])
  } catch (error) {
    results.failure = String(error.stack || error)
    console.error(error)
    process.exitCode = 1
  } finally {
    await writeFile(join(output, 'verification.json'), JSON.stringify(results, null, 2))
    console.log(JSON.stringify(results))
    window.destroy()
    app.exit(process.exitCode || 0)
  }
})()
