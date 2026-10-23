const assert = require('node:assert/strict')
const fs = require('node:fs/promises')
const path = require('node:path')

module.exports = async (win, root, errors) => {
  const js = (code) => win.webContents.executeJavaScript(code)
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
  const poll = (expression) =>
    js(
      `new Promise((resolve,reject)=>{let n=0;const p=()=>${expression}?resolve():n++>400?reject('poll timeout: '+JSON.stringify(demo.state())):setTimeout(p,20);p()})`,
    )
  const results = []
  const snapshot = () =>
    js(
      `JSON.parse(JSON.stringify((()=>{const s=document.querySelector('.albums-scroll');return {state:demo.state(),mounted:s.querySelectorAll('.album-card').length,scroll:s.scrollTop,columns:s.querySelector('.albums-grid-row')?.children.length,layers:document.querySelectorAll('.album-grid-transition-item').length}})()))`,
    )
  const settle = async () => {
    await poll('window.demo && !demo.state().busy && !demo.state().animating')
    await wait(80)
  }
  try {
    await poll('window.demo && !demo.state().busy')
    await js('document.fonts.ready.then(()=>true)')
    await js('demo.setDuration(500)')
    for (const count of [1000, 5000, 20000, 100000]) {
      await js(`demo.changeScale(${count})`)
      await settle()
      for (const fraction of [0, 0.5]) {
        await js(`demo.jump(${fraction})`)
        await wait(150)
        console.log('verify grid', count, fraction)
        const before = await snapshot()
        await js('void demo.toggle()')
        await poll(
          'document.querySelectorAll("[data-side=to].album-grid-transition-item").length>0 && [...document.querySelectorAll("[data-side=to].album-grid-transition-item")].some(e=>e.getAnimations().length>0)',
        )
        const during = await js(
          `(()=>{const wrappers=[...document.querySelectorAll('.album-grid-transition-item')];return {durations:[...new Set(wrappers.flatMap(e=>e.getAnimations({subtree:true}).map(a=>a.effect.getTiming().duration)))],moving:wrappers.filter(e=>getComputedStyle(e).transform!=='none').length,textScaled:wrappers.flatMap(e=>[...e.querySelectorAll('.album-card-meta')]).some(e=>{const m=new DOMMatrixReadOnly(getComputedStyle(e).transform);return Math.abs(m.a-1)>.001||Math.abs(m.d-1)>.001}),nodes:wrappers.length}})()`,
        )
        assert.deepEqual(during.durations, [500])
        assert(during.moving > 0)
        assert.equal(during.textScaled, false)
        assert(during.nodes < 100)
        if (count === 1000 && fraction === 0)
          await fs.writeFile(
            path.join(root, 'production-mid.png'),
            (await win.webContents.capturePage()).toPNG(),
          )
        await settle()
        const after = await snapshot()
        assert.equal(after.layers, 0)
        await js('demo.toggle()')
        await settle()
        const returned = await snapshot()
        assert.equal(returned.layers, 0)
        assert.equal(returned.state.panelOpen, before.state.panelOpen)
        assert(Math.abs(returned.scroll - before.scroll) < 1)
        assert(Math.max(before.mounted, after.mounted, returned.mounted) < 100)
        results.push({
          scenario: 'fixed-duration-real-grid',
          count,
          fraction,
          before,
          after,
          returned,
          during,
        })
      }
    }
    await js('demo.changeScale(1000)')
    await settle()
    await js('demo.jump(0)')
    await wait(120)
    await js('void demo.toggle()')
    await wait(70)
    const reversal = await js(
      `(()=>{const items=[...document.querySelectorAll('[data-side=to].album-grid-transition-item')];const e=items.find(e=>new DOMMatrixReadOnly(getComputedStyle(e).transform).m41<-10)||items[0];const key=e.dataset.albumKey;const before=e.querySelector('.album-card-cover').getBoundingClientRect();void demo.toggle();const f=[...document.querySelectorAll('[data-side=from].album-grid-transition-item')].find(e=>e.dataset.albumKey===key);const after=f.querySelector('.album-card-cover').getBoundingClientRect();return {key,before:{left:before.left,top:before.top,width:before.width},after:{left:after.left,top:after.top,width:after.width}}})()`,
    )
    assert(Math.abs(reversal.before.left - reversal.after.left) < 1, JSON.stringify(reversal))
    assert(Math.abs(reversal.before.top - reversal.after.top) < 1, JSON.stringify(reversal))
    assert(Math.abs(reversal.before.width - reversal.after.width) < 1, JSON.stringify(reversal))
    await settle()
    assert.equal((await snapshot()).layers, 0)
    results.push({ scenario: 'reversal-preserves-painted-artwork', ...reversal })
    await js('demo.setReduced(true);demo.toggle()')
    await settle()
    assert.equal((await snapshot()).state.latest.reduced, true)
    assert.equal((await snapshot()).layers, 0)
    await js('demo.setReduced(false);void demo.toggle()')
    await wait(60)
    await js(
      'document.querySelector(".albums-scroll").dispatchEvent(new WheelEvent("wheel",{deltaY:100,bubbles:true}))',
    )
    await settle()
    assert.equal((await snapshot()).layers, 0)
    results.push({ scenario: 'reduced-and-scroll-cancel' })
    await js('void demo.toggle()')
    await wait(70)
    win.setSize(1100, 780)
    await settle()
    assert.equal((await snapshot()).layers, 0)
    await js('document.querySelector(".demo-metrics button").click()')
    await wait(120)
    await js('demo.toggle()')
    await settle()
    await fs.writeFile(
      path.join(root, 'production-light.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    const focusKey = await js(
      `(()=>{const e=[...document.querySelectorAll('.demo-stage .album-card')].find(e=>e.getBoundingClientRect().top>document.querySelector('.albums-scroll').getBoundingClientRect().top);e.querySelector('.cover-stage').focus();return e.dataset.albumKey})()`,
    )
    await js('demo.toggle()')
    await settle()
    assert.equal(
      await js('document.activeElement.closest(".album-card")?.dataset.albumKey'),
      focusKey,
    )
    results.push({ scenario: 'resize-theme-focus', focusKey })
    assert.equal(await js('!!window.demoError'), false)
    assert.deepEqual(errors, [])
    await fs.writeFile(
      path.join(root, 'production-results.json'),
      JSON.stringify({ passed: true, errors, results }, null, 2),
    )
    console.log(
      JSON.stringify({
        passed: true,
        scenarios: results.length,
        productionLayer: true,
        artifacts: root,
      }),
    )
  } catch (error) {
    await fs.writeFile(
      path.join(root, 'production-failure.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    throw error
  }
}
