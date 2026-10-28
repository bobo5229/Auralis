/* Isolated UI verification. Never starts the main application or opens its data. */
const fs = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const assert = require('node:assert/strict')

if (!process.versions.electron) {
  const env = { ...process.env }
  delete env.ELECTRON_RUN_AS_NODE
  const child = require('node:child_process').spawn(require('electron'), [__filename], {
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
  const captures = path.join(__dirname, 'captures')
  const errors = []
  let win
  let profile
  const report = {}
  const timeout = setTimeout(() => {
    console.error('Verification exceeded 45 seconds')
    app.exit(1)
  }, 45000)
  ;(async () => {
    profile = await fs.mkdtemp(path.join(os.tmpdir(), 'auralis-palette-demo-'))
    app.setPath('userData', profile)
    await app.whenReady()
    await fs.mkdir(captures, { recursive: true })
    win = new BrowserWindow({
      width: 1540,
      height: 1080,
      show: false,
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        backgroundThrottling: false,
      },
    })
    win.webContents.on('console-message', (e) => {
      if (e.level === 'error') errors.push(e.message)
    })
    const js = (s) => win.webContents.executeJavaScript(s)
    const capture = async (name) => {
      await js('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))')
      await fs.writeFile(
        path.join(captures, name + '.png'),
        (await win.webContents.capturePage()).toPNG(),
      )
    }
    await win.loadFile(path.join(__dirname, 'index.html'))
    await js(
      `new Promise((resolve,reject)=>{const start=Date.now();const check=()=>{if(window.paletteComparison?.ready)resolve(true);else if(Date.now()-start>15000)reject(new Error(document.querySelector('#error').textContent||'Initialization timeout'));else setTimeout(check,50)};check()})`,
    )
    const initial = await js('paletteComparison.getSnapshot()')
    assert.equal(initial.samples.length, 11)
    assert.equal(
      await js('Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0)'),
      true,
    )
    assert.equal(await js('document.querySelectorAll(".algorithm").length'), 3)
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true)
    for (const sample of initial.samples) {
      assert.equal(sample.results.length, 3)
      for (const r of sample.results) {
        assert.ok(r.clusters.reduce((sum, c) => sum + c.weight, 0) <= 1.000001)
        assert.ok(r.adapted.primaryContrast >= 4.5)
        assert.ok(r.adapted.secondaryContrast >= 4.5)
        assert.ok(r.adapted.controlContrast >= 3)
      }
    }
    report.samples = initial.samples.map((s) => ({
      title: s.title,
      results: s.results.map((r) => ({
        id: r.id,
        source: r.source,
        bg: r.adapted.bg,
        weight: r.weight,
      })),
    }))
    await capture('desktop')
    // Test actual file input events, valid/invalid image decoding and readable errors.
    const uploaded = await js(`(async()=>{
      const c=document.createElement('canvas');c.width=c.height=48;const ctx=c.getContext('2d');ctx.fillStyle='#B02032';ctx.fillRect(0,0,48,48);
      const blob=await new Promise(r=>c.toBlob(r));const transfer=new DataTransfer();transfer.items.add(new File([blob],'solid-red.png',{type:'image/png'}));
      const input=document.querySelector('#upload');input.files=transfer.files;input.dispatchEvent(new Event('change'));
      await new Promise((r,j)=>{const start=Date.now();const check=()=>{if(!input.disabled)r();else if(Date.now()-start>5000)j(new Error('upload timeout'));else setTimeout(check,20)};check()});
      return paletteComparison.getSnapshot();
    })()`)
    assert.equal(uploaded.samples.length, 12)
    assert.equal(uploaded.selected, 11)
    assert.equal(await js('document.querySelector("#error").hidden'), true)
    for (const r of uploaded.samples[11].results)
      assert.deepEqual(r.source, { r: 176, g: 32, b: 50 })
    await js(
      `paletteComparison.loadFiles([new File([new Uint8Array([1,2,3])],'broken.png',{type:'image/png'})])`,
    )
    assert.equal(await js('document.querySelector("#error").hidden'), false)
    assert.equal((await js('paletteComparison.getSnapshot()')).samples.length, 12)
    // A fully transparent image must fail gracefully without adding a sample.
    await js(
      `(async()=>{const c=document.createElement('canvas');c.width=c.height=32;const b=await new Promise(r=>c.toBlob(r));await paletteComparison.loadFiles([new File([b],'empty.png',{type:'image/png'})])})()`,
    )
    assert.match(await js('document.querySelector("#error").textContent'), /不透明像素/)
    assert.equal((await js('paletteComparison.getSnapshot()')).samples.length, 12)
    report.upload = 'valid / invalid / transparent: passed'
    // Determinism and a neutral input are external requirements, not implementation details.
    const checks = await js(`(()=>{
      const p=new Uint8ClampedArray(48*48*4);for(let i=0;i<p.length;i+=4){p[i]=((i/4)%3)*80;p[i+1]=80;p[i+2]=180;p[i+3]=255}
      const first=paletteComparison.extractAll(p),second=paletteComparison.extractAll(p);
      return {same:JSON.stringify(first)===JSON.stringify(second),neutral:paletteComparison.getSnapshot().samples.find(s=>s.id==='neutral').results};
    })()`)
    assert.equal(checks.same, true)
    for (const r of checks.neutral) {
      const bg = r.adapted.bg
      assert.ok(Math.max(bg.r, bg.g, bg.b) - Math.min(bg.r, bg.g, bg.b) <= 1)
    }
    // Every sample at slider extremes: actual rounded foregrounds satisfy the declared ratios.
    for (const [l, c] of [
      [0.24, 0.02],
      [0.44, 0.12],
    ]) {
      await js(
        `document.querySelector('#lightness').value='${l}';document.querySelector('#chroma').value='${c}';document.querySelector('#lightness').dispatchEvent(new Event('input'))`,
      )
      const state = await js('paletteComparison.getSnapshot()')
      for (const s of state.samples)
        for (const r of s.results) {
          assert.ok(r.adapted.primaryContrast >= 4.5)
          assert.ok(r.adapted.secondaryContrast >= 4.5)
          assert.ok(r.adapted.controlContrast >= 3)
          for (const v of Object.values(r.adapted.bg))
            assert.ok(Number.isInteger(v) && v >= 0 && v <= 255)
        }
    }
    report.contrast = 'all samples at defaults and both slider extremes: passed'
    await js(
      `document.querySelector('#reset').click();document.querySelector('[data-sample="1"]').click()`,
    )
    assert.equal((await js('paletteComparison.getSnapshot()')).selected, 1)
    assert.equal((await js('paletteComparison.getSnapshot()')).lightness, 0.34)
    await capture('post')
    await js(`document.querySelector('[data-focus="1"]').click()`)
    assert.equal(await js('document.querySelector("#focus").open'), true)
    const focusStyles = await js(
      `(()=>{const s=getComputedStyle(document.querySelector('#focus .player'));return {bg:s.backgroundColor,image:document.querySelector('#focus .cover').naturalWidth}})()`,
    )
    assert.ok(focusStyles.image > 0)
    await js(`document.querySelector('#next-algorithm').click()`)
    assert.match(await js('document.querySelector("#focus-label").textContent'), /OKLab K-means/)
    await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Left' })
    await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Left' })
    await js('new Promise(r=>setTimeout(r,40))')
    assert.match(await js('document.querySelector("#focus-label").textContent'), /调整选色后的 Wu/)
    await capture('focus')
    await win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    await win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await js('new Promise(r=>setTimeout(r,80))')
    assert.equal(await js('document.querySelector("#focus").open'), false)
    await js(`document.querySelector('#overview-view').click()`)
    assert.equal(await js('document.querySelectorAll(".overview-color").length'), 36)
    await capture('overview')
    await js(
      `document.querySelector('[data-overview-sample="2"][data-overview-algorithm="2"]').click()`,
    )
    assert.equal(await js('document.querySelector("#focus").open'), true)
    assert.match(
      await js('document.querySelector("#focus-label").textContent'),
      /OKLab K-means.*Feel My Rhythm/,
    )
    await js(
      `document.querySelector('#close-focus').click();document.querySelector('#compare-view').click();document.querySelector('[data-sample="0"]').click();document.querySelector('#error').hidden=true`,
    )
    win.setContentSize(1024, 920)
    await capture('compact')
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true)
    win.setContentSize(540, 980)
    await capture('narrow')
    assert.equal(await js('document.documentElement.scrollWidth<=innerWidth'), true)
    await js(`document.querySelector('[data-focus="0"]').click()`)
    await capture('narrow-focus')
    assert.equal(await js('document.querySelector("#focus").scrollWidth<=innerWidth'), true)
    // Deliver a clean overview capture, without the local files used by the tests.
    await win.loadFile(path.join(__dirname, 'index.html'))
    await js(
      `new Promise(r=>{const check=()=>window.paletteComparison?.ready?r():setTimeout(check,20);check()})`,
    )
    win.setContentSize(1540, 1080)
    await js(`document.querySelector('#overview-view').click()`)
    await capture('overview')
    assert.deepEqual(errors, [])
    report.ui =
      'selection / settings / reset / overview / focus / Escape / 1540, 1024, 540 widths: passed'
    report.errors = errors
    await fs.writeFile(path.join(captures, 'verification.json'), JSON.stringify(report, null, 2))
    console.log(
      JSON.stringify(
        {
          samples: initial.samples.length,
          upload: report.upload,
          contrast: report.contrast,
          ui: report.ui,
          errors,
        },
        null,
        2,
      ),
    )
    clearTimeout(timeout)
    win.destroy()
    app.quit()
  })().catch(async (e) => {
    console.error(e, errors)
    if (win && !win.isDestroyed())
      await fs
        .writeFile(
          path.join(captures, 'failure.png'),
          (await win.webContents.capturePage()).toPNG(),
        )
        .catch(() => {})
    clearTimeout(timeout)
    app.exit(1)
  })
}
