const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')
const sharp = require('sharp')

module.exports = async (win, root, errors) => {
  const js = (code) => win.webContents.executeJavaScript(code)
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const poll = (expression) =>
    js(
      `new Promise((resolve,reject)=>{let n=0;const check=()=>{if(${expression})resolve(true);else if(n++>200)reject(new Error('Timed out: ${expression}'));else setTimeout(check,30)};check()})`,
    )
  const state = () => js('discMaterialDemo.snapshot()')
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const capture = async (name) => {
    await delay(120)
    const image = await win.webContents.capturePage()
    await fs.writeFile(path.join(root, `${name}.png`), image.toPNG())
    return image
  }
  const results = []
  const deadline = setTimeout(() => {
    console.error('Material verification timeout')
    process.exit(1)
  }, 60000)
  try {
    await poll(
      'window.discMaterialDemo && discMaterialDemo.snapshot().ready && discMaterialDemo.snapshot().imagesLoaded',
    )
    await click('#front')
    await poll('!discMaterialDemo.snapshot().framePending')
    const baseline = await js(`(() => {
      const css = document.querySelector('[data-renderer="css"] .cd-disc');
      const gpu = document.querySelector('[data-renderer="glsl"] .cd-disc');
      return {css: getComputedStyle(css,'::after').opacity, gpu:getComputedStyle(gpu,'::after').opacity,
        masks:[css,gpu].map(e=>getComputedStyle(e).maskImage),
        art:[...document.querySelectorAll('.cd-art')].map(e=>({width:e.offsetWidth,height:e.offsetHeight,inset:getComputedStyle(e).inset})),
        canvases:document.querySelectorAll('canvas').length};
    })()`)
    assert.equal(baseline.css, '1', 'Production vinyl layer is missing')
    assert.equal(baseline.gpu, '0', 'CSS coating was not disabled for the shader')
    assert.equal(baseline.masks[0], baseline.masks[1])
    assert.deepEqual(baseline.art[0], baseline.art[1])
    assert.equal(baseline.art[0].width, 392)
    assert.equal(baseline.canvases, 1)
    results.push({ scenario: 'matching-production-geometry-and-coating', baseline })
    const tiltErrors = await js(`[[0,0],[20,0],[-20,0],[0,24],[0,-24],[14,-20]].map(([x,y])=>{
      const v={x:-.45,y:.65,z:1.4};
      const inverse=new DOMMatrix().rotateAxisAngle(1,0,0,x).rotateAxisAngle(0,1,0,y).inverse();
      const expected=inverse.transformPoint(new DOMPoint(v.x,-v.y,v.z,0));
      const rx=x*Math.PI/180,ry=y*Math.PI/180;
      const a={x:v.x,y:Math.cos(rx)*v.y-Math.sin(rx)*v.z,z:Math.sin(rx)*v.y+Math.cos(rx)*v.z};
      const actual={x:Math.cos(ry)*a.x-Math.sin(ry)*a.z,y:a.y,z:Math.sin(ry)*a.x+Math.cos(ry)*a.z};
      return Math.hypot(actual.x-expected.x,actual.y+expected.y,actual.z-expected.z);
    })`)
    assert(
      tiltErrors.every((error) => error < 1e-6),
      'Shader coordinate convention differs from CSS rotation',
    )
    results.push({
      scenario: 'tilt-coordinate-convention-against-browser-matrices',
      maxError: Math.max(...tiltErrors),
    })
    await capture('artwork-front')
    await js('discMaterialDemo.pose(14,-20,18)')
    await capture('artwork-tilted')
    await click('button[data-sample="plain"]')
    await js('discMaterialDemo.pose(0,0,0)')
    const plain = await capture('plain-front')
    const bounds = await js(
      `[...document.querySelectorAll('.cd-disc')].map(e=>{const r=e.getBoundingClientRect();return {left:Math.round(r.left),top:Math.round(r.top),width:Math.round(r.width),height:Math.round(r.height)}})`,
    )
    const buffer = plain.toPNG()
    const metadata = await sharp(buffer).metadata()
    const captureScale = metadata.width / (await js('innerWidth'))
    const crops = await Promise.all(
      bounds.map((b) =>
        sharp(buffer)
          .extract({
            left: Math.round(b.left * captureScale),
            top: Math.round(b.top * captureScale),
            width: Math.round(b.width * captureScale),
            height: Math.round(b.height * captureScale),
          })
          .removeAlpha()
          .raw()
          .toBuffer(),
      ),
    )
    let delta = 0
    for (let i = 0; i < crops[0].length; i++) delta += Math.abs(crops[0][i] - crops[1][i])
    delta /= crops[0].length
    assert(delta > 1, 'Rendered material comparison is indistinguishable')
    results.push({
      scenario: 'actual-rendered-material-difference',
      meanChannelDifference: delta,
      captureScale,
    })
    await js('discMaterialDemo.pose(14,-20,0)')
    await capture('plain-tilted')
    // Real form events, including the range control and both appearance switches.
    await js(
      `document.querySelector('#gloss').value='1.2';document.querySelector('#gloss').dispatchEvent(new Event('input',{bubbles:true}))`,
    )
    assert.equal((await state()).gloss, 1.2)
    await js(
      `document.querySelector('#gloss').value='0.8';document.querySelector('#gloss').dispatchEvent(new Event('input',{bubbles:true}))`,
    )
    await click('button[data-surface="cd"]')
    assert.equal((await state()).surface, 'cd')
    assert.equal(await js('document.querySelector("#grooves").disabled'), true)
    await click('#theme')
    await capture('smooth-dark')
    await click('button[data-surface="vinyl"]')
    await click('button[data-sample="artwork"]')
    await capture('artwork-dark')
    results.push({ scenario: 'controls-themes-and-surface-switches', state: await state() })
    // Confirm the shared clock moves both, then stops when paused.
    await click('#front')
    await click('#spin')
    await delay(100)
    const before = await state()
    await delay(200)
    const moving = await state()
    assert(moving.angle > before.angle)
    const rotations = await js(
      '[...document.querySelectorAll(".cd-art")].map(e=>e.style.transform)',
    )
    assert.equal(rotations[0], rotations[1])
    await click('#spin')
    await poll('!discMaterialDemo.snapshot().framePending')
    const stopped = await state()
    await delay(150)
    assert.equal((await state()).angle, stopped.angle)
    assert.equal((await state()).gl.draws, stopped.gl.draws)
    // Exercise pointer-driven synchronized poses via native input.
    const point = await js(
      `(()=>{const r=document.querySelector('.cd-stage').getBoundingClientRect();return {x:Math.round(r.left+r.width*.82),y:Math.round(r.top+r.height*.25)}})()`,
    )
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    await delay(450)
    const pointer = await state()
    assert(Math.abs(pointer.x) > 1 && Math.abs(pointer.y) > 1)
    assert.equal(
      await js(
        'document.querySelectorAll(".cd-hover")[0].style.transform===document.querySelectorAll(".cd-hover")[1].style.transform',
      ),
      true,
    )
    await click('#reduce')
    await delay(100)
    assert.equal((await state()).reduced, true)
    assert.equal((await state()).framePending, false)
    assert.equal((await state()).x, 0)
    await click('#reduce')
    await click('#front')
    results.push({ scenario: 'synchronized-spin-pointer-pause-and-reduced-motion' })
    const contextExtension = await js(
      `!!document.querySelector('canvas').getContext('webgl').getExtension('WEBGL_lose_context')`,
    )
    if (contextExtension) {
      await js(
        `window.lossExtension=document.querySelector('canvas').getContext('webgl').getExtension('WEBGL_lose_context');lossExtension.loseContext()`,
      )
      await poll('!discMaterialDemo.snapshot().ready')
      assert.equal(
        await js(
          `getComputedStyle(document.querySelector('[data-renderer="glsl"] .cd-disc'),'::after').opacity`,
        ),
        '1',
      )
      await delay(100)
      await js('lossExtension.restoreContext()')
      await poll('discMaterialDemo.snapshot().ready && !discMaterialDemo.snapshot().gl.lost')
      await capture('context-restored')
    }
    results.push({
      scenario: 'webgl-context-loss-fallback-and-restoration',
      supported: contextExtension,
    })
    win.setSize(800, 760)
    await delay(250)
    assert.equal(await js('document.documentElement.scrollWidth > innerWidth'), false)
    assert((await state()).size < 400)
    await capture('compact')
    results.push({ scenario: 'compact-window-without-horizontal-overflow', state: await state() })
    assert.deepEqual(errors, [])
    await fs.writeFile(
      path.join(root, 'verification.json'),
      JSON.stringify({ passed: true, errors, results }, null, 2),
    )
    console.log(JSON.stringify({ passed: true, scenarios: results.length, output: root }))
  } catch (error) {
    await capture('failure')
    throw error
  } finally {
    clearTimeout(deadline)
  }
}
