// Render only these local SVG assets, then inspect the offline gallery. No player data is loaded.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setPath('userData', path.join(app.getPath('temp'), 'auralis-hour-assets-render'))
const output = process.env.BADGE_CHECK_OUTPUT || app.getPath('temp')
const manifest = require('./manifest.json')
const assets = manifest.badges
  .flatMap((badge) => [badge, { id: `${badge.id}-unlit`, ...badge.unlit }])
  .concat({ id: 'hours-unlit-template', ...manifest.unlitTemplate })
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      width: 660,
      height: 740,
      show: false,
      transparent: true,
      backgroundColor: '#00000000',
      webPreferences: {
        offscreen: true,
        backgroundThrottling: false,
        contextIsolation: true,
        nodeIntegration: false,
      },
    })
    const errors = []
    win.webContents.on('console-message', (event) => {
      if (event.level === 'error') errors.push(event.message)
    })
    const rendered = []
    for (const badge of assets) {
      const file = path.join(__dirname, badge.svg)
      const source = fs.readFileSync(file, 'utf8')
      assert(
        !/<text\b|<script\b|<image\b|var\(/.test(source),
        `${badge.id}: standalone contours and colors`,
      )
      await win.loadFile(file)
      const valid = await win.webContents.executeJavaScript(`(() => {
      const svg = document.documentElement;
      if (svg.localName !== 'svg' || document.querySelector('parsererror')) return false;
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
      const refs=[...svg.outerHTML.matchAll(/url\\(#([^)]+)\\)/g)].map(m=>m[1]);
      svg.setAttribute('width','660');svg.setAttribute('height','740');
      return new Set(ids).size===ids.length && refs.every(id=>ids.includes(id));
    })()`)
      assert(valid, `${badge.id}: valid SVG and references`)
      await pause(160)
      const bitmap = await win.webContents.capturePage()
      assert.deepEqual(bitmap.getSize(), { width: 660, height: 740 })
      const pixels = bitmap.toBitmap()
      assert.equal(pixels[3], 0, `${badge.id}: transparent corner`)
      assert(pixels[(370 * 660 + 330) * 4 + 3] > 0, `${badge.id}: visible center`)
      fs.writeFileSync(path.join(__dirname, badge.png), bitmap.toPNG())
      rendered.push(badge.id)
    }
    win.setContentSize(1440, 1080)
    await win.loadFile(path.join(__dirname, 'index.html'))
    await win.webContents.executeJavaScript(
      'Promise.all([document.fonts.ready,...[...document.images].map(img=>img.decode())])',
    )
    const capture = async (name) =>
      fs.writeFileSync(
        path.join(output, `hours-unlit-collection-${name}.png`),
        (await win.webContents.capturePage()).toPNG(),
      )
    await pause(150)
    await capture('dark')
    const gallery = await win.webContents.executeJavaScript(`(() => {
    const downloadLinks=[...document.querySelectorAll('a[download]')];
    return { images:document.images.length, loaded:[...document.images].every(i=>i.complete && i.naturalWidth===330), downloads:downloadLinks.length, overflow:document.documentElement.scrollWidth>innerWidth };
  })()`)
    assert(gallery.loaded && gallery.images === 8 && gallery.downloads === 9 && !gallery.overflow)
    const unlitState = await win.webContents.executeJavaScript(
      `[...document.images].every(img => img.src.endsWith('-unlit.svg'))`,
    )
    assert(unlitState)
    await win.webContents.executeJavaScript(
      `document.querySelector('button[data-state=lit]').click(); Promise.all([...document.images].map(img=>img.decode()))`,
    )
    const litState = await win.webContents.executeJavaScript(
      `document.querySelector('#template-download').hidden && [...document.images].every(img=>!img.src.endsWith('-unlit.svg')) && [...document.querySelectorAll('.downloads a')].every(link=>!link.href.includes('-unlit'))`,
    )
    assert(litState)
    await capture('lit-comparison')
    await win.webContents.executeJavaScript(
      `document.querySelector('button[data-state=unlit]').click(); Promise.all([...document.images].map(img=>img.decode()))`,
    )
    await win.webContents.executeJavaScript(
      `document.querySelector('button[data-background=light]').click()`,
    )
    await pause(100)
    await capture('light')
    const light = await win.webContents.executeJavaScript(
      `document.body.dataset.background === 'light' && document.querySelector('button[data-background=light]').getAttribute('aria-pressed')==='true'`,
    )
    assert(light)
    win.setContentSize(390, 844)
    await win.webContents.executeJavaScript(
      `document.querySelector('button[data-background=dark]').click()`,
    )
    await pause(100)
    await capture('mobile-top')
    const mobileFits = await win.webContents.executeJavaScript(
      'document.documentElement.scrollWidth <= document.documentElement.clientWidth',
    )
    assert(mobileFits)
    await win.webContents.executeJavaScript('scrollTo(0,document.body.scrollHeight)')
    await pause(100)
    await capture('mobile-bottom')
    for (const badge of assets) assert(fs.existsSync(path.join(__dirname, badge.png)))
    assert.deepEqual(errors, [])
    console.log(
      JSON.stringify({
        rendered,
        pngSize: [660, 740],
        transparent: true,
        gallery,
        light,
        mobileFits,
        unlitState,
        litState,
        errors,
        output,
      }),
    )
    win.destroy()
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
