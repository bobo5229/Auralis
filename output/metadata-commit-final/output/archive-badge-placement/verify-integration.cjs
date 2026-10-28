const { app, BrowserWindow, ipcMain, protocol } = require('electron')
const fs = require('node:fs')
const fsp = require('node:fs/promises')
const path = require('node:path')
const os = require('node:os')
const Database = require('better-sqlite3')
const { PlayStatsRepository, browserPreviewApi, ipcChannels } = require('./readers.cjs')
const root = path.resolve(__dirname, '../..')
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'auralis-archive-placement-'))
app.setPath('userData', profile)
app.setPath('sessionData', profile)
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'auralis-artwork',
    privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true },
  },
])
const errors = []

let db
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
app
  .whenReady()
  .then(async () => {
    db = new Database(path.join(root, 'data/user-data/data/auralis.sqlite'), {
      readonly: true,
      fileMustExist: true,
    })
    db.pragma('query_only = ON')
    const repo = new PlayStatsRepository(db)
    const readonlyArchive = {
      getAnnualPlayCounts: (payload) => repo.getAnnualPlayCounts(payload.year),
      getDayTopAlbums: (payload) => repo.getDayTopAlbums(payload.date),
      getDayTopTracks: (payload) => repo.getDayTopTracks(payload.date),
    }
    const requests = []
    for (const [group, methods] of Object.entries(ipcChannels)) {
      for (const [method, channel] of Object.entries(methods)) {
        ipcMain.handle(channel, async (_event, payload) => {
          requests.push(`${group}.${method}`)
          if (group === 'archive' && readonlyArchive[method])
            return readonlyArchive[method](payload)
          // All other operations use inert preview responses. No production service is started.
          return browserPreviewApi[group][method](payload)
        })
      }
    }
    protocol.handle('auralis-artwork', async (request) => {
      const url = new URL(request.url)
      const key = decodeURIComponent(url.hostname + (url.pathname === '/' ? '' : url.pathname))
      if (!/^(?:[a-f0-9]{64}\.(jpg|png|webp)|v2-[a-f0-9]{64}\.webp)$/.test(key))
        return new Response(null, { status: 400 })
      try {
        const content = await fsp.readFile(path.join(root, 'data/user-data/artwork-cache', key))
        return new Response(content, {
          headers: {
            'Content-Type': key.endsWith('.png')
              ? 'image/png'
              : key.endsWith('.webp')
                ? 'image/webp'
                : 'image/jpeg',
            'Access-Control-Allow-Origin': '*',
          },
        })
      } catch {
        return new Response(null, { status: 404 })
      }
    })
    const win = new BrowserWindow({
      show: false,
      width: 1440,
      height: 960,
      useContentSize: true,
      webPreferences: {
        preload: path.join(__dirname, 'preload.cjs'),
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        offscreen: true,
        backgroundThrottling: false,
      },
    })
    win.webContents.setFrameRate(60)
    win.webContents.on('console-message', (_event, level, message) => {
      if (level >= 2) {
        errors.push(message)
        console.log(message)
      }
    })
    win.webContents.on('render-process-gone', (_event, detail) => {
      console.error(detail)
      app.exit(2)
    })
    await win.loadURL('http://127.0.0.1:5192')
    for (let i = 0; i < 100; i++) {
      if (await win.webContents.executeJavaScript('!!window.__auralisAppReady')) break
      await sleep(150)
    }
    await win.webContents.executeJavaScript(`document.querySelector('a[href$="/archive"]').click()`)
    for (let i = 0; i < 100; i++) {
      if (
        await win.webContents.executeJavaScript(`!!document.querySelector('.archive-album-slot')`)
      )
        break
      await sleep(150)
    }
    await win.webContents.executeJavaScript('document.fonts.ready')
    await sleep(1500)
    const checks = []
    const assert = (name, ok, details) => {
      checks.push({ name, pass: !!ok, details })
      if (!ok) throw new Error(name + ': ' + JSON.stringify(details))
    }
    const evaluate = (source) => win.webContents.executeJavaScript(source)
    const waitFor = async (source) => {
      for (let i = 0; i < 80; i++) {
        if (await evaluate(source)) return
        await sleep(50)
      }
      console.log(
        JSON.stringify(
          await evaluate(
            `({active:document.activeElement?.outerHTML?.slice(0,400),dialog:!!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)'),expanded:document.querySelector('[data-milestone-gallery-trigger]')?.getAttribute('aria-expanded'),ready:window.__auralisAppReady,inert:document.querySelector('#app')?.inert,visibility:document.visibilityState,dpr:devicePixelRatio,preview:document.querySelector('.archive-milestone-preview')?.__vueParentComponent.exposed.snapshot()})`,
          ),
        ),
      )
      throw new Error('Timed out: ' + source)
    }
    const screenshot = async (name) => {
      await waitFor(`(() => {const panel=document.querySelector('[role=dialog]:has(.archive-milestone-gallery)');return !panel||getComputedStyle(panel).opacity==='1'})()`)
      await fsp.writeFile(
        path.join(__dirname, name + '.png'),
        (await win.webContents.capturePage()).toPNG(),
      )
    }
    const measure = () =>
      evaluate(`(() => {
    const box=s=>document.querySelector(s)?.getBoundingClientRect().toJSON();
    const panel=document.querySelector('.archive-milestone-case');
    const header=panel.querySelector('h2').getBoundingClientRect();
    const button=panel.querySelector('button').getBoundingClientRect();
    const images=[...panel.querySelectorAll('img')].map(img=>({loaded:img.complete&&img.naturalWidth>0,src:img.getAttribute('src'),box:img.getBoundingClientRect().toJSON()}));
    return {viewport:{width:innerWidth,height:innerHeight,dpr:devicePixelRatio},case:box('.archive-milestone-case'),banner:box('.archive-season-banner'),heatmap:box('.annual-heatmap'),header:header.toJSON(),button:button.toJSON(),images};
  })()`)
    await waitFor(
      `document.querySelectorAll('.archive-milestone-case img').length===3 && [...document.querySelectorAll('.archive-milestone-case img')].every(img=>img.complete&&img.naturalWidth>0)`,
    )
    const desktop = await measure()
    assert(
      'case sits beside banner at approved height',
      Math.abs(desktop.case.top - desktop.banner.top) < 1 &&
        desktop.case.left > desktop.banner.right &&
        desktop.case.height <= 126,
      desktop,
    )
    const checkGeometry = (name, data) =>
      assert(
        name,
        data.header.right < data.button.left &&
          data.images.every(
            (img) =>
              img.loaded &&
              img.box.top >= data.header.bottom &&
              img.box.left >= data.case.left &&
              img.box.right <= data.case.right &&
              img.box.bottom <= data.case.bottom,
          ),
        data,
      )
    checkGeometry('desktop case has no clipped content', desktop)
    await waitFor(
      `document.querySelector('.archive-day-album-stage')?.getAttribute('aria-busy')==='false'`,
    )
    await sleep(250)
    await screenshot('integrated-desktop')
    const before = desktop.images.map((img) => img.src)
    await evaluate(`document.querySelector('.archive-year-chevron').click()`)
    await waitFor(`document.querySelector('.archive-year')?.getAttribute('aria-label')==='2025'`)
    assert(
      'changing year preserves lifetime catalogue',
      JSON.stringify((await measure()).images.map((img) => img.src)) === JSON.stringify(before),
    )
    await evaluate(`document.querySelectorAll('.archive-year-chevron')[1].click()`)
    await waitFor(`document.querySelector('.archive-year')?.getAttribute('aria-label')==='2026'`)
    await evaluate(`document.querySelector('[data-milestone-gallery-trigger]').focus()`)
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Return' })
    win.webContents.sendInputEvent({ type: 'char', keyCode: '\r' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Return' })
    await waitFor(
      `!!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)') && document.querySelector('[role=dialog]:has(.archive-milestone-gallery)').contains(document.activeElement)`,
    )
    await sleep(250)
    assert(
      'view all opens 11 badge designs',
      await evaluate(
        `document.querySelectorAll('.archive-milestone-gallery__badges li').length===11`,
      ),
    )
    await waitFor(
      `[...document.querySelectorAll('.archive-milestone-gallery img')].every(img=>img.complete&&img.naturalWidth>0)`,
    )
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready'`)
    const inspection = `document.querySelector('.archive-milestone-preview').__vueParentComponent.exposed`
    const snapshot = () => evaluate(`${inspection}.snapshot()`)
    await evaluate(`void(window.__badgeInspection=${inspection})`)
    assert('only selected badge owns a canvas', await evaluate(`document.querySelectorAll('.archive-milestone-gallery canvas').length===1`))
    assert('case uses generated GLSL images', desktop.images.every(img => img.src.includes('/previews/') && img.src.endsWith('-lit.png')), desktop.images)
    const entries = JSON.parse(await fsp.readFile(path.join(root,'src/renderer/features/archive/assets/milestones/materials/manifest.json'),'utf8')).badges
    for (const entry of Object.values(entries)) {
      for (const [index,state] of ['lit','unlit'].entries()) {
        await evaluate(`document.querySelector('[data-badge-select="${entry.catalogId}"]').click(); document.querySelectorAll('.archive-milestone-gallery__states button')[${index}].click()`)
        await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready' && ${inspection}.snapshot().badgeId==='${entry.id}' && ${inspection}.snapshot().state==='${state}'`)
        const value=await snapshot()
        assert(`${entry.id}/${state} loads a complete texture set`, value.textures===5 && !value.failed, value)
      }
    }
    await evaluate(`document.querySelector('[data-badge-select="hours100"]').click(); document.querySelectorAll('.archive-milestone-gallery__states button')[0].click()`)
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready' && ${inspection}.snapshot().badgeId==='hours-100' && ${inspection}.snapshot().state==='lit'`)
    await evaluate(`document.querySelector('.archive-milestone-preview').focus()`)
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Right'})
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Right'})
    await waitFor(`${inspection}.snapshot().pose.y===2 && !${inspection}.snapshot().running`)
    assert('native arrow input tilts badge', (await snapshot()).pose.y===2)
    win.webContents.sendInputEvent({type:'keyDown',keyCode:'Home'})
    win.webContents.sendInputEvent({type:'keyUp',keyCode:'Home'})
    await waitFor(`${inspection}.snapshot().pose.y===0 && !${inspection}.snapshot().running`)
    const idle=(await snapshot()).frames
    await sleep(250)
    assert('product preview stops drawing at rest', (await snapshot()).frames===idle)
    const pointer=`(() => {const node=document.querySelector('.archive-milestone-preview'),box=node.getBoundingClientRect();node.dispatchEvent(new PointerEvent('pointermove',{clientX:box.right,clientY:box.top,pointerType:'mouse'}))})()`
    await evaluate(pointer)
    await waitFor(`${inspection}.snapshot().pose.x===8 && ${inspection}.snapshot().pose.y===8 && !${inspection}.snapshot().running`)
    assert('pointer tilt is bounded at 8 degrees', true)
    win.webContents.send(ipcChannels.window.visibilityChanged,{isVisible:false})
    await sleep(50)
    await evaluate(`document.querySelector('.archive-milestone-preview').dispatchEvent(new PointerEvent('pointerleave'))`)
    const hidden=(await snapshot()).frames
    await sleep(120)
    assert('native hidden event suspends rendering', (await snapshot()).frames===hidden)
    win.webContents.send(ipcChannels.window.visibilityChanged,{isVisible:true})
    await waitFor(`${inspection}.snapshot().pose.x===0 && ${inspection}.snapshot().pose.y===0 && !${inspection}.snapshot().running`)
    await evaluate(`(async()=>{const {setMotionPreference}=await import('/shared/animation/motionPreference.ts');setMotionPreference('reduce')})()`)
    await waitFor(`${inspection}.snapshot().reducedMotion`)
    await evaluate(pointer)
    await sleep(100)
    assert('in-app reduced motion prevents hover tilt', (await snapshot()).pose.y===0)
    await evaluate(`(async()=>{const {setMotionPreference}=await import('/shared/animation/motionPreference.ts');setMotionPreference('system')})()`)
    win.webContents.debugger.attach('1.3')
    for (const dpr of [1,1.25,2]) {
      await win.webContents.debugger.sendCommand('Emulation.setDeviceMetricsOverride',{width:1440,height:960,deviceScaleFactor:dpr,mobile:false})
      await waitFor(`Math.abs(${inspection}.snapshot().dpr-${dpr})<0.01`)
      assert(`product DPR ${dpr}`, Math.abs((await snapshot()).dpr-dpr)<0.01)
    }
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]})
    await waitFor(`${inspection}.snapshot().reducedMotion`)
    await evaluate(pointer)
    await sleep(100)
    assert('system reduced motion prevents hover tilt', (await snapshot()).pose.y===0)
    await win.webContents.debugger.sendCommand('Emulation.setEmulatedMedia',{features:[]})
    await win.webContents.debugger.sendCommand('Emulation.clearDeviceMetricsOverride')
    win.webContents.debugger.detach()
    // Allow Vue to render each choice while the previous texture load is in flight.
    for (const entry of Object.values(entries)) {
      await evaluate(`document.querySelector('[data-badge-select="${entry.catalogId}"]').click()`)
    }
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready' && ${inspection}.snapshot().badgeId==='albums-live' && ${inspection}.snapshot().textures===5`)
    assert('rapid selection commits only the final texture set', (await snapshot()).badgeId==='albums-live')
    await evaluate(`document.querySelector('[data-badge-select="hours100"]').click()`)
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready' && ${inspection}.snapshot().badgeId==='hours-100'`)
    await screenshot('integrated-gallery')
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' })
    await sleep(80)
    assert(
      'keyboard focus stays inside gallery',
      await evaluate(
        `document.querySelector('[role=dialog]:has(.archive-milestone-gallery)').contains(document.activeElement)`,
      ),
    )
    win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
    win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
    await waitFor(
      `!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)') && document.activeElement===document.querySelector('[data-milestone-gallery-trigger]')`,
    )
    assert('Escape closes and restores focus', true)
    await waitFor(`window.__badgeInspection.snapshot().disposed && window.__badgeInspection.snapshot().textures===0`)
    assert('closing gallery releases textures and renderer', true)
    await evaluate(`document.querySelector('[data-milestone-gallery-trigger]').click()`)
    await waitFor(`!!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)')`)
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready'`)
    await evaluate(`void(window.__badgeInspection=${inspection})`)
    await evaluate(`${inspection}.forceContextLoss()`)
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='fallback'`)
    assert('WebGL loss displays GLSL static fallback', await evaluate(`(() => {const node=document.querySelector('.archive-milestone-preview'),image=node.querySelector('img');return image.complete&&image.naturalWidth===330&&getComputedStyle(image).visibility!=='hidden'&&${inspection}.snapshot().disposed})()`))
    await evaluate(`document.querySelector('[data-badge-select="days30"]').click();document.querySelectorAll('.archive-milestone-gallery__states button')[1].click()`)
    await waitFor(`document.querySelector('.archive-milestone-preview img')?.getAttribute('src').includes('days-30-unlit.png')`)
    assert('fallback follows badge and appearance selection', true)
    await screenshot('integrated-fallback')
    await evaluate(
      `document.querySelector('[role=dialog]:has(.archive-milestone-gallery) .auralis-dialog-close').click()`,
    )
    await waitFor(
      `!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)') && document.activeElement===document.querySelector('[data-milestone-gallery-trigger]')`,
    )
    assert('close button restores focus', true)
    await evaluate(`document.querySelector('[data-milestone-gallery-trigger]').click()`)
    await waitFor(`!!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)')`)
    await sleep(200)
    win.webContents.sendInputEvent({
      type: 'mouseDown',
      x: 10,
      y: 10,
      button: 'left',
      clickCount: 1,
    })
    win.webContents.sendInputEvent({ type: 'mouseUp', x: 10, y: 10, button: 'left', clickCount: 1 })
    await waitFor(`!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)')`)
    assert('backdrop closes gallery', true)
    win.setContentSize(1100, 800)
    await sleep(600)
    const compact = await measure()
    checkGeometry('compact case fits', compact)
    await screenshot('integrated-compact')
    win.setContentSize(900, 760)
    await sleep(600)
    const narrow = await measure()
    assert(
      'narrow layout becomes a compact strip',
      narrow.case.top >= narrow.banner.bottom && narrow.case.height <= 72,
      narrow,
    )
    assert(
      'narrow strip keeps badges inside',
      narrow.images.every(
        (img) =>
          img.box.left >= narrow.case.left &&
          img.box.right <= narrow.case.right &&
          img.box.bottom <= narrow.case.bottom,
      ),
      narrow,
    )
    await screenshot('integrated-narrow')
    await evaluate(`document.querySelector('[data-milestone-gallery-trigger]').click()`)
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready'`)
    assert('gallery fits narrow window without horizontal overflow', await evaluate(`(() => {const panel=document.querySelector('[role=dialog]:has(.archive-milestone-gallery)'),body=panel.querySelector('.auralis-dialog-body');return body.scrollWidth<=body.clientWidth+1})()`))
    await screenshot('integrated-narrow-gallery')
    await evaluate(`document.querySelector('[role=dialog]:has(.archive-milestone-gallery) .auralis-dialog-close').click()`)
    await waitFor(`!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)')`)
    win.setContentSize(1440, 960)
    await sleep(600)
    await evaluate(`document.querySelector('[data-theme-toggle]').click()`)
    await waitFor(`document.documentElement.dataset.theme==='light'`)
    await screenshot('integrated-light')
    await evaluate(
      `(async()=>{const {i18n}=await import('/i18n/index.ts');i18n.global.locale.value='en'})()`,
    )
    await sleep(300)
    const english = await measure()
    checkGeometry('English labels fit', english)
    assert(
      'English labels translated',
      await evaluate(
        `document.querySelector('.archive-milestone-case h2').textContent==='Listening mementos'`,
      ),
    )
    await screenshot('integrated-english-light')
    await evaluate(`document.querySelector('[data-milestone-gallery-trigger]').click()`)
    await waitFor(`!!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)')`)
    await sleep(250)
    await waitFor(`document.querySelector('.archive-milestone-preview')?.dataset.renderState==='ready'`)
    await evaluate(`void(window.__badgeInspection=${inspection})`)
    await screenshot('integrated-english-gallery')
    await evaluate(
      `(async()=>{const router=document.querySelector('#app').__vue_app__.config.globalProperties.$router;await router.push('/songs');return {path:router.currentRoute.value.path,hash:location.hash}})()`,
    )
    await waitFor(
      `!document.querySelector('[role=dialog]:has(.archive-milestone-gallery)') && !document.querySelector('.archive-milestone-case')`,
    )
    assert(
      'leaving archive removes gallery and releases background',
      await evaluate(`![...document.querySelectorAll('#app,[data-app-content]')].some(e=>e.inert)`),
    )
    await waitFor(`window.__badgeInspection.snapshot().disposed && window.__badgeInspection.snapshot().textures===0`)
    assert('route exit disposes preview resources', true)
    const fatalErrors = errors.filter((message) => !message.startsWith('[intlify]'))
    assert('no renderer errors', fatalErrors.length === 0, fatalErrors)
    await fsp.writeFile(
      path.join(__dirname, 'integration-report.json'),
      JSON.stringify(
        {
          scope:
            'Actual integrated ArchivePage and milestone components, real repository queries over read-only local DB; other IPC uses inert preview responses; no prototype DOM/CSS injection',
          checks,
          desktop,
          compact,
          narrow,
          english,
          errors,
        },
        null,
        2,
      ),
    )
    console.log(JSON.stringify({ passed: true, checks: checks.length }))
    win.destroy()
    db.close()
    app.exit(0)
  })
  .catch((error) => {
    console.error(error)
    if (db) db.close()
    app.exit(1)
  })
