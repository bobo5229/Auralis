const { spawn } = require('node:child_process')
const { mkdirSync, mkdtempSync, writeFileSync } = require('node:fs')
const { join, resolve } = require('node:path')
const { tmpdir } = require('node:os')
const { pathToFileURL } = require('node:url')

if (!process.versions.electron) {
  const environment = { ...process.env }
  delete environment.ELECTRON_RUN_AS_NODE
  import(pathToFileURL(join(__dirname, 'build.mjs')).href)
    .then(() => {
      const child = spawn(require('electron'), [__filename, ...process.argv.slice(2)], {
        env: environment,
        windowsHide: !process.argv.includes('--show'),
        stdio: 'inherit',
      })
      child.on('error', (error) => {
        console.error(error)
        process.exitCode = 1
      })
      child.on('exit', (code) => {
        process.exitCode = code ?? 1
      })
    })
    .catch((error) => {
      console.error(error)
      process.exitCode = 1
    })
} else {
  const { app, BrowserWindow } = require('electron')
  const check = process.argv.includes('--check')
  const output = resolve(__dirname, '../../../output/concert-ticket-demo')
  mkdirSync(output, { recursive: true })
  app.setPath(
    'userData',
    check ? mkdtempSync(join(tmpdir(), 'auralis-ticket-check-')) : join(output, 'preview-profile'),
  )
  app.setName('Auralis 每日票夹 Demo')
  app
    .whenReady()
    .then(async () => {
      const window = new BrowserWindow({
        width: 1280,
        height: 1080,
        minWidth: 390,
        minHeight: 580,
        title: 'Auralis 每日票夹 Demo',
        backgroundColor: '#f0f1f2',
        autoHideMenuBar: true,
        show: false,
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
          offscreen: check,
          backgroundThrottling: false,
        },
      })
      const wc = window.webContents
      const errors = []
      wc.on('console-message', (event) => {
        if (event.level === 'error') errors.push(event.message)
      })
      wc.on('render-process-gone', (_, details) => errors.push(`Renderer gone: ${details.reason}`))
      await window.loadFile(join(__dirname, 'index.html'))
      if (!check) {
        window.show()
        window.focus()
        console.log('每日票夹预览已打开')
        return
      }
      const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
      const evaluate = (expression) => wc.executeJavaScript(expression)
      const result = { passed: false, checks: [], errors, outputDirectory: output }
      const assert = (condition, message) => {
        if (!condition) throw new Error(message)
        result.checks.push(message)
      }
      const capture = async (name) => {
        await pause(130)
        writeFileSync(join(output, `${name}.png`), (await wc.capturePage()).toPNG())
      }
      const captureElement = async (selector, name) => {
        const rect = await evaluate(
          `(() => { const r = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return { x: Math.max(0, Math.floor(r.x) - 15), y: Math.max(0, Math.floor(r.y) - 15), width: Math.ceil(r.width) + 30, height: Math.ceil(r.height) + 30 }; })()`,
        )
        writeFileSync(join(output, `${name}.png`), (await wc.capturePage(rect)).toPNG())
      }
      const click = async (selector) => {
        const point = await evaluate(
          `(() => { const el = document.querySelector(${JSON.stringify(selector)}); if (!el || el.disabled || el.hidden) throw new Error('Unavailable control: ' + ${JSON.stringify(selector)}); el.scrollIntoView({block: 'center', behavior: 'instant'}); const r = el.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) }; })()`,
        )
        wc.sendInputEvent({ type: 'mouseMove', ...point })
        wc.sendInputEvent({ type: 'mouseDown', ...point, button: 'left', clickCount: 1 })
        wc.sendInputEvent({ type: 'mouseUp', ...point, button: 'left', clickCount: 1 })
        await pause(75)
      }
      const key = async (keyCode) => {
        wc.sendInputEvent({ type: 'keyDown', keyCode })
        wc.sendInputEvent({ type: 'keyUp', keyCode })
        await pause(90)
      }
      const inspect = () => evaluate('window.concertTicketDemo.inspect()')
      const geometry = () =>
        evaluate(`(() => {
      const ticket = document.querySelector(document.querySelector('dialog').open ? '#dialog-ticket .ticket' : '#daily-ticket .ticket');
      const target = ticket.getBoundingClientRect();
      const nodes = [...ticket.querySelectorAll('.ticket-title, .ticket-artist, .ticket-stats, .ticket-artwork, .ticket-date, .ticket-stamp, .ticket-number')];
      return { noOverflow: document.documentElement.scrollWidth <= innerWidth + 1, contained: nodes.every(el => { const r = el.getBoundingClientRect(); return r.left >= target.left - 1 && r.right <= target.right + 1 && r.bottom <= target.bottom + 1; }), titleFits: ticket.querySelector('.ticket-title').scrollWidth <= ticket.querySelector('.ticket-title').clientWidth + 1 };
    })()`)
      try {
        await evaluate('window.concertTicketDemo.paletteReady.then(() => true)')
        await evaluate(
          'document.fonts.ready.then(() => Promise.all([...document.images].map(image => image.complete ? Promise.resolve() : new Promise(resolve => { image.onload = resolve; image.onerror = resolve })))).then(() => true)',
        )
        assert(
          (await inspect()).collected.length === 3,
          'Fresh profile starts with three historical tickets and yesterday unclaimed',
        )
        const imagesLoaded = await evaluate(
          '[...document.images].every(image => image.complete && image.naturalWidth > 0)',
        )
        assert(imagesLoaded, 'All local album covers load offline')
        await evaluate('scrollTo(0, 0)')
        await capture('light-pending')
        const desktopGeometry = await geometry()
        assert(
          desktopGeometry.noOverflow && desktopGeometry.contained && desktopGeometry.titleFits,
          'Desktop ticket content stays inside the paper',
        )

        await click('#claim-button')
        assert(
          (await inspect()).busy &&
            (await evaluate('document.querySelector("#claim-button").disabled')),
          'Claim locks duplicate input while the stamp animates',
        )
        await pause(750)
        assert(
          (await inspect()).collected.length === 4 &&
            (await inspect()).collected.includes('2026-10-29'),
          'Claim archives yesterday exactly once',
        )
        await evaluate('scrollTo(0, 0)')
        await capture('light-collected')
        await captureElement('#daily-ticket', 'ticket-template')
        await click('#claim-button')
        assert(
          (await inspect()).view === 'wallet' &&
            (await evaluate('document.querySelectorAll(".wallet-entry").length === 4')),
          'Claimed action opens the wallet with four tickets',
        )
        await evaluate('scrollTo(0, 0)')
        await capture('light-wallet')

        await click('#wallet-2026-10-28')
        assert(
          (await evaluate('document.querySelector("#ticket-dialog").open')) &&
            (await inspect()).dialogDate === '2026-10-28',
          'Historical paper opens from the wallet',
        )
        await capture('light-detail')
        await click('#next-ticket')
        assert(
          (await inspect()).dialogDate === '2026-10-27',
          'Ticket browser moves to the next archived day',
        )
        await key('Escape')
        assert(
          !(await evaluate('document.querySelector("#ticket-dialog").open')) &&
            (await evaluate('document.activeElement.id === "wallet-2026-10-28"')),
          'Escape closes the ticket and returns focus to its opener',
        )

        await click('#tab-daily')
        await click('#date-2026-10-25')
        await capture('chinese-missing-cover')
        const longGeometry = await geometry()
        assert(
          longGeometry.contained &&
            longGeometry.titleFits &&
            (await evaluate('!!document.querySelector("#dialog-ticket .cover-fallback")')),
          'Long Chinese album and missing cover remain readable',
        )
        await click('#dialog-claim')
        await pause(750)
        assert(
          (await inspect()).collected.includes('2026-10-25'),
          'An older unclaimed day can be collected later',
        )
        await key('Escape')

        await click('#today-preview')
        assert(
          (await inspect()).dialogDate === '2026-10-30' &&
            (await evaluate('document.querySelector("#dialog-claim").hidden')),
          'Today preview is distinct from a settled collectible',
        )
        await capture('today-preview')
        await key('Escape')

        await click('#theme-button')
        await evaluate('scrollTo(0, 0)')
        await capture('dark-collected')
        assert(
          (await inspect()).theme === 'dark',
          'Dark surroundings retain the warm printed paper',
        )
        await click('#tab-wallet')
        await evaluate('scrollTo(0, 0)')
        await capture('dark-wallet')
        await click('#wallet-2026-10-26')
        await capture('long-album')
        assert(
          (await geometry()).contained,
          'Long English album fits the universal ticket template',
        )
        await key('Escape')

        await click('#tab-daily')
        window.setContentSize(820, 960)
        await pause(200)
        await evaluate('scrollTo(0, 0)')
        await capture('dark-small')
        assert(
          (await geometry()).noOverflow && (await geometry()).contained,
          '820 pixel layout keeps ticket and controls inside the window',
        )
        window.setContentSize(390, 900)
        await pause(200)
        await evaluate('scrollTo(0, 0)')
        await capture('dark-narrow')
        assert(
          (await geometry()).noOverflow && (await geometry()).contained,
          '390 pixel layout reflows without horizontal clipping',
        )
        await click('#date-2026-10-25')
        await capture('chinese-narrow')
        assert((await geometry()).contained, 'Narrow ticket supports long Chinese metadata')
        await key('Escape')

        window.setContentSize(1280, 1040)
        wc.setZoomFactor(1.25)
        await pause(220)
        await evaluate('scrollTo(0, 0)')
        await capture('dark-125-percent')
        assert(
          (await geometry()).noOverflow && (await geometry()).contained,
          '125 percent zoom preserves paper geometry',
        )
        wc.setZoomFactor(1)
        await wc.reload()
        await pause(400)
        assert(
          (await inspect()).theme === 'dark' && (await inspect()).collected.length === 5,
          'Reload retains the demo theme and collected dates',
        )

        await evaluate('document.querySelector("#tab-daily").focus()')
        await key('Right')
        assert(
          (await inspect()).view === 'wallet' &&
            (await evaluate('document.activeElement.id === "tab-wallet"')),
          'Tab arrow navigation switches the view and keyboard focus',
        )
        wc.debugger.attach('1.3')
        await wc.debugger.sendCommand('Emulation.setEmulatedMedia', {
          features: [{ name: 'prefers-reduced-motion', value: 'reduce' }],
        })
        await click('#restart-button')
        await click('#claim-button')
        await pause(100)
        assert(
          (await inspect()).reducedMotion &&
            !(await inspect()).busy &&
            (await inspect()).collected.length === 4,
          'Reduced motion completes a claim without waiting for the animation',
        )
        wc.debugger.detach()
        assert(errors.length === 0, 'No renderer errors during the complete interactive demo')
        result.passed = true
      } catch (error) {
        result.failure = error.stack || String(error)
        await capture('failure')
        console.error(error)
        process.exitCode = 1
      }
      writeFileSync(join(output, 'report.json'), JSON.stringify(result, null, 2))
      console.log(JSON.stringify(result, null, 2))
      app.exit(result.passed ? 0 : 1)
    })
    .catch((error) => {
      console.error(error)
      app.exit(1)
    })
  app.on('window-all-closed', () => app.quit())
}
