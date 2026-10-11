/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')

if (!process.versions.electron) {
  const { spawn } = require('node:child_process')
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {
    env,
    windowsHide: true,
    stdio: 'inherit',
  })
  const timeout = process.argv.includes('--preview') ? null : setTimeout(() => child.kill(), 55000)
  child.on('error', (error) => {
    console.error(error)
    process.exitCode = 1
  })
  child.on('exit', (code) => {
    if (timeout) clearTimeout(timeout)
    process.exitCode = code ?? 1
  })
} else {
  const { app, BrowserWindow } = require('electron')
  const preview = process.argv.includes('--preview')
  const output = path.join(__dirname, 'captures')
  const results = { errors: [] }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  let win
  ;(async () => {
    app.setPath('userData', await fs.mkdtemp(path.join(os.tmpdir(), 'auralis-metal-refinement-')))
    await app.whenReady()
    win = new BrowserWindow({
      title: 'Auralis · 液态金属反射迭代',
      width: 1520,
      height: 1100,
      minWidth: 480,
      minHeight: 600,
      show: preview,
      autoHideMenuBar: true,
      backgroundColor: '#12110f',
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: !preview,
        backgroundThrottling: preview,
      },
    })
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') results.errors.push(event.message)
    })
    await win.loadFile(path.join(__dirname, 'index.html'))
    if (preview) {
      assert.equal(
        await win.webContents.executeJavaScript('Boolean(window.metalRefinement?.ready)'),
        true,
        'Prototype initialization failed',
      )
      console.log('METAL_REFINEMENT_PREVIEW_READY')
      return
    }
    await fs.mkdir(output, { recursive: true })
    const js = (code) => win.webContents.executeJavaScript(code)
    const capture = async (name) => {
      win.webContents.invalidate()
      await wait(120)
      await fs.writeFile(
        path.join(output, name + '.png'),
        (await win.webContents.capturePage()).toPNG(),
      )
    }
    const set = (id, value) =>
      js(
        `(() => {const input=document.getElementById(${JSON.stringify(id)});input.value=${JSON.stringify(String(value))};input.dispatchEvent(new Event(input.tagName==='SELECT'?'change':'input',{bubbles:true}));})()`,
      )
    const stats = () =>
      js(`metalRefinement.readFrames().map(pixels => {
      const values=[];let sum=0,min=255,max=0,signature=0;
      for(let i=0;i<pixels.length;i+=4){const v=.2126*pixels[i]+.7152*pixels[i+1]+.0722*pixels[i+2];values.push(v);sum+=v;min=Math.min(min,v);max=Math.max(max,v);signature=(signature+pixels[i]*(i%97+1)+pixels[i+1]*(i%89+1))%2147483647;}
      values.sort((a,b)=>a-b);
      return {min,max,mean:sum/values.length,p05:values[Math.floor(values.length*.05)],p95:values[Math.floor(values.length*.95)],signature};
    })`)
    for (let i = 0; i < 80; i++) {
      if (await js('Boolean(window.metalRefinement?.ready)')) break
      await wait(100)
    }
    assert.equal(
      await js('Boolean(window.metalRefinement?.ready)'),
      true,
      await js('document.querySelector("#error").textContent'),
    )
    assert.equal(
      await js(
        'document.querySelector("#reference-image").complete && document.querySelector("#reference-image").naturalWidth>0',
      ),
      true,
    )
    const started = await js('metalRefinement.getState()')
    if (started.paused) await js('document.querySelector("#pause").click()')
    await wait(450)
    assert.ok((await js('metalRefinement.getState().time')) > started.time)
    results.animation = true
    await js('metalRefinement.renderAt(9)')
    await wait(160)
    const paused = await js('metalRefinement.getState()')
    await wait(200)
    assert.deepEqual(
      (await js('metalRefinement.getState()')).surfaces.map((x) => x.draws),
      paused.surfaces.map((x) => x.draws),
    )
    assert.deepEqual(paused.surfaces[0].size, paused.surfaces[1].size)
    results.pause = true
    results.alloy = await stats()
    results.sizes = paused.surfaces.map((x) => x.size)
    for (const state of paused.surfaces) assert.equal(state.error, 0)
    await capture('comparison-alloy')

    await set('mirror', 0)
    await set('detail', 0)
    results.zeroExtensionDifference = await js(`(() => {
      const [a,b]=metalRefinement.readFrames();let max=0;for(let i=0;i<a.length;i++)max=Math.max(max,Math.abs(a[i]-b[i]));return max;
    })()`)
    assert.ok(results.zeroExtensionDifference <= 1, 'Zero extension must match production output')
    await set('mirror', 1)
    const first = await stats()
    await set('depth', 0.4)
    const changed = await stats()
    assert.equal(changed[0].signature, first[0].signature, 'Refinement settings altered baseline')
    assert.notEqual(
      changed[1].signature,
      first[1].signature,
      'Depth slider did not affect reflection',
    )
    await set('depth', 0.85)
    await set('preset', 'silver')
    results.silver = await stats()
    assert.ok(
      results.silver[1].p05 < results.silver[0].p05 - 20,
      'Mirror environment must retain darker regions',
    )
    assert.ok(
      results.silver[1].max - results.silver[1].min >
        results.silver[0].max - results.silver[0].min + 20,
      'Mirror luminance range must expand',
    )
    assert.ok(
      results.silver[1].max > 230 && results.silver[1].mean > 15,
      'Missing highlights or empty frame',
    )
    await capture('reflection-only-silver')
    await js('metalRefinement.renderAt(17)')
    const later = await stats()
    assert.notEqual(later[0].signature, results.silver[0].signature)
    assert.notEqual(later[1].signature, results.silver[1].signature)
    results.motion = true
    await set('folds', 1.6)
    await set('roughness', 0.07)
    await set('speed', 1.25)
    await set('detail', 0.65)
    const controls = (await js('metalRefinement.getState()')).material
    assert.equal(controls.folds, 1.6)
    assert.equal(controls.roughness, 0.07)
    assert.equal(controls.speed, 1.25)
    assert.equal(controls.detail, 0.65)
    results.controls = true
    await js('document.querySelector("#reset").click()')
    const reset = await js('metalRefinement.getState()')
    assert.equal(reset.time, 9)
    assert.equal(reset.material.detail, 0.32)
    assert.equal(reset.material.speed, 0.7)
    assert.equal(reset.paused, true)
    results.reset = true

    for (const preset of ['espresso', 'rose', 'dark']) {
      await set('preset', preset)
      const sample = await stats()
      assert.ok(sample[1].max - sample[1].min > 25 && sample[1].mean > 5)
      results[preset] = sample
      if (preset === 'espresso') await capture('comparison-blue-brown')
    }
    await js(
      'metalRefinement.loadCover(new File([new Uint8Array([1,2,3])],"broken.png",{type:"image/png"}))',
    )
    assert.equal(await js('document.querySelector("#error").hidden'), false)
    const image = (await fs.readFile(path.join(__dirname, 'assets', 'reference.png'))).toString(
      'base64',
    )
    const file = `new File([Uint8Array.from(atob(${JSON.stringify(image)}),c=>c.charCodeAt(0))],"reference.png",{type:"image/png"})`
    await js(`metalRefinement.loadCover(${file})`)
    const uploaded = (await js('metalRefinement.getState()')).palette
    assert.ok(uploaded.length > 1 && uploaded.length <= 6)
    assert.ok(Math.abs(uploaded.reduce((sum, x) => sum + x.weight, 0) - 1) < 0.0001)
    assert.equal(await js('document.querySelector("#error").hidden'), true)
    results.upload = uploaded.map(({ color, weight }) => ({ color, weight }))
    await js(
      `(() => {const pending=metalRefinement.loadCover(${file});const preset=document.querySelector('#preset');preset.value='rose';preset.dispatchEvent(new Event('change'));return pending;})()`,
    )
    assert.equal((await js('metalRefinement.getState()')).palette[0].color, '#b45e67')
    results.uploadRace = true
    await set('tint', '#ffffff')
    assert.equal((await js('metalRefinement.getState()')).palette.length, 1)
    await js(
      'document.querySelector("#reset").click();document.querySelector("[data-view=reference]").click()',
    )
    assert.equal(
      await js('getComputedStyle(document.querySelector("#reference-panel")).display'),
      'block',
    )
    assert.equal(
      await js('getComputedStyle(document.querySelector("#baseline-panel")).display'),
      'none',
    )
    await capture('reference-comparison')
    await js(
      'document.querySelector("[data-view=refined]").click();document.querySelector("#lyrics").click()',
    )
    assert.equal(await js('document.querySelector("#refined-panel .sample").hidden'), false)
    await capture('lyrics-preview')
    await js('document.querySelector("#lyrics").click();document.querySelector("#clean").click()')
    assert.equal(await js('document.activeElement.id'), 'restore')
    assert.ok(
      Math.abs(
        await js('document.querySelector("#refined").getBoundingClientRect().height-innerHeight'),
      ) < 1,
    )
    await capture('mirror-fullscreen')
    await js('document.dispatchEvent(new KeyboardEvent("keydown",{key:"Escape",bubbles:true}))')
    assert.equal(await js('document.body.classList.contains("clean")'), false)
    assert.equal(await js('document.activeElement.id'), 'clean')
    results.views = true

    await js('document.querySelector("[data-view=both]").click()')
    for (const [width, height, name] of [
      [1100, 850, 'medium'],
      [600, 1000, 'narrow'],
    ]) {
      win.setContentSize(width, height)
      await wait(200)
      assert.equal(await js('document.documentElement.scrollWidth>innerWidth'), false)
      const state = await js('metalRefinement.getState()')
      assert.deepEqual(state.surfaces[0].size, state.surfaces[1].size)
      await capture(name)
    }
    results.layout = true
    win.setContentSize(1520, 1050)
    await wait(200)
    win.webContents.debugger.attach('1.3')
    await js('document.querySelector("#pause").click()')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await wait(100)
    assert.equal(await js('metalRefinement.getState().paused'), true)
    const reduced = (await js('metalRefinement.getState()')).surfaces.map((x) => x.draws)
    await wait(150)
    assert.deepEqual(
      (await js('metalRefinement.getState()')).surfaces.map((x) => x.draws),
      reduced,
    )
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    })
    win.webContents.debugger.detach()
    results.reducedMotion = true

    const supported = await js(
      `(() => {window.testLoss=document.querySelector('#refined').getContext('webgl2').getExtension('WEBGL_lose_context');return Boolean(window.testLoss);})()`,
    )
    assert.equal(supported, true)
    await js('window.testLoss.loseContext()')
    await wait(180)
    assert.equal(await js('metalRefinement.getState().surfaces[1].lost'), true)
    await js('window.testLoss.restoreContext()')
    for (let i = 0; i < 40; i++) {
      if (!(await js('metalRefinement.getState().surfaces[1].lost'))) break
      await wait(100)
    }
    assert.equal(await js('metalRefinement.getState().surfaces[1].lost'), false)
    assert.equal(await js('metalRefinement.getState().surfaces[1].error'), 0)
    assert.equal(await js('document.querySelector("#error").hidden'), true)
    results.contextRestore = true
    results.renderer = await js(
      `(() => {const gl=document.querySelector('#refined').getContext('webgl2');const ext=gl.getExtension('WEBGL_debug_renderer_info');return gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER);})()`,
    )
    assert.deepEqual(results.errors, [])
    await fs.writeFile(path.join(output, 'verification.json'), JSON.stringify(results, null, 2))
    console.log('METAL_REFINEMENT_CHECK_OK ' + JSON.stringify(results))
    win.destroy()
    app.quit()
  })().catch(async (error) => {
    console.error(error, results.errors)
    if (win && !win.isDestroyed()) {
      await fs.mkdir(output, { recursive: true })
      await fs.writeFile(
        path.join(output, 'failure.png'),
        (await win.webContents.capturePage()).toPNG(),
      )
    }
    app.exit(1)
  })
  app.on('window-all-closed', () => app.quit())
}
