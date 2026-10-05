// Isolated SVG export and gallery verification; no player records are accessed.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const assert = require('node:assert/strict')
app.commandLine.appendSwitch('force-device-scale-factor', '1')
app.setPath('userData', path.join(app.getPath('temp'), 'auralis-album-assets-render'))
const output = process.env.BADGE_CHECK_OUTPUT || app.getPath('temp')
const badges = require('./manifest.json').badges.filter(
  (badge) => !process.env.BADGE_ID || badge.id === process.env.BADGE_ID,
)
assert(badges.length > 0, 'At least one known badge must be selected')
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
    for (const badge of badges) {
      for (const asset of [badge, badge.unlit]) {
        win.setContentSize(660, 740)
        const source = fs.readFileSync(path.join(__dirname, asset.svg), 'utf8')
        assert(!/<text\b|<script\b|<image\b|var\(/.test(source), 'Portable outlined SVG')
        await win.loadFile(path.join(__dirname, asset.svg))
        const geometry = await win.webContents.executeJavaScript(`(() => {
      const svg=document.documentElement;
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
      const refs=[...svg.outerHTML.matchAll(/url\\(#([^)]+)\\)/g)].map(m=>m[1]);
      svg.setAttribute('width','660');svg.setAttribute('height','740');
      return { valid:svg.localName==='svg' && !document.querySelector('parsererror') && new Set(ids).size===ids.length && refs.every(id=>ids.includes(id)), sleeves:document.querySelectorAll('[data-album-sleeve]').length, albumDiscs:document.querySelectorAll('[data-album-disc]').length, microphone:document.querySelectorAll('[data-live-microphone]').length, curtains:document.querySelectorAll('[data-live-curtain]').length, audience:document.querySelectorAll('[data-live-audience]').length };
    })()`)
        assert(geometry.valid, 'SVG parses and all gradient/filter references resolve')
        assert.equal(geometry.sleeves, asset === badge && badge.id === 'albums-1' ? 1 : 0)
        assert.equal(geometry.albumDiscs, asset === badge && badge.id === 'albums-1' ? 1 : 0)
        assert.equal(geometry.microphone, asset === badge && badge.id === 'albums-live' ? 1 : 0)
        assert.equal(geometry.curtains, asset === badge && badge.id === 'albums-live' ? 3 : 0)
        assert.equal(geometry.audience, asset === badge && badge.id === 'albums-live' ? 1 : 0)
        await pause(150)
        const bitmap = await win.webContents.capturePage()
        assert.deepEqual(bitmap.getSize(), { width: 660, height: 740 })
        const pixels = bitmap.toBitmap()
        assert.equal(pixels[3], 0, 'Transparent corner')
        assert(pixels[(370 * 660 + 330) * 4 + 3] > 0, 'Visible badge center')
        fs.writeFileSync(path.join(__dirname, asset.png), bitmap.toPNG())
      }
      win.setContentSize(1280, 1000)
      await win.loadFile(path.join(__dirname, badge.page))
      const decode = () =>
        win.webContents.executeJavaScript(
          'Promise.all([document.fonts.ready,...[...document.images].map(img=>img.decode())])',
        )
      const capture = async (name) => {
        await decode()
        await pause(150)
        fs.writeFileSync(
          path.join(output, `${badge.id}-${name}.png`),
          (await win.webContents.capturePage()).toPNG(),
        )
      }
      await capture('desktop-dark')
      assert(
        await win.webContents.executeJavaScript(
          '[...document.images].every(img=>img.complete && img.naturalWidth===330)',
        ),
        'All assets load',
      )
      const navigation = await win.webContents.executeJavaScript(
        `[...document.querySelectorAll('.day-series a')].map(a => ({href: a.getAttribute('href'), current: a.getAttribute('aria-current')}))`,
      )
      assert.equal(navigation.filter((link) => link.current === 'page').length, 1)
      for (const link of navigation) assert(fs.existsSync(path.join(__dirname, link.href)))
      await win.webContents.executeJavaScript(
        "document.querySelector('button[data-background=light]').click()",
      )
      await capture('desktop-light')
      assert(
        await win.webContents.executeJavaScript(
          "document.body.dataset.background==='light' && document.querySelector('button[data-background=light]').getAttribute('aria-pressed')==='true'",
        ),
      )
      await win.webContents.executeJavaScript(
        "document.querySelector('button[data-state=unlit]').click()",
      )
      await capture('desktop-unlit')
      assert(
        await win.webContents.executeJavaScript(
          `document.querySelector('#main-badge').src.endsWith('${badge.id}-unlit.svg') && document.querySelector('#svg-download').href.endsWith('${badge.id}-unlit.svg') && document.querySelector('#png-download').href.endsWith('${badge.id}-unlit@2x.png') && document.querySelector('button[data-state=unlit]').getAttribute('aria-pressed')==='true'`,
        ),
      )
      await win.webContents.executeJavaScript(
        "document.querySelector('button[data-state=lit]').click(); document.querySelector('button[data-background=dark]').click()",
      )
      await decode()
      assert(
        await win.webContents.executeJavaScript(
          `document.querySelector('#main-badge').src.endsWith('${badge.id}.svg') && document.querySelector('#svg-download').href.endsWith('${badge.id}.svg') && document.querySelector('#png-download').href.endsWith('${badge.id}@2x.png')`,
        ),
      )
      win.setContentSize(390, 844)
      await capture('mobile-top')
      assert(
        await win.webContents.executeJavaScript(
          'document.documentElement.scrollWidth<=document.documentElement.clientWidth',
        ),
        'Mobile has no horizontal overflow',
      )
      await win.webContents.executeJavaScript('scrollTo(0,document.body.scrollHeight)')
      await capture('mobile-bottom')
    }
    assert.deepEqual(errors, [])
    console.log(
      JSON.stringify({
        rendered: badges.flatMap((badge) => [badge.id, `${badge.id}-unlit`]),
        pngSize: [660, 740],
        transparent: true,
        motifGeometry: true,
        stateDownloads: true,
        backgrounds: true,
        mobileFits: true,
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
