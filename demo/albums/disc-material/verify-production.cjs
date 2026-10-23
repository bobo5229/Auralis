const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

module.exports = async (win, root, errors) => {
  const output = path.join(root, 'production')
  await fs.mkdir(output, { recursive: true })
  const js = (code) => win.webContents.executeJavaScript(code)
  const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const poll = (expression) =>
    js(
      `new Promise((resolve,reject)=>{let n=0;const check=()=>{if(${expression})resolve(true);else if(n++>200)reject(new Error(${JSON.stringify('Timed out: ')}+${JSON.stringify(expression)}));else setTimeout(check,30)};check()})`,
    )
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click()`)
  const stats = () => js('({...productionMaterial.stats})')
  const capture = async (name) => {
    await delay(100)
    await fs.writeFile(
      path.join(output, `${name}.png`),
      (await win.webContents.capturePage()).toPNG(),
    )
  }
  const enter = async () => {
    await js("document.querySelector('.cd-stage').focus()")
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Enter' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Enter' })
    await poll("document.querySelector('.cd-tracks')?.inert === false")
    await delay(900)
  }
  const coating = () =>
    js(`(()=>{
    const disc=document.querySelector('.cd-position[data-selected="true"] .cd-disc');
    const canvas=disc.querySelector('canvas');
    return {ready:disc.dataset.materialReady,reflection:getComputedStyle(disc,'::before').backgroundImage,
      grooves:getComputedStyle(disc,'::after').opacity,canvasVisible:canvas && getComputedStyle(canvas).visibility,
      width:canvas?.width,transform:disc.style.transform,canvases:document.querySelectorAll('.cd-material-canvas').length};
  })()`)
  const results = []
  const deadline = setTimeout(() => {
    console.error('Production material verification timeout')
    process.exit(1)
  }, 60000)
  try {
    await poll(
      "window.productionMaterial && document.querySelector('.cd-position') && document.querySelector('.cd-stage').getAttribute('aria-busy') === 'false'",
    )
    assert.equal(await js("document.querySelector('.cd-page').offsetWidth"), await js('innerWidth'))
    assert.equal(
      await js("document.querySelector('.cd-page').offsetHeight"),
      await js('innerHeight'),
    )
    assert.equal((await stats()).created, 0)
    await enter()
    await poll('document.querySelector(\'.cd-disc[data-material-ready="true"]\')')
    assert.equal((await stats()).created, 1)
    assert.equal((await coating()).reflection, 'none')
    assert.equal((await coating()).canvases, 1)
    await capture('light-cd')
    results.push({
      scenario: 'lazy-real-page-material-and-native-keyboard-focus',
      state: await coating(),
    })

    await click('.cd-surface-switch button:nth-child(2)')
    await poll('productionMaterial.stats.vinyl === 1')
    assert.equal((await coating()).grooves, '0')
    const initialTilt = (await stats()).tilt
    const point = await js(
      `(()=>{const disc=document.querySelector('.cd-position[data-selected="true"] .cd-disc');const r=disc.getBoundingClientRect();for(const dx of [.22,-.22,.32]){const x=Math.round(r.left+r.width*(.5+dx)),y=Math.round(r.top+r.height*.5);if(document.elementFromPoint(x,y)===disc)return {x,y}}throw Error('No native drag target')})()`,
    )
    win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
    win.webContents.sendInputEvent({ type: 'mouseDown', button: 'right', clickCount: 1, ...point })
    for (let i = 1; i <= 5; i++) {
      win.webContents.sendInputEvent({
        type: 'mouseMove',
        x: point.x + i * 9,
        y: point.y - i * 5,
        modifiers: ['rightButtonDown'],
      })
      await delay(25)
    }
    win.webContents.sendInputEvent({
      type: 'mouseUp',
      button: 'right',
      clickCount: 1,
      x: point.x + 45,
      y: point.y - 25,
    })
    await delay(400)
    assert.notDeepEqual((await stats()).tilt, initialTilt)
    const poseError = await js(
      `(()=>{const text=document.querySelector('.cd-position[data-selected="true"] .cd-disc').style.transform;const angles=['X','Y','Z'].map(axis=>Number(text.match(new RegExp('rotate'+axis+'\\\\(([-.0-9]+)deg'))[1])*Math.PI/180);return Math.max(...angles.map((v,i)=>Math.abs(v-productionMaterial.stats.tilt[i])))})()`,
    )
    assert(poseError < 1e-6)
    await capture('light-vinyl-tilted')
    results.push({
      scenario: 'native-right-drag-matches-real-disc-pose',
      poseError,
      tilt: (await stats()).tilt,
    })

    await click('.cd-theme-toggle')
    await poll('productionMaterial.stats.dark === 1')
    await delay(500) // Let the real theme view transition settle before the capture.
    assert.equal((await coating()).reflection, 'none')
    await capture('dark-vinyl')
    await delay(600)
    const idle = (await stats()).draws
    await delay(200)
    assert.equal((await stats()).draws, idle)
    results.push({ scenario: 'themes-surface-buttons-and-no-idle-draws', draws: idle })

    await js(
      "window.materialLoss=document.querySelector('.cd-material-canvas').getContext('webgl').getExtension('WEBGL_lose_context');materialLoss.loseContext()",
    )
    await poll('!document.querySelector(\'.cd-disc[data-material-ready="true"]\')')
    assert.notEqual((await coating()).reflection, 'none')
    assert.equal((await coating()).grooves, '1')
    assert.equal((await coating()).canvasVisible, 'hidden')
    await capture('context-loss-css')
    await js('materialLoss.restoreContext()')
    await poll('document.querySelector(\'.cd-disc[data-material-ready="true"]\')')
    assert.equal((await coating()).reflection, 'none')
    assert.equal((await stats()).created, 1)
    await capture('context-restored')
    results.push({ scenario: 'actual-webgl-context-loss-css-fallback-and-restoration' })

    await js('productionMaterial.reduced(true)')
    await click('.cd-back')
    await poll("!document.querySelector('.cd-material-canvas')")
    await enter()
    assert.equal((await stats()).created, 1)
    assert.equal((await coating()).ready, 'true')
    win.setSize(1100, 800)
    await delay(250)
    assert((await coating()).width <= 1024)
    assert.equal(await js('document.documentElement.scrollWidth>innerWidth'), false)
    await capture('compact-reduced-motion')
    results.push({
      scenario: 'reduced-motion-reentry-reuses-context-and-resize',
      state: await coating(),
    })

    await js('productionMaterial.leave()')
    await poll("!document.querySelector('.cd-page')")
    assert((await stats()).deleted >= 1)
    const afterDispose = (await stats()).draws
    await delay(150)
    assert.equal((await stats()).draws, afterDispose)
    await js('productionMaterial.unavailable(true);productionMaterial.enter()')
    await poll(
      "document.querySelector('.cd-position') && document.querySelector('.cd-stage').getAttribute('aria-busy') === 'false'",
    )
    await enter()
    await click('.cd-surface-switch button:nth-child(2)')
    const fallback = await coating()
    assert.notEqual(fallback.ready, 'true')
    assert.notEqual(fallback.reflection, 'none')
    assert.equal(fallback.grooves, '1')
    assert.equal(fallback.canvases, 0)
    assert.equal((await stats()).created, 1)
    await capture('unavailable-css')
    results.push({
      scenario: 'route-disposal-and-unavailable-webgl-css-fallback',
      state: fallback,
      stats: await stats(),
    })
    assert.deepEqual(errors, [])
    await fs.writeFile(
      path.join(output, 'verification.json'),
      JSON.stringify({ passed: true, errors, results }, null, 2),
    )
    console.log(JSON.stringify({ passed: true, scenarios: results.length, output }))
  } catch (error) {
    console.error(
      await js('({html:document.body.innerText,stats:window.productionMaterial?.stats})'),
    )
    await capture('failure')
    throw error
  } finally {
    clearTimeout(deadline)
  }
}
