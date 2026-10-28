const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

module.exports = async (win, root, errors) => {
  const timer = setTimeout(() => {
    console.error('Demo verification timeout')
    process.exit(1)
  }, 120000)
  const js = async (code) => {
    try {
      return await win.webContents.executeJavaScript(code)
    } catch (e) {
      console.error('JS failed:', code)
      throw e
    }
  }
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const poll = (expression) =>
    js(
      `new Promise((resolve,reject)=>{let n=0;const p=()=>${expression}?resolve():n++>300?reject('poll timeout'):setTimeout(p,20);p()})`,
    )
  const results = []
  const snapshot = () =>
    js(
      `(()=>{const s=document.querySelector('.albums-scroll'),r=s.getBoundingClientRect();return JSON.parse(JSON.stringify({state:demo.state(),mounted:s.querySelectorAll('.album-card').length,scroll:s.scrollTop,height:s.scrollHeight,columns:s.querySelector('.albums-grid-row')?.children.length,visible:[...s.querySelectorAll('.album-card')].filter(e=>{const a=e.getBoundingClientRect();return a.bottom>r.top&&a.top<r.bottom}).map(e=>e.dataset.albumKey),layers:document.querySelectorAll('.album-grid-transition-item').length}))})()`,
    )
  const settle = async () => {
    await poll('window.demo && !demo.state().busy && !demo.state().animating')
    await wait(80)
  }
  const toggle = async () => {
    await js('demo.toggle()')
    await settle()
  }
  try {
    await poll('window.demo && !demo.state().busy')
    await js('document.fonts.ready.then(()=>true)')
    for (const count of [1000, 5000, 20000, 100000]) {
      await js(`demo.changeScale(${count})`)
      await settle()
      let mountedMax = 0
      for (const fraction of [0, 0.5]) {
        await js(`demo.jump(${fraction})`)
        await wait(120)
        for (const mode of ['fade', 'flip']) {
          await js(`demo.setMode('${mode}')`)
          const before = await snapshot()
          await toggle()
          const after = await snapshot()
          await toggle()
          const returned = await snapshot()
          mountedMax = Math.max(mountedMax, before.mounted, after.mounted, returned.mounted)
          assert(
            before.visible.length > 0 && after.visible.length > 0,
            JSON.stringify({ count, fraction, mode, before, after }),
          )
          assert(
            before.visible.some((key) => after.visible.includes(key)),
            'scroll anchor disappeared',
          )
          assert.equal(returned.layers, 0)
          assert.equal(returned.state.panelOpen, before.state.panelOpen)
          assert(
            Math.abs(returned.scroll - before.scroll) < 1,
            JSON.stringify({ count, fraction, before: before.scroll, returned: returned.scroll }),
          )
          assert.equal(await js('!!window.demoError'), false)
          results.push({
            count,
            fraction,
            mode,
            open: after.state.latest,
            close: returned.state.latest,
            mountedMax,
          })
        }
      }
      assert(mountedMax < 100, 'virtualized DOM grew with catalog size')
    }
    // A long transition makes intermediate geometry deterministic to inspect.
    await js('demo.changeScale(1000)')
    await settle()
    await js('demo.jump(0);demo.setMode("flip");demo.setDuration(600);void demo.toggle()')
    await poll('document.querySelectorAll("[data-side=to].album-grid-transition-item").length>0')
    const moving = await js(
      `(()=>{const rows=[...document.querySelectorAll('[data-side=to].album-grid-transition-item')].map(e=>{const m=new DOMMatrixReadOnly(getComputedStyle(e).transform);return {key:e.dataset.albumKey,d:Math.hypot(m.m41,m.m42)}}).sort((a,b)=>b.d-a.d);return rows[0]})()`,
    )
    assert(moving.d > 2, 'no moving matched album at intermediate frame')
    await wait(100)
    const later = await js(
      `(()=>{const e=[...document.querySelectorAll('[data-side=to].album-grid-transition-item')].find(e=>e.dataset.albumKey===${JSON.stringify(moving.key)});const m=new DOMMatrixReadOnly(getComputedStyle(e).transform);return Math.hypot(m.m41,m.m42)})()`,
    )
    assert(later < moving.d, 'album did not travel toward target')
    await fs.writeFile(
      path.join(root, 'flip-middle.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    await settle()
    results.push({ scenario: 'actual-intermediate-movement', moving, later })
    await js('void demo.toggle()')
    await wait(70)
    await js('void demo.toggle()')
    await settle()
    assert.equal((await snapshot()).layers, 0)
    results.push({ scenario: 'quick-reversal-cleanup' })
    await js('demo.setDuration(280);demo.setReduced(true)')
    await toggle()
    assert.equal((await snapshot()).state.latest.reduced, true)
    assert.equal((await snapshot()).layers, 0)
    await js('demo.setReduced(false);void demo.toggle()')
    await wait(50)
    await js(
      'document.querySelector(".albums-scroll").dispatchEvent(new WheelEvent("wheel",{deltaY:160,bubbles:true}))',
    )
    await settle()
    assert.equal((await snapshot()).layers, 0)
    results.push({ scenario: 'reduced-motion-and-scroll-cancellation' })
    await js('document.querySelector(".demo-metrics button").click()')
    await wait(100)
    assert.equal(await js('document.documentElement.dataset.theme'), 'light')
    await fs.writeFile(
      path.join(root, 'demo-light.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.setSize(900, 650)
    await wait(200)
    await toggle()
    assert.equal(await js('document.documentElement.scrollWidth>innerWidth'), false)
    assert.equal((await snapshot()).layers, 0)
    results.push({ scenario: 'theme-and-minimum-window' })
    assert.deepEqual(errors, [])
    await fs.writeFile(
      path.join(root, 'results.json'),
      JSON.stringify({ passed: true, errors, results }, null, 2),
    )
    console.log(JSON.stringify({ passed: true, scenarios: results.length, artifacts: root }))
  } catch (error) {
    await fs.writeFile(
      path.join(root, 'failure.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    throw error
  } finally {
    clearTimeout(timer)
  }
}
