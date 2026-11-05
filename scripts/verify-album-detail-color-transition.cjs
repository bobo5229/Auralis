// Run with: node_modules/.bin/electron scripts/verify-album-detail-color-transition.cjs
// Exercise the production CSS in Chromium without opening the user's music library.
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-color-transition-')))
app
  .whenReady()
  .then(async () => {
    const win = new BrowserWindow({
      show: false,
      width: 1200,
      height: 800,
      webPreferences: { sandbox: true, offscreen: true, backgroundThrottling: false },
    })
    try {
      await win.loadURL('data:text/html,<!doctype html><html><body></body></html>')
      const read = (file) => fs.readFileSync(path.join(process.cwd(), file), 'utf8')
      const page = read('src/renderer/features/albums/pages/AlbumDetailPage.vue')
      const detailCss = page.match(/<style scoped>([\s\S]*?)<\/style>/)[1]
      await win.webContents.insertCSS(
        read('src/renderer/app/styles/main.css') +
          '\n' +
          read('src/renderer/features/albums/styles/albumDetail.more-gallery.css') +
          '\n' +
          detailCss,
      )
      const result = await win.webContents.executeJavaScript(`(async () => {
      const check = (condition, message) => { if (!condition) throw new Error(message) }
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
      const properties = ['--album-detail-main', '--album-detail-side', '--album-detail-lyrics-surface', '--album-detail-more']
      const targets = ['rgb(120, 212, 205)', 'rgb(79, 185, 178)', 'rgb(79, 185, 178)', 'rgb(99, 198, 191)']
      document.body.innerHTML = '<div class="app-window"><div class="app-shell" style="--auralis-main-bg:rgb(32,32,32);--auralis-sidebar-bg:rgb(24,24,24);--auralis-now-playing-bg:rgb(24,24,24);--auralis-album-detail-more-bg:rgb(32,32,32)"><aside class="app-sidebar"></aside><main class="app-main"><div class="album-hero-content-stage"></div><div class="album-more-gallery existing"></div></main><aside class="now-playing-panel"></aside></div></div>'
      const shell = document.querySelector('.app-shell'), main = document.querySelector('.app-main')
      const side = document.querySelector('.app-sidebar'), lyrics = document.querySelector('.now-playing-panel')
      const hero = document.querySelector('.album-hero-content-stage'), gallery = document.querySelector('.existing')
      const color = el => getComputedStyle(el).backgroundColor
      const apply = () => properties.forEach((property, i) => shell.style.setProperty(property, targets[i]))
      const animations = () => shell.getAnimations().filter(a => properties.includes(a.transitionProperty))
      const assertTimeline = () => {
        const list = animations()
        check(list.length === 4, 'Expected four color transitions on the shell, got ' + list.length)
        check(list.every(a => a.effect.getTiming().duration === 650), 'Color durations differ')
        check(list.every(a => a.effect.getTiming().easing === 'ease' && a.effect.getTiming().delay === 0), 'Color easing or delay differs')
        check(list.every(a => a.startTime === list[0].startTime), 'Color start times differ')
      }
      // Force initial styles before applying the palette.
      color(main); await frame(); await frame()
      apply(); shell.classList.add('has-album-detail-color')
      await frame(); await frame(); assertTimeline()
      await wait(180)
      const fresh = document.createElement('div'); fresh.className = 'album-more-gallery'; main.append(fresh)
      check(color(gallery) === color(fresh), 'A newly mounted gallery skipped the transition')
      check(getComputedStyle(hero, '::before').backgroundImage.includes(color(main)), 'Hero fade is not using the current main color')
      check(color(side) === color(lyrics), 'Reserved sidebar and lyrics are out of sync')
      check(color(main) !== targets[0] && color(main) !== 'rgb(32, 32, 32)', 'The main surface is not transitioning')
      await wait(700)
      check(color(main) === targets[0] && color(side) === targets[1] && color(lyrics) === targets[2] && color(gallery) === targets[3], 'Entry did not reach all target colors')
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      await frame(); await frame(); assertTimeline()
      await wait(700)
      check(color(main) === 'rgb(32, 32, 32)' && color(side) === 'rgb(24, 24, 24)' && color(lyrics) === 'rgb(24, 24, 24)', 'Exit did not restore the original colors')
      shell.classList.add('is-lyrics-floating'); await wait(700)
      apply(); shell.classList.add('has-album-detail-color')
      await frame(); await frame(); assertTimeline()
      await wait(700)
      check(color(lyrics) === targets[2], 'Floating lyrics did not reach its target color')
      document.documentElement.dataset.reducedMotion = 'true'
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      await frame(); await frame()
      check(animations().length === 0, 'Reduced motion should disable color transitions')
      return 'Entry, late gallery, hero, exit, floating lyrics and reduced motion passed.'
    })()`)
      console.log(result)
    } finally {
      win.destroy()
      app.quit()
    }
  })
  .catch((error) => {
    console.error(error)
    app.exit(1)
  })
