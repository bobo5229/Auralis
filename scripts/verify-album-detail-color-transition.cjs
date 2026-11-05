// Run with: node_modules/.bin/electron scripts/verify-album-detail-color-transition.cjs
// Exercise production CSS and late-surface synchronization in isolated Chromium.
/* eslint-disable @typescript-eslint/no-require-imports */
const { app, BrowserWindow } = require('electron')
const { buildSync } = require('esbuild')
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
      const bundle = buildSync({
        entryPoints: ['src/renderer/app/layout/albumSurfaceSynchronization.ts'],
        bundle: true,
        format: 'iife',
        globalName: 'AlbumSurfaceTest',
        alias: { '@renderer': path.join(process.cwd(), 'src/renderer') },
        write: false,
      }).outputFiles[0].text
      const result = await win.webContents.executeJavaScript(
        bundle +
          `\n(async () => {
      const check = (condition, message) => { if (!condition) throw new Error(message) }
      const frame = () => new Promise(resolve => requestAnimationFrame(resolve))
      const wait = ms => new Promise(resolve => setTimeout(resolve, ms))
      const properties = ['--album-detail-main', '--album-detail-side', '--album-detail-lyrics-surface', '--album-detail-more']
      const targets = ['rgb(120, 212, 205)', 'rgb(79, 185, 178)', 'rgb(79, 185, 178)', 'rgb(99, 198, 191)']
      document.body.innerHTML = '<div class="app-window"><div class="app-shell" style="--auralis-main-bg:rgb(32,32,32);--auralis-sidebar-bg:rgb(24,24,24);--auralis-now-playing-bg:rgb(24,24,24);--auralis-album-detail-more-bg:rgb(32,32,32)"><span class="album-more-color-clock"></span><span class="album-lyrics-color-clock"></span><aside class="app-sidebar"></aside><main class="app-main"><div class="album-hero-content-stage"></div><div class="album-more-gallery existing"></div></main><aside class="now-playing-panel"></aside></div></div>'
      const shell = document.querySelector('.app-shell'), main = document.querySelector('.app-main')
      const side = document.querySelector('.app-sidebar'), lyrics = document.querySelector('.now-playing-panel')
      const clock = document.querySelector('.album-more-color-clock'), lyricsClock = document.querySelector('.album-lyrics-color-clock'), hero = document.querySelector('.album-hero-content-stage'), gallery = document.querySelector('.existing')
      const dispose = AlbumSurfaceTest.createAlbumSurfaceSynchronization(shell)
      const color = el => getComputedStyle(el).backgroundColor
      const animation = el => el.getAnimations().find(a => a.transitionProperty === '--album-surface-color')
      const apply = () => properties.forEach((property, i) => shell.style.setProperty(property, targets[i]))
      const assertTimeline = () => {
        const list = [main, side, lyrics, clock, lyricsClock, gallery].map(animation)
        check(list.every(Boolean), 'Missing local color transition')
        check(list.every(a => a.effect.getTiming().duration === 650 && a.effect.getTiming().easing === 'ease'), 'Color timing differs')
        check(list.every(a => a.startTime === list[0].startTime), 'Color start times differ')
      }
      color(main); getComputedStyle(clock).getPropertyValue('--album-surface-color'); getComputedStyle(lyricsClock).getPropertyValue('--album-surface-color'); await frame(); await frame()
      apply(); shell.classList.add('has-album-detail-color')
      await frame(); await frame(); assertTimeline()
      await wait(80)
      lyrics.classList.add('now-playing-panel--collapsed')
      await wait(50)
      lyrics.classList.remove('now-playing-panel--collapsed')
      await frame(); await frame()
      check(color(lyrics) === getComputedStyle(lyricsClock).getPropertyValue('--album-surface-color').trim(), 'Lyrics reopened during the transition at the wrong color')
      await wait(180)
      const fresh = document.createElement('div'); fresh.className = 'album-more-gallery'; main.append(fresh)
      const freshHero = document.createElement('div'); freshHero.className = 'album-hero-content-stage'; main.append(freshHero)
      await frame(); await frame()
      check(color(gallery) === color(fresh), 'A newly mounted gallery skipped the transition: ' + color(gallery) + ' / ' + color(fresh))
      check(getComputedStyle(hero, '::before').backgroundImage === getComputedStyle(freshHero, '::before').backgroundImage, 'A newly mounted hero skipped the transition')
      check(getComputedStyle(hero, '::before').backgroundImage.includes(color(main)), 'Hero fade is not using the current main color')
      check(color(side) === color(lyrics), 'Reserved sidebar and lyrics are out of sync')
      await wait(700)
      check(color(main) === targets[0] && color(side) === targets[1] && color(lyrics) === targets[2] && color(gallery) === targets[3], 'Entry did not reach target colors')
      shell.style.setProperty('--album-detail-main', 'rgb(190, 120, 90)')
      shell.style.setProperty('--album-detail-more', 'rgb(170, 100, 70)')
      await frame(); await frame(); await wait(120)
      const interruptedGallery = document.createElement('div'); interruptedGallery.className = 'album-more-gallery'; main.append(interruptedGallery)
      await frame(); await frame()
      check(color(gallery) === color(interruptedGallery), 'Late gallery missed the changed palette')
      apply()
      await frame(); await frame(); await frame()
      check(color(gallery) === color(interruptedGallery), 'Retargeted late gallery is out of sync: ' + color(gallery) + ' / ' + color(interruptedGallery))
      check(getComputedStyle(hero, '::before').backgroundImage === getComputedStyle(freshHero, '::before').backgroundImage, 'Retargeted late hero is out of sync')
      await wait(700)
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      await frame(); await frame(); assertTimeline()
      await wait(700)
      check(color(main) === 'rgb(32, 32, 32)' && color(side) === 'rgb(24, 24, 24)' && color(lyrics) === 'rgb(24, 24, 24)', 'Exit did not restore original colors')
      lyrics.classList.add('now-playing-panel--collapsed')
      apply(); shell.classList.add('has-album-detail-color')
      await frame(); await frame(); await wait(150)
      lyrics.classList.remove('now-playing-panel--collapsed')
      await frame(); await frame()
      check(color(lyrics) === getComputedStyle(lyricsClock).getPropertyValue('--album-surface-color').trim(), 'Reopened lyrics skipped the current transition')
      await wait(700)
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      await wait(700)
      shell.classList.add('is-lyrics-floating'); await wait(700)
      apply(); shell.classList.add('has-album-detail-color')
      await frame(); await frame(); assertTimeline()
      await wait(120)
      const reducedGallery = document.createElement('div'); reducedGallery.className = 'album-more-gallery'; main.append(reducedGallery)
      await frame(); await frame()
      document.documentElement.dataset.reducedMotion = 'true'
      await frame(); await frame(); await frame()
      check(color(lyrics) === targets[2], 'Floating lyrics did not reach its target')
      check(color(reducedGallery) === targets[3], 'Reduced motion did not settle a late gallery')
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      await frame(); await frame()
      check([main, side, lyrics, clock, gallery].every(el => !animation(el)), 'Reduced motion should disable color transitions')
      shell.classList.remove('is-lyrics-floating')
      shell.style.setProperty('--album-detail-main-text', 'rgb(60 60 60)')
      shell.style.setProperty('--album-detail-divider', 'rgb(60 60 60)')
      shell.style.setProperty('--album-detail-side-text', 'rgb(40 40 40)')
      shell.style.setProperty('--album-detail-side-muted', 'rgb(55 55 55)')
      shell.style.setProperty('--album-detail-side-faint', 'rgb(55 55 55)')
      shell.style.setProperty('--album-detail-lyrics-active', 'rgb(32 32 32)')
      shell.style.setProperty('--album-detail-lyrics-inactive', 'rgb(60 60 60)')
      shell.style.setProperty('--album-detail-lyrics-muted', 'rgb(55 55 55)')
      shell.style.setProperty('--album-detail-more-text', 'rgb(45 45 45)')
      shell.style.setProperty('--album-detail-more-faint', 'rgb(55 55 55)')
      document.documentElement.dataset.reducedMotion = 'false'
      await frame(); await frame()
      apply(); shell.classList.add('has-album-detail-color')
      const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1
      const ctx = canvas.getContext('2d', {willReadFrequently: true})
      const rgb = (value, backdrop) => { ctx.clearRect(0,0,1,1);if(backdrop){ctx.fillStyle=backdrop;ctx.fillRect(0,0,1,1)}ctx.fillStyle=value;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data].slice(0,3) }
      const lum = color => color.map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4).reduce((sum,v,i)=>sum+v*[.2126,.7152,.0722][i],0)
      const ratio = (a,b) => { const x=lum(a),y=lum(b);return (Math.max(x,y)+.05)/(Math.min(x,y)+.05) }
      let minMain = Infinity, minLyrics = Infinity, minSidebar = Infinity, minMore = Infinity, worstLyrics = null, lyricFrames = null, worstSidebar = null
      const start = performance.now()
      while(performance.now()-start<620) {
        await frame()
        if (!lyricFrames) lyricFrames = lyricsClock.getAnimations().map(a=>a.effect.getKeyframes())
        minMain = Math.min(minMain, ratio(rgb(getComputedStyle(main).getPropertyValue('--auralis-text')), rgb(color(main))))
        const sideRatio = ratio(rgb(getComputedStyle(side).getPropertyValue('--auralis-text')), rgb(color(side)))
        if (sideRatio < minSidebar) { minSidebar = sideRatio; worstSidebar = {at:performance.now()-start, fg:getComputedStyle(side).getPropertyValue('--auralis-text'), bg:color(side)} }
        minMore = Math.min(minMore, ratio(rgb(getComputedStyle(gallery).getPropertyValue('--album-detail-more-text')), rgb(color(gallery))))
        check(getComputedStyle(main).getPropertyValue('--auralis-text').trim() === getComputedStyle(main).getPropertyValue('--album-detail-divider').trim(), 'Track divider and text colors differ during transition')
        const lyricRatio = ratio(rgb(getComputedStyle(lyrics).getPropertyValue('--auralis-lyrics-active')), rgb(color(lyrics),'rgb(32,32,32)'))
        if(lyricRatio < minLyrics){minLyrics=lyricRatio;worstLyrics={at:performance.now()-start, fg:getComputedStyle(lyrics).getPropertyValue('--auralis-lyrics-active'), bg:color(lyrics)}}
      }
      check(minLyrics >= 4.5, 'Lyrics foreground was unreadable during transition: '+minLyrics+' '+JSON.stringify(worstLyrics)+' '+JSON.stringify(lyricFrames))
      check(minMain >= 4.5, 'Main foreground was unreadable during transition: '+minMain)
      check(minSidebar >= 4.5, 'Sidebar foreground was unreadable during transition: '+minSidebar+' '+JSON.stringify(worstSidebar))
      check(minMore >= 4.5, 'Recommendation foreground was unreadable during transition: '+minMore)
      await wait(700)
      shell.classList.add('is-lyrics-floating')
      await frame(); await frame()
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      let minFloatingExit = Infinity, worstFloatingExit = null
      const exitStart = performance.now()
      while (performance.now() - exitStart < 620) {
        await frame()
        const background = color(main)
        const foreground = getComputedStyle(lyrics).getPropertyValue('--auralis-lyrics-active')
        const contrast = ratio(rgb(foreground), rgb(color(lyrics), background))
        if (contrast < minFloatingExit) { minFloatingExit = contrast; worstFloatingExit = { at: performance.now() - exitStart, foreground, surface: color(lyrics), background } }
      }
      check(minFloatingExit >= 4.5, 'Floating lyrics exit was unreadable: ' + minFloatingExit + ' ' + JSON.stringify(worstFloatingExit))
      await wait(700)
      shell.classList.remove('is-lyrics-floating')
      await wait(700)
      apply(); shell.classList.add('has-album-detail-color')
      await wait(700)
      properties.forEach(property => shell.style.removeProperty(property)); shell.classList.remove('has-album-detail-color')
      await wait(100)
      shell.classList.add('is-lyrics-floating')
      let minDelayedFloating = Infinity, worstDelayedFloating = null
      const delayedStart = performance.now()
      while (performance.now() - delayedStart < 600) {
        await frame()
        const background = color(main)
        const foreground = getComputedStyle(lyrics).getPropertyValue('--auralis-lyrics-active')
        const contrast = ratio(rgb(foreground), rgb(color(lyrics), background))
        if (contrast < minDelayedFloating) { minDelayedFloating = contrast; worstDelayedFloating = { at: performance.now() - delayedStart, foreground, surface: color(lyrics), background } }
      }
      check(minDelayedFloating >= 4.5, 'Delayed floating lyrics exit was unreadable: ' + minDelayedFloating + ' ' + JSON.stringify(worstDelayedFloating))
      dispose()
      return 'Entry, late gallery and hero, exit, floating lyrics, reduced motion and foreground contrast passed.'
    })()`,
      )
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
