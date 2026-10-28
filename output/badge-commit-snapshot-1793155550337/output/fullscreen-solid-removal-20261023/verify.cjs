const { app, BrowserWindow, protocol } = require('electron')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

const output = __dirname
app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-solid-removal-')))
protocol.registerSchemesAsPrivileged([
  { scheme: 'auralis-artwork', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } },
])
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
const results = []
let win
async function js(code) {
  return win.webContents.executeJavaScript(`(async () => { ${code} })()`)
}
async function record(name, code) {
  const result = await js(code)
  results.push({ name, result })
  fs.writeFileSync(path.join(output, 'results.json'), JSON.stringify(results, null, 2))
  console.log(name, JSON.stringify(result))
  return result
}
async function waitFor(expression, timeout = 15000) {
  const start = Date.now()
  while (!(await js(`return !!(${expression})`))) {
    if (Date.now() - start > timeout) throw new Error(`Timed out: ${expression}`)
    await delay(100)
  }
}
async function snapshot(name) {
  const image = await win.webContents.capturePage()
  fs.writeFileSync(path.join(output, `${name}.png`), image.toPNG())
}
async function preparePlayer() {
  await js(`
    const componentSource = await (await fetch('/features/playback/components/FullscreenArtworkBackground.vue')).text();
    window.reviewVue = await import(componentSource.match(/from "([^"]*vue[.]js[^"]*)"/)[1]);
    window.reviewPlayback = (await import('/features/playback/composables/usePlayback.ts')).usePlayback();
    window.reviewLyrics = (await import('/features/lyrics/composables/useTrackLyrics.ts')).useTrackLyrics();
    window.reviewFullscreen = (await import('/features/playback/composables/useFullscreenPlayer.ts')).useFullscreenPlayer();
    window.reviewBackground = (await import('/features/playback/composables/useFullscreenBackground.ts')).useFullscreenBackground();
    Object.assign(reviewPlayback.state, {
      currentTrackId: 970041, duration: 300,
      currentTrack: { id: 970041, title: '夜色与回声', artist: 'Auralis · 验证曲目', album: 'Synthetic cover', albumArtist: 'Auralis', durationSeconds: 300, artworkCacheKey: 'solid-removal-cover' }
    });
    await new Promise(resolve => setTimeout(resolve, 120));
    reviewLyrics.parsedLines.value = Array.from({length: 20}, (_, i) => ({id: 'line-' + i, timeSeconds: 5 + i * 5, text: ['夜色中，听见每一段旋律', 'A quiet moment in the music', '星光落在唱片上'][i % 3]}));
    reviewLyrics.status.value = 'lrc';
    reviewPlayback.state.currentTime = 17;
    reviewFullscreen.openFullscreenPlayer();
  `)
  await waitFor("document.querySelector('.fullscreen-player') && !document.querySelector('.fullscreen-player').inert")
  await js(`
    let owner = document.querySelector('.fullscreen-player').__vueParentComponent;
    while (owner && !owner.setupState.playback) owner = owner.parent;
    if (!owner) throw new Error('Overlay instance unavailable');
    window.reviewPlayback = owner.setupState.playback;
    Object.assign(reviewPlayback.state, {
      currentTrackId: 970041, duration: 300, currentTime: 17,
      currentTrack: { id: 970041, title: '夜色与回声', artist: 'Auralis · 验证曲目', album: 'Synthetic cover', albumArtist: 'Auralis', durationSeconds: 300, artworkCacheKey: 'solid-removal-cover' }
    });
    await new Promise(resolve => setTimeout(resolve, 120));
  `)
  await delay(500)
}

app.whenReady().then(async () => {
  protocol.handle('auralis-artwork', () => new Response(
    `<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#285b9a"/><stop offset=".5" stop-color="#9b397c"/><stop offset="1" stop-color="#e2a156"/></linearGradient></defs><rect width="256" height="256" fill="url(#g)"/><circle cx="140" cy="130" r="68" fill="#cf786c"/></svg>`,
    { headers: { 'content-type': 'image/svg+xml', 'access-control-allow-origin': '*' } },
  ))
  win = new BrowserWindow({
    width: 1200, height: 800, useContentSize: true, show: false,
    webPreferences: { offscreen: true, backgroundThrottling: false },
  })
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 'warning') console.log('RENDERER', event.message)
  })
  await win.loadURL('http://127.0.0.1:5193/')
  await waitFor('window.__auralisAppReady')
  await delay(1000)
  await js(`
    window.reviewWarnings = [];
    const warn = console.warn.bind(console);
    console.warn = (...args) => { reviewWarnings.push(args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')); warn(...args); };
  `)
  await preparePlayer()
  await waitFor("document.querySelector('.fluid-artwork-background-canvas')")
  await delay(1200)
  for (const theme of ['light', 'dark']) {
    await js(`document.documentElement.dataset.theme = '${theme}'; document.querySelector('.background-controls-toggle').click();`)
    await delay(350)
    const settings = await record(`${theme}-settings`, `
      const panel = document.querySelector('.background-controls-panel');
      const pause = panel.querySelector('[data-background-pause]');
      const rect = panel.getBoundingClientRect();
      return {
        modeCount: panel.querySelectorAll('[data-background-mode]').length,
        segmentedCount: panel.querySelectorAll('.settings-segmented-control').length,
        pause: pause.getAttribute('aria-checked'),
        lyrics: !!panel.querySelector('#fullscreen-lyrics-font-size'),
        focusedClose: document.activeElement === panel.querySelector('.background-controls-close'),
        withinWindow: rect.left >= 0 && rect.top >= 0 && rect.right <= innerWidth && rect.bottom <= innerHeight,
        baseColor: getComputedStyle(document.querySelector('.fullscreen-artwork-background')).backgroundColor,
        textColor: getComputedStyle(document.querySelector('.fullscreen-player')).color,
        noSolidClass: !document.querySelector('.fullscreen-player--solid')
      };
    `)
    assert.equal(settings.modeCount, 0)
    assert.equal(settings.segmentedCount, 0)
    assert.equal(settings.lyrics, true)
    assert.equal(settings.focusedClose, true)
    assert.equal(settings.withinWindow, true)
    assert.equal(settings.baseColor, 'rgb(21, 24, 29)')
    assert.equal(settings.noSolidClass, true)
    await snapshot(`${theme}-settings`)
    await js("document.querySelector('.background-controls-close').click();")
    await delay(350)
  }
  await js("document.querySelector('.background-controls-toggle').click();")
  await delay(350)
  const paused = await record('pause-background', `
    document.querySelector('[data-background-pause]').click();
    await reviewVue.nextTick();
    return { paused: reviewBackground.backgroundMotionPaused.value };
  `)
  assert.equal(paused.paused, true)
  await delay(1000)
  const pauseState = await record('pause-propagation', `
    const fluid = document.querySelector('.fluid-artwork-background');
    return { paused: fluid.__vueParentComponent.props.motionPaused, visible: getComputedStyle(fluid).visibility, enabled: fluid.__vueParentComponent.props.enabled, active: fluid.__vueParentComponent.props.active, componentVisible: fluid.__vueParentComponent.props.visible, contextLost: fluid.__vueParentComponent.setupState.contextLost, warnings: reviewWarnings };
  `)
  assert.equal(pauseState.paused, true)
  assert.equal(pauseState.visible, 'visible')
  win.webContents.focus()
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
  win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
  await delay(400)
  const escaped = await record('escape-focus', `return { panel: !!document.querySelector('.background-controls-panel'), fullscreen: reviewFullscreen.isFullscreenPlayerOpen.value, focus: document.activeElement.className };`)
  assert.equal(escaped.panel, false)
  assert.equal(escaped.fullscreen, true)
  assert.equal(escaped.focus, 'background-controls-toggle')
  await js("document.querySelector('.background-controls-toggle').click();")
  await delay(350)
  await js("document.querySelector('.fullscreen-player-meta').dispatchEvent(new PointerEvent('pointerdown', {bubbles: true}));")
  await delay(350)
  assert.equal(await js("return !!document.querySelector('.background-controls-panel')"), false)
  await js('reviewFullscreen.closeFullscreenPlayer();')
  await delay(700)
  await js('reviewFullscreen.openFullscreenPlayer();')
  await delay(700)
  const reopened = await record('fullscreen-reentry', `return { paused: reviewBackground.backgroundMotionPaused.value, canvasCount: document.querySelectorAll('.fluid-artwork-background-canvas').length, visible: getComputedStyle(document.querySelector('.fluid-artwork-background')).visibility };`)
  assert.equal(reopened.paused, true)
  assert.equal(reopened.canvasCount, 1)
  assert.equal(reopened.visible, 'visible')
  await js('reviewBackground.setBackgroundMotionPaused(false);')
  await delay(300)
  const context = await record('lose-context', `
    window.oldCanvas = document.querySelector('.fluid-artwork-background-canvas');
    window.reviewContextExtension = oldCanvas.getContext('webgl').getExtension('WEBGL_lose_context');
    if (!reviewContextExtension) return {supported: false};
    reviewContextExtension.loseContext();
    return {supported: true};
  `)
  assert.equal(context.supported, true)
  await waitFor("getComputedStyle(document.querySelector('.fluid-artwork-background')).visibility === 'hidden'")
  await snapshot('context-lost-dark')
  await js('reviewContextExtension.restoreContext();')
  await waitFor("document.querySelector('.fluid-artwork-background-canvas') && document.querySelector('.fluid-artwork-background-canvas') !== oldCanvas")
  await delay(700)
  const restored = await record('context-restored', `return { freshCanvas: document.querySelector('.fluid-artwork-background-canvas') !== oldCanvas, canvasCount: document.querySelectorAll('.fluid-artwork-background-canvas').length, visible: getComputedStyle(document.querySelector('.fluid-artwork-background')).visibility };`)
  assert.equal(restored.freshCanvas, true)
  assert.equal(restored.canvasCount, 1)
  assert.equal(restored.visible, 'visible')
  await snapshot('context-restored')
  win.setContentSize(900, 620)
  await delay(350)
  await js("document.querySelector('.background-controls-toggle').click();")
  await delay(350)
  await snapshot('small-settings')
  const small = await record('small-settings', `const panel = document.querySelector('.background-controls-panel').getBoundingClientRect(); return { within: panel.left >= 0 && panel.top >= 0 && panel.right <= innerWidth && panel.bottom <= innerHeight, pause: !!document.querySelector('[data-background-pause]') };`)
  assert.equal(small.within, true)
  assert.equal(small.pause, true)

  // Exercise the full overlay's unavailable event and fallback styling.
  await js(`
    reviewFullscreen.closeFullscreenPlayer();
    const component = document.querySelector('.fluid-artwork-background').__vueParentComponent;
    component.emit('unavailable');
  `)
  await delay(700)
  await js('reviewFullscreen.openFullscreenPlayer();')
  await delay(700)
  for (const theme of ['light', 'dark']) {
    await js(`document.documentElement.dataset.theme = '${theme}';`)
    const fallback = await record(`${theme}-fallback`, `return { background: getComputedStyle(document.querySelector('.fullscreen-artwork-background')).backgroundColor, visible: getComputedStyle(document.querySelector('.fluid-artwork-background')).visibility, enabled: document.querySelector('.fluid-artwork-background').__vueParentComponent.props.enabled, title: document.querySelector('.fullscreen-player-meta').textContent.trim() };`)
    assert.equal(fallback.background, 'rgb(21, 24, 29)')
    assert.equal(fallback.visible, 'hidden')
    assert.equal(fallback.enabled, false)
    assert.ok(fallback.title.includes('夜色与回声'))
    await snapshot(`${theme}-fallback`)
  }
  // Mount a separate real background with WebGL deliberately unavailable.
  const failedInit = await record('initialization-failure', `
    const { createApp, h, reactive } = reviewVue;
    const { default: Background } = await import('/features/playback/components/FullscreenArtworkBackground.vue');
    const target = document.createElement('div');
    target.style.cssText = 'position:fixed;width:64px;height:64px;left:0;top:0;';
    document.body.append(target);
    const host = document.createElement('div'); document.body.append(host);
    const state = reactive({target, artworkUrl:null, active:true, playing:false, motionPaused:false});
    const original = HTMLCanvasElement.prototype.getContext;
    let attempts = 0;
    HTMLCanvasElement.prototype.getContext = function(type, ...args) {
      if (type === 'webgl') { attempts++; return null; }
      return original.call(this, type, ...args);
    };
    const probe = createApp({setup: () => () => h(Background, state)}); probe.mount(host);
    await new Promise(resolve => setTimeout(resolve, 1200));
    const attemptsAtFailure = attempts;
    state.active = false;
    await new Promise(resolve => setTimeout(resolve, 100));
    state.active = true;
    await new Promise(resolve => setTimeout(resolve, 500));
    const fluid = target.querySelector('.fluid-artwork-background');
    const result = { attemptsAtFailure, attemptsAfterReentry: attempts, visible: getComputedStyle(fluid).visibility, enabled: fluid.__vueParentComponent.props.enabled, baseColor: getComputedStyle(target.querySelector('.fullscreen-artwork-background')).backgroundColor };
    HTMLCanvasElement.prototype.getContext = original;
    probe.unmount(); host.remove(); target.remove();
    return result;
  `)
  assert.equal(failedInit.attemptsAtFailure, 1)
  assert.equal(failedInit.attemptsAfterReentry, 1)
  assert.equal(failedInit.enabled, false)
  assert.equal(failedInit.visible, 'hidden')
  assert.equal(failedInit.baseColor, 'rgb(21, 24, 29)')
  win.destroy()
  app.quit()
}).catch((error) => {
  console.error(error.stack || error)
  app.exit(1)
})
