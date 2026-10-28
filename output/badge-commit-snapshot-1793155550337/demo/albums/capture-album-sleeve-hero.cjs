const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-sleeve-hero-')))

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 920,
      webPreferences: { sandbox: true, backgroundThrottling: false, offscreen: true },
    })
    await win.loadFile(path.join(__dirname, 'album-sleeve-hero.html'))
    for (const [name, width, height, theme] of [
      ['album-sleeve-hero-dark', 1200, 920, 'dark'],
      ['album-sleeve-hero-light', 1200, 920, 'light'],
      ['album-sleeve-hero-mobile', 390, 844, 'dark'],
    ]) {
      win.setContentSize(width, height)
      await win.webContents.executeJavaScript(`
      if(document.documentElement.dataset.theme !== '${theme}') document.querySelector('.theme-toggle').click();
      document.fonts.ready
    `)
      await new Promise((resolve) => setTimeout(resolve, 120))
      const readState = () =>
        win.webContents.executeJavaScript(`(() => {
      const images = Array.from(document.images).map(image => ({ loaded: image.complete && image.naturalWidth > 0 }));
      const stage = document.querySelector('.package').getBoundingClientRect();
      const sleeve = document.querySelector('.sleeve').getBoundingClientRect();
      const label = document.querySelector('.record-label').getBoundingClientRect();
      return {
        width: innerWidth,
        theme: document.documentElement.dataset.theme,
        images,
        titleFontLoaded: document.fonts.check('500 80px "Sleeve Display"'),
        horizontalOverflow: document.documentElement.scrollWidth > innerWidth,
        labelExposed: label.bottom <= sleeve.top,
        recordTop: document.querySelector('.record').getBoundingClientRect().top,
        sleeveTop: sleeve.top,
        progress: Number(document.querySelector('.scroll-scene').dataset.progress),
        pull: Number(document.querySelector('.scroll-scene').style.getPropertyValue('--pull')),
        heroTop: document.querySelector('.hero').getBoundingClientRect().top,
        heroBottom: document.querySelector('.hero').getBoundingClientRect().bottom,
        sleeveWidth: sleeve.width,
        stageHeight: stage.height,
        themeToggleLabel: document.querySelector('.theme-toggle').getAttribute('aria-label'),
        background: getComputedStyle(document.body).backgroundImage,
      }
    })()`)
      const range = await win.webContents.executeJavaScript(
        `document.querySelector('.scroll-scene').offsetHeight-innerHeight`,
      )
      for (const progress of [0, 0.1, 0.5, 0.85, 1, 0]) {
        await win.webContents.executeJavaScript(
          `window.scrollTo({top:${range * progress},behavior:'instant'})`,
        )
        await new Promise((resolve) => setTimeout(resolve, 60))
        await win.webContents.capturePage()
        await new Promise((resolve) => setTimeout(resolve, 60))
        const result = await readState()
        if (
          result.images.some((image) => !image.loaded) ||
          result.horizontalOverflow ||
          !result.titleFontLoaded ||
          result.background !== 'none' ||
          !Number.isFinite(result.progress) ||
          Math.abs(result.progress - progress) > 0.003 ||
          Math.abs(result.heroTop) > 1 ||
          (progress === 0 && (result.pull !== 0 || result.recordTop < result.sleeveTop - 1)) ||
          (progress >= 0.85 && !result.labelExposed)
        )
          throw new Error('Scroll hero failed: ' + JSON.stringify({ name, progress, ...result }))
        if (progress === 0.1 || progress === 0.5 || progress === 0.85) {
          fs.writeFileSync(
            path.join(__dirname, `${name}-${progress}.png`),
            (await win.webContents.capturePage()).toPNG(),
          )
        }
        console.log(JSON.stringify({ name, requestedProgress: progress, ...result }))
      }
      win.webContents.sendInputEvent({
        type: 'mouseWheel',
        x: Math.round(width / 2),
        y: Math.round(height / 2),
        deltaX: 0,
        deltaY: -140,
      })
      await new Promise((resolve) => setTimeout(resolve, 120))
      await win.webContents.capturePage()
      if ((await win.webContents.executeJavaScript('scrollY')) <= 0)
        throw new Error('Wheel did not scroll')
      await win.webContents.executeJavaScript(
        `window.scrollTo({top:${range + 160},behavior:'instant'})`,
      )
      await new Promise((resolve) => setTimeout(resolve, 60))
      const released = await win.webContents.executeJavaScript(
        `document.querySelector('.hero').getBoundingClientRect().top < -100 && document.querySelector('.track-section').getBoundingClientRect().top < innerHeight`,
      )
      if (!released) throw new Error('Hero did not release into tracks')
    }

    await win.webContents.debugger.attach('1.3')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
    })
    await new Promise((resolve) => setTimeout(resolve, 80))
    const reduced = await win.webContents.executeJavaScript(
      `document.documentElement.dataset.reducedMotion==='true' && getComputedStyle(document.querySelector('.hero')).position==='relative' && document.querySelector('.scroll-scene').style.getPropertyValue('--pull')==='1'`,
    )
    if (!reduced) throw new Error('Reduced motion did not switch to static layout')
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia', {
      features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }],
    })
    win.webContents.debugger.detach()
    console.log(JSON.stringify({ reducedMotionPassed: reduced, wheelAndReleasePassed: true }))

    const framesDir = process.env.AURALIS_SLEEVE_FRAME_DIR
    if (framesDir) {
      win.setContentSize(1100, 860)
      await win.webContents.executeJavaScript(`document.documentElement.dataset.theme='dark'`)
      await new Promise((resolve) => setTimeout(resolve, 100))
      const range = await win.webContents.executeJavaScript(
        `document.querySelector('.scroll-scene').offsetHeight-innerHeight`,
      )
      for (let i = 0; i < 66; i++) {
        const progress = Math.min(1, Math.max(0, (i - 8) / 44))
        await win.webContents.executeJavaScript(
          `window.scrollTo({top:${range * progress},behavior:'instant'})`,
        )
        await new Promise((resolve) => setTimeout(resolve, 35))
        fs.writeFileSync(
          path.join(framesDir, `frame-${String(i).padStart(3, '0')}.png`),
          (await win.webContents.capturePage()).toPNG(),
        )
      }
    }
    win.destroy()
    app.quit()
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
