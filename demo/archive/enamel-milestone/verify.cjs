// Isolated rendering check; never loads the player's entry point or user data.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
app.setPath('userData', path.join(app.getPath('temp'), 'auralis-enamel-prototype-check'))
const output = process.env.BADGE_CHECK_OUTPUT || app.getPath('temp')
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      show: false,
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        backgroundThrottling: false,
        offscreen: true,
      },
    })
    const errors = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    await win.loadFile(path.join(__dirname, 'index.html'))
    win.webContents.setFrameRate(60)
    win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setFocusEmulationEnabled', {
      enabled: true,
    })
    await win.webContents.executeJavaScript('document.fonts.ready')
    await pause(500)
    const capture = async (name, rect) =>
      fs.writeFileSync(
        path.join(output, name.replace('enamel-', 'enamel-award-ink-restored-')),
        (await win.webContents.capturePage(rect)).toPNG(),
      )
    await capture('enamel-desktop.png')
    const stageRect = await win.webContents.executeJavaScript(
      `(() => {const r=document.querySelector('#stage').getBoundingClientRect();return {x:Math.round(r.x),y:Math.round(r.y),width:Math.round(r.width),height:Math.round(r.height)}})()`,
    )
    await capture('enamel-detail.png', stageRect)
    for (const size of [96, 160]) {
      await win.webContents.executeJavaScript(
        `document.querySelector('#badge').style.width='${size}px';document.querySelector('#badge').style.height='${(size * 370) / 330}px'`,
      )
      await pause(250)
      await capture(`enamel-size-${size}.png`, stageRect)
    }
    await win.webContents.executeJavaScript(
      `document.querySelector('#badge').style.removeProperty('width');document.querySelector('#badge').style.removeProperty('height')`,
    )
    for (const color of ['green', 'amber']) {
      await win.webContents.executeJavaScript(
        `document.querySelector('[data-color=${color}]').click()`,
      )
      await pause(100)
      await capture(`enamel-${color}.png`, stageRect)
    }
    await win.webContents.executeJavaScript(`document.querySelector('[data-color=blue]').click()`)
    const checks = await win.webContents.executeJavaScript(`(() => {
    const assert=(condition,message)=>{if(!condition)throw Error(message)};
    assert(document.querySelectorAll('.layer').length===5,'Five layers');
    const stage=document.querySelector('#stage'), badge=document.querySelector('#badge');
    stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));
    assert(badge.style.getPropertyValue('--ry')==='-10deg','Keyboard tilt');
    document.querySelector('#reset').click();assert(badge.style.getPropertyValue('--ry')==='-13deg','Reset');
    for(const color of ['green','amber','blue']){document.querySelector('[data-color='+color+']').click();assert(document.body.dataset.color===color,'Color switch');}
    document.querySelector('[data-view=exploded]').click();assert(badge.classList.contains('exploded'),'Exploded view');
    return {layers:5,keyboard:true,reset:true,palettes:3,exploded:true,overflow:document.documentElement.scrollWidth>innerWidth};
  })()`)
    await pause(1100)
    await capture('enamel-exploded.png')
    await win.webContents.executeJavaScript(`document.querySelector('#replay').click()`)
    const awardStart = Date.now()
    const at = async (ms) => pause(Math.max(0, awardStart + ms - Date.now()))
    await at(260)
    await capture('enamel-outline.png')
    checks.backFirst = await win.webContents.executeJavaScript(`(() => {
      const el=document.querySelector('.award-badge');
      return new DOMMatrix(getComputedStyle(el).transform).m33 < -.7 &&
        !!el.querySelector('.award-back') && el.querySelectorAll('.award-side').length === 96 &&
        getComputedStyle(el.querySelector('.layer')).backfaceVisibility === 'hidden';
    })()`)
    await at(700)
    checks.badgeFirst = await win.webContents.executeJavaScript(`(() => {
      const dialog = document.querySelector('#award');
      const rect = document.querySelector('.award-object').getBoundingClientRect();
      const ids = [...document.querySelectorAll('[id]')].map(el => el.id);
      return dialog.open && dialog.dataset.phase === 'enter' &&
        getComputedStyle(document.querySelector('.award-panel')).visibility === 'hidden' &&
        document.querySelector('#award-copy').inert &&
        Math.abs(rect.x + rect.width / 2 - innerWidth / 2) < 1 &&
        Math.abs(rect.y + rect.height / 2 - innerHeight / 2) < 1 &&
        new Set(ids).size === ids.length;
    })()`)
    await capture('enamel-enter.png')
    checks.materialSequence = await win.webContents.executeJavaScript(`(() => {
      const surfaces = [...document.querySelectorAll('.award-badge .layer')];
      return Number(getComputedStyle(surfaces[0]).opacity) > Number(getComputedStyle(surfaces[3]).opacity) &&
        document.querySelector('.award-metal-sweep').getAnimations().length > 0 &&
        document.querySelector('.award-number-sweep').getAnimations().length > 0;
    })()`)
    await at(1012)
    await capture('enamel-side.png')
    await at(1550)
    await capture('enamel-materials.png')
    await at(2350)
    await capture('enamel-afterglow.png')
    await at(2750)
    await capture('enamel-ink.png')
    checks.inkBeforeCopy = await win.webContents.executeJavaScript(
      `document.querySelector('#award').dataset.phase === 'ink' && document.querySelector('#award-copy').inert && document.querySelector('.ink-spread').getAnimations().length > 0`,
    )
    await at(3050)
    await capture('enamel-ink-expanding.png')
    await at(4050)
    await capture('enamel-ready.png')
    checks.replay = await win.webContents.executeJavaScript(
      `document.querySelector('#award').dataset.phase === 'ready' && document.activeElement.id === 'award-collect'`,
    )
    checks.motionSettled = await win.webContents.executeJavaScript(
      `document.querySelector('.award-badge').getAnimations({subtree:true}).length === 0 && getComputedStyle(document.querySelector('.award-number-sweep')).opacity === '0'`,
    )
    checks.panelSettled = await win.webContents.executeJavaScript(
      `document.querySelector('.award-panel').getAnimations({subtree:true}).length === 0 && getComputedStyle(document.querySelector('.ink-edge')).filter === 'none'`,
    )
    checks.frontSettled = await win.webContents.executeJavaScript(
      `new DOMMatrix(getComputedStyle(document.querySelector('.award-badge')).transform).m33 > .99`,
    )
    await win.webContents.executeJavaScript(`document.querySelector('#award-again').click()`)
    checks.restart = await win.webContents.executeJavaScript(
      `document.querySelector('#award').dataset.phase === 'enter' && document.querySelector('#award-copy').inert`,
    )
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyDown',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    })
    await win.webContents.debugger.sendCommand('Input.dispatchKeyEvent', {
      type: 'keyUp',
      key: 'Escape',
      code: 'Escape',
      windowsVirtualKeyCode: 27,
    })
    await pause(100)
    checks.escape = await win.webContents.executeJavaScript(
      `!document.querySelector('#award').open && document.activeElement.id === 'replay' && document.body.style.overflow !== 'hidden'`,
    )
    if (!checks.escape)
      console.log(
        'Escape diagnostics:',
        await win.webContents.executeJavaScript(
          `({open:document.querySelector('#award').open,focus:document.activeElement.id,overflow:document.body.style.overflow})`,
        ),
      )
    win.setContentSize(390, 844)
    await win.webContents.executeJavaScript(`document.querySelector('#replay').click()`)
    await pause(4050)
    await capture('enamel-mobile-ready.png')
    checks.mobileAwardFits = await win.webContents.executeJavaScript(
      `(() => {const r=document.querySelector('#award-copy').getBoundingClientRect();return r.bottom <= innerHeight && r.left >= 0 && r.right <= innerWidth})()`,
    )
    await win.webContents.executeJavaScript(`document.querySelector('#award-collect').click()`)
    await pause(100)
    checks.collect = await win.webContents.executeJavaScript(
      `!document.querySelector('#award').open && document.querySelector('#status').textContent.includes('已收下')`,
    )
    await pause(300)
    await capture('enamel-mobile.png')
    checks.mobileOverflow = await win.webContents.executeJavaScript(
      'document.documentElement.scrollWidth>innerWidth',
    )
    await win.webContents.executeJavaScript(`document.querySelector('#replay').click()`)
    await pause(200)
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await pause(100)
    checks.reducedMidEntrance = await win.webContents.executeJavaScript(
      `document.querySelector('#award').dataset.phase === 'ready' && document.querySelector('.award-badge').getAnimations({subtree:true}).length === 0`,
    )
    checks.reducedMotion = await win.webContents.executeJavaScript(
      `(() => {document.querySelector('#replay').click();return matchMedia('(prefers-reduced-motion: reduce)').matches && document.querySelector('#award').dataset.phase === 'ready' && !document.querySelector('#award-copy').inert && getComputedStyle(document.querySelector('.award-badge')).animationName === 'none'})()`,
    )
    win.setContentSize(844, 390)
    await pause(100)
    await capture('enamel-short-ready.png')
    checks.shortAwardFits = await win.webContents.executeJavaScript(
      `document.querySelector('#award-copy').getBoundingClientRect().bottom <= innerHeight`,
    )
    await win.webContents.executeJavaScript(`document.querySelector('#award').click()`)
    await pause(2500)
    checks.cancelCleanup = await win.webContents.executeJavaScript(
      `!document.querySelector('#award').open && !document.querySelector('#award').hasAttribute('data-phase') && !document.querySelector('#award-object').children.length`,
    )
    console.log(JSON.stringify({ checks, errors, output }))
    const failed =
      checks.overflow ||
      checks.mobileOverflow ||
      !checks.replay ||
      !checks.reducedMotion ||
      !checks.badgeFirst ||
      !checks.inkBeforeCopy ||
      !checks.panelSettled ||
      !checks.restart ||
      !checks.escape ||
      !checks.collect ||
      !checks.mobileAwardFits ||
      !checks.shortAwardFits ||
      !checks.cancelCleanup ||
      !checks.materialSequence ||
      !checks.motionSettled ||
      !checks.reducedMidEntrance ||
      !checks.backFirst ||
      !checks.frontSettled ||
      errors.length
    win.destroy()
    app.exit(failed ? 1 : 0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
