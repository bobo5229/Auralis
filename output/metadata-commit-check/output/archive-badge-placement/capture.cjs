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
const suedePreview = process.env.BADGE_SUEDE_PREVIEW === '1'
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
    const geometry = () =>
      win.webContents.executeJavaScript(
        `({ viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, theme: document.documentElement.dataset.theme, blocks: Object.fromEntries(['.archive-page','.archive-season-banner','.annual-heatmap','.archive-day-albums','.archive-day-albums-header','.archive-day-albums-panel','.archive-day-tracks-panel'].map(s=>{ const e=document.querySelector(s); return [s,e ? { ...e.getBoundingClientRect().toJSON(), scrollHeight:e.scrollHeight, clientHeight:e.clientHeight } : null] })), date:document.querySelector('time')?.dateTime, albums:document.querySelectorAll('.archive-album-slot').length, text:document.querySelector('.archive-page')?.innerText })`,
      )
    const desktop = await geometry()
    await fsp.writeFile(
      path.join(__dirname, 'current-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.setContentSize(1100, 800)
    await sleep(700)
    const compact = await geometry()
    await fsp.writeFile(
      path.join(__dirname, 'current-compact.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.setContentSize(1440, 960)
    await sleep(500)
    const badgePaths = [
      'hours/assets/hours-100@2x.png',
      'days/assets/days-30@2x.png',
      'albums/assets/albums-1@2x.png',
    ]
    const badgeSources = badgePaths.map(
      (file) =>
        `data:image/png;base64,${fs.readFileSync(path.join(root, 'demo/archive/enamel-milestone', file)).toString('base64')}`,
    )
    await win.webContents.executeJavaScript(`(() => {
    const banner = document.querySelector('.archive-season-banner')
    const row = document.createElement('div')
    row.className = 'placement-top-row'
    banner.before(row)
    row.append(banner)
    const panel = document.createElement('section')
    panel.className = 'placement-badges'
    panel.innerHTML = '<header><span>聆听纪念</span><span class="placement-more">查看全部 ↗</span></header><div class="placement-badge-row">' + ${JSON.stringify(badgeSources)}.map(src => '<img src="'+src+'" alt="徽章布局示意" />').join('') + '</div>'
    row.append(panel)
    const style = document.createElement('style')
    style.textContent = '.archive-calendar-section{container-type:inline-size}.placement-top-row{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(260px,1fr);gap:16px;margin:0 2px 20px;align-items:stretch}.placement-top-row>.archive-seasons{margin:0}.placement-top-row .season-placeholder{height:140px;opacity:1!important}.placement-top-row .season-mesh,.placement-top-row .season-snapshot{display:none}.placement-badges{display:flex;flex-direction:column;justify-content:space-between;min-width:0;border-radius:10px;padding:12px 16px 6px;background:var(--auralis-surface-raised);border:1px solid var(--auralis-border-subtle)}.placement-badges header{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:var(--auralis-type-control-size);line-height:var(--auralis-type-control-line-height);font-weight:500}.placement-more{font-size:var(--auralis-type-caption-size);color:var(--auralis-text-muted);font-weight:400}.placement-badge-row{display:flex;align-items:center;justify-content:space-evenly;gap:6px}.placement-badge-row img{width:76px;height:85px;object-fit:contain;filter:drop-shadow(0 3px 4px rgb(0 0 0 / 18%))}@container(max-width:640px){.placement-top-row{grid-template-columns:minmax(0,1fr)}.placement-top-row .season-placeholder{height:124px}.placement-badges{height:64px;flex-direction:row;align-items:center;gap:12px;padding:8px 16px}.placement-badges header{flex-direction:column;align-items:flex-start}.placement-badge-row img{width:44px;height:50px}}'
    document.head.append(style)
    const note=document.createElement('div')
    note.textContent='Badge 放置示意 · 非实际解锁状态'
    Object.assign(note.style,{position:'fixed',right:'16px',bottom:'12px',zIndex:'9999',fontSize:'12px',color:'#b0b6bd',background:'#202124',padding:'6px 10px',borderRadius:'5px',pointerEvents:'none'})
    document.body.append(note)
  })()`)
    if (suedePreview) {
      const install = require('./install-suede-case.cjs')
      const css = await fsp.readFile(path.join(__dirname, 'suede-case.css'), 'utf8')
      await win.webContents.executeJavaScript(`(${install.toString()})(${JSON.stringify(css)})`)
    }
    await sleep(500)
    const proposedDesktop = await geometry()
    await fsp.writeFile(
      path.join(__dirname, suedePreview ? 'suede-desktop.png' : 'proposed-desktop.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    win.setContentSize(1100, 800)
    await sleep(500)
    const proposedCompact = await geometry()
    await fsp.writeFile(
      path.join(__dirname, suedePreview ? 'suede-compact.png' : 'proposed-compact.png'),
      (await win.webContents.capturePage()).toPNG(),
    )
    let material = null
    if (suedePreview) {
      material = await win.webContents.executeJavaScript(`(() => {
      const panel=document.querySelector('.commemoration-case');
      const header=panel.querySelector('header').getBoundingClientRect();
      const images=[...panel.querySelectorAll('img')];
      const rect=panel.getBoundingClientRect();
      return {box:rect.toJSON(),header:header.toJSON(),images:images.map(img=>({loaded:img.complete&&img.naturalWidth>0,box:img.getBoundingClientRect().toJSON()}))};
    })()`)
      if (
        material.images.length !== 3 ||
        material.images.some(
          (img) =>
            !img.loaded ||
            img.box.top < material.header.bottom ||
            img.box.right > material.box.right ||
            img.box.bottom > material.box.bottom,
        )
      )
        throw new Error('Badge material preview has missing assets or overlap')
      win.setContentSize(900, 760)
      await sleep(500)
      await fsp.writeFile(
        path.join(__dirname, 'suede-narrow.png'),
        (await win.webContents.capturePage()).toPNG(),
      )
      win.setContentSize(1440, 960)
      await sleep(400)
      await win.webContents.executeJavaScript(`(() => {
      const stage=document.createElement('div');stage.className='suede-closeup-stage';
      Object.assign(stage.style,{position:'fixed',inset:'0',zIndex:'99999',display:'grid',placeItems:'center',background:'#111214'});
      const clone=document.querySelector('.commemoration-case').cloneNode(true);
      Object.assign(clone.style,{width:'300px',height:'124px',minHeight:'124px',transform:'scale(3)',transformOrigin:'center',boxSizing:'border-box'});
      stage.append(clone);document.body.append(stage);
      const label=document.createElement('p');label.textContent='聆听纪念 · 材质局部放大';
      Object.assign(label.style,{position:'absolute',bottom:'60px',fontSize:'14px',letterSpacing:'0.08em',color:'#8c939d'});stage.append(label);
    })()`)
      await sleep(300)
      await fsp.writeFile(
        path.join(__dirname, 'suede-closeup.png'),
        (await win.webContents.capturePage()).toPNG(),
      )
    }
    await fsp.writeFile(
      path.join(__dirname, suedePreview ? 'suede-report.json' : 'report.json'),
      JSON.stringify(
        {
          scope:
            'Current full renderer and production archive repository queries; readonly local database; artwork cache read-only; all other APIs inert preview responses; temporary profile; no playback. Proposal images inject temporary DOM/CSS only; badge examples do not indicate actual awards.',
          profile,
          desktop,
          compact,
          proposedDesktop,
          proposedCompact,
          material,
          requests: [...new Set(requests)],
          errors,
        },
        null,
        2,
      ),
    )
    console.log(JSON.stringify({ desktop, compact, errors }))
    win.destroy()
    db.close()
    // This one-shot offscreen harness has no user windows or lifecycle to preserve.
    // Exit after all evidence writes, instead of running production-style quit callbacks.
    if (suedePreview) app.exit(0)
    else app.quit()
  })
  .catch((error) => {
    console.error(error)
    if (db) db.close()
    app.exit(1)
  })
