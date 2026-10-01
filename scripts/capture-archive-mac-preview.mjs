// electron scripts/capture-archive-mac-preview.mjs — run after npm run build.
// Production main/preload/renderer with an isolated database; no mocked IPC handlers.
import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const workspace = resolve(import.meta.dirname, '..')
const require = createRequire(join(workspace, 'package.json'))
const profile = mkdtempSync(join(tmpdir(), 'auralis-mac-preview-'))
const phase4 = process.argv.includes('--phase4')
const output = join(
  workspace,
  phase4 ? '.electron-home/archive-mac-playback' : '.electron-home/archive-mac-preview',
)
mkdirSync(output, { recursive: true })
mkdirSync(join(profile, 'data'))
mkdirSync(join(profile, 'cache'))
writeFileSync(join(profile, 'data/auralis.sqlite'), '') // Bypass development legacy database copy.
const setPath = app.setPath.bind(app)
app.setPath = (name, path) =>
  setPath(name, name === 'userData' ? profile : name === 'cache' ? join(profile, 'cache') : path)
setPath('userData', profile)
BrowserWindow.prototype.show = function () {
  this.setPosition(-10000, -10000)
  this.showInactive()
}
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows')
const wait = (ms) => new Promise((r) => setTimeout(r, ms))
const dateKey = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const checks = [],
  captures = [],
  errors = []
const watchdog = setTimeout(() => {
  console.error('Mac preview timed out')
  app.exit(1)
}, 55000)

app.on('browser-window-created', (_event, win) => {
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error') errors.push(event.message)
  })
  win.webContents.on('render-process-gone', (_event, detail) =>
    errors.push(`renderer gone: ${detail.reason}`),
  )
  win.webContents.once('did-finish-load', async () => {
    const run = (code) => win.webContents.executeJavaScript(code)
    const root = "document.querySelector('.archive-mac-host')?.shadowRoot"
    const el = (id) => `${root}?.getElementById('${id}')`
    async function until(code) {
      for (let i = 0; i < 160; i++) {
        if (await run(code)) return
        await wait(50)
      }
      throw new Error(`Timed out: ${code}`)
    }
    async function shot(name) {
      await run('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))')
      const image = await win.webContents.capturePage()
      writeFileSync(join(output, name), image.toPNG())
      captures.push({ name, pixels: image.getSize(), viewport: win.getContentSize() })
    }
    try {
      await until(
        "document.querySelector('[data-app-shell-root]') && !document.querySelector('#app').inert",
      )
      const info = await run('auralis.app.getInfo()')
      assert.equal(resolve(info.databasePath), join(profile, 'data/auralis.sqlite'))
      const Database = require('better-sqlite3'),
        sharp = require('sharp')
      const db = new Database(info.databasePath)
      db.prepare('INSERT INTO library_roots (path) VALUES (?)').run(profile)
      const now = new Date(),
        year = now.getFullYear(),
        today = dateKey(now)
      const prev = new Date(now)
      prev.setDate(prev.getDate() - 1)
      const yesterday = dateKey(prev),
        historic = `${year - 2}-12-20`
      const artworkDir = join(profile, 'artwork-cache')
      mkdirSync(artworkDir, { recursive: true })
      // Real muted 120-second local WAV for continuity checks.
      const samples = 120 * 8000,
        wave = Buffer.alloc(44 + samples * 2)
      wave.write('RIFF')
      wave.writeUInt32LE(wave.length - 8, 4)
      wave.write('WAVEfmt ', 8)
      wave.writeUInt32LE(16, 16)
      wave.writeUInt16LE(1, 20)
      wave.writeUInt16LE(1, 22)
      wave.writeUInt32LE(8000, 24)
      wave.writeUInt32LE(16000, 28)
      wave.writeUInt16LE(2, 32)
      wave.writeUInt16LE(16, 34)
      wave.write('data', 36)
      wave.writeUInt32LE(samples * 2, 40)
      for (let i = 0; i < samples; i++)
        wave.writeInt16LE(Math.round(Math.sin((i * Math.PI * 2 * 220) / 8000) * 2000), 44 + i * 2)
      const wavePath = join(profile, 'fixture.wav')
      writeFileSync(wavePath, wave)
      for (let i = 1; i <= 7; i++) {
        if (phase4 && i !== 1) copyFileSync(wavePath, join(profile, `track-${i}.wav`))
        const title =
          i === 1
            ? '<b>玻璃花园</b> / Signal Garden'
            : i === 2
              ? '很长的中文专辑名称，用于检查完整五行以及省略号 / MEMORY ARCHIVE'
              : `Album ${i}`
        const key = i === 3 ? null : `v2-${String(i).padStart(64, '0')}.webp`
        if (key)
          await sharp(
            Buffer.from(
              `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512"><rect width="512" height="512" fill="${['#526b76', '#bb625d', '#6c8c70', '#927b54', '#786d9f', '#477b78', '#586694'][i - 1]}"/><circle cx="256" cy="230" r="140" fill="none" stroke="#fff" stroke-width="2"/><text x="40" y="440" font-size="46" fill="#fff">ALBUM ${i}</text></svg>`,
            ),
          )
            .webp()
            .toFile(join(artworkDir, key))
        db.prepare(
          'INSERT INTO tracks (id,file_path,title,artist,album,album_artist,duration_seconds) VALUES (?,?,?,?,?,?,?)',
        ).run(
          i,
          i === 1 ? wavePath : join(profile, `track-${i}.wav`),
          `Track ${i}`,
          `Artist ${i}`,
          title,
          `Artist ${i}`,
          120,
        )
        db.prepare('INSERT INTO track_metadata (track_id,artwork_cache_key) VALUES (?,?)').run(
          i,
          key,
        )
      }
      if (phase4) {
        const firstAlbum = db.prepare('SELECT album,album_artist FROM tracks WHERE id=1').get()
        copyFileSync(wavePath, join(profile, 'track-9.wav'))
        for (const [id, number, availability] of [
          [8, 0, 'missing'],
          [9, 2, 'available'],
        ]) {
          db.prepare(
            'INSERT INTO tracks (id,file_path,title,artist,album,album_artist,duration_seconds,track_no,availability) VALUES (?,?,?,?,?,?,?,?,?)',
          ).run(
            id,
            join(profile, `track-${id}.wav`),
            `Track ${id}`,
            'Artist 1',
            firstAlbum.album,
            firstAlbum.album_artist,
            120,
            number,
            availability,
          )
        }
        db.prepare('UPDATE tracks SET track_no=1 WHERE id=1').run()
      }
      function seed(date, pairs) {
        let count = 0
        for (const [id, plays] of pairs) {
          count += plays
          db.prepare(
            'INSERT INTO daily_track_play_stats (play_date,track_id,play_count,duration_seconds,last_played_at) VALUES (?,?,?,?,?)',
          ).run(date, id, plays, plays * 120, `${date}T12:00:00`)
        }
        db.prepare(
          'INSERT INTO daily_play_stats (play_date,play_count,duration_seconds) VALUES (?,?,?)',
        ).run(date, count, count * 120)
      }
      seed(today, [
        [1, 9],
        [2, 8],
        [3, 7],
        [4, 6],
        [5, 5],
        [6, 4],
        [7, 3],
      ])
      seed(yesterday, [
        [2, 3],
        [1, 1],
      ])
      seed(historic, [
        [3, 2],
        [2, 1],
      ])
      db.close()
      const daily = await run(`auralis.archive.getDailyAlbumStats('${today}')`)
      assert.equal(daily.date, today)
      assert.equal(daily.items.length, 5)
      const workerFile = readdirSync(join(workspace, 'out/renderer/assets')).find((f) =>
        /^coverQuantize\.worker-.*\.js$/.test(f),
      )
      const workerUrl = pathToFileURL(join(workspace, 'out/renderer/assets', workerFile)).href
      const paletteSize = await run(`new Promise((resolve,reject)=>{
        const worker=new Worker(${JSON.stringify(workerUrl)},{type:'module'});
        const timeout=setTimeout(()=>{worker.terminate();reject(Error('palette timeout'))},6000);
        worker.onerror=e=>{clearTimeout(timeout);worker.terminate();reject(Error(e.message))};
        worker.onmessage=e=>{clearTimeout(timeout);worker.terminate();if(e.data.error){reject(Error(e.data.error));return}const p=new Uint8Array(e.data.pixels),colors=new Set();for(let i=0;i<p.length;i+=4)colors.add(p[i]+','+p[i+1]+','+p[i+2]);resolve(colors.size)};
        const p=new Uint8Array(96*96*4);for(let i=0;i<p.length;i+=4){p[i]=(i/4*7)%256;p[i+1]=(i/4*13)%256;p[i+2]=Math.floor(i/96)%256;p[i+3]=255}
        worker.postMessage({taskId:'palette',revision:1,size:96,colors:32,strength:.65,pixels:p.buffer},[p.buffer]);
      })`)
      assert.ok(paletteSize > 1 && paletteSize <= 32)
      checks.push(`production image-q Worker: ${paletteSize} output colors`)
      const playbackFile = readdirSync(join(workspace, 'out/renderer/assets')).find((f) =>
        /^usePlayback-.*\.js$/.test(f),
      )
      const playbackUrl = pathToFileURL(join(workspace, 'out/renderer/assets', playbackFile)).href
      // Test-only import of the built public API. Nothing is exposed by production code.
      await run(
        `(async()=>{window.previewPlayback=(await import(${JSON.stringify(playbackUrl)})).u();previewPlayback.setVolume(0);const a=await auralis.playback.getAlbumTracks(${JSON.stringify(daily.items[0].albumKey)});await previewPlayback.playTrackFromQueue(a.tracks,a.tracks[0].id)})()`,
      )
      await until('previewPlayback.state.isPlaying && previewPlayback.state.currentTime>0')
      const playbackProbe =
        '({id:previewPlayback.state.currentTrackId,time:previewPlayback.state.currentTime,playing:previewPlayback.state.isPlaying,mode:previewPlayback.state.playbackMode,queue:previewPlayback.state.queue.length,error:previewPlayback.state.error})'
      const playbackBefore = await run(playbackProbe)
      let continuityBefore = playbackBefore
      await run("location.hash='/archive'")
      await until("!!document.querySelector('.archive-canvas-mac-btn')")
      await run("document.querySelector('.archive-canvas-mac-btn').click()")
      await until(`${el('stage-selectors')}?.children.length===5`)
      await wait(1800)
      assert.equal(
        await run(
          "Boolean(document.querySelector('.player-bar') || document.querySelector('.sidebar') || document.querySelector('.lyrics-panel'))",
        ),
        false,
      )
      assert.equal(await run('document.fonts.check(\'12px "Auralis Mac Pixel"\')'), true)
      await until(`${el('load-album')}.disabled===false`)
      checks.push('production IPC, artwork protocol, font and independent temporary route')
      win.setContentSize(1180, 760)
      await wait(300)
      if (phase4) {
        const scene = el('scene'),
          ghost = el('ghost')
        const slot = `${root}.querySelector('.floppy')`
        const coverPoint = await run(
          `(()=>{const r=${el('album-stage')}.getBoundingClientRect();return {x:Math.round(r.left+r.width*.5),y:Math.round(r.top+r.height*.5)}})()`,
        )
        const down = () =>
          win.webContents.sendInputEvent({
            type: 'mouseDown',
            button: 'left',
            clickCount: 1,
            ...coverPoint,
          })
        const up = (point = coverPoint) =>
          win.webContents.sendInputEvent({
            type: 'mouseUp',
            button: 'left',
            clickCount: 1,
            ...point,
          })
        const move = (point) => win.webContents.sendInputEvent({ type: 'mouseMove', ...point })
        move(coverPoint)
        down()
        await wait(100)
        up()
        assert.equal(await run(`${ghost}.hidden`), true)
        down()
        await until(`${scene}.dataset.coverDragging==='true'`)
        assert.equal(await run(`${ghost}.hidden`), false)
        const slotPoint = await run(
          `(()=>{const r=${slot}.getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)}})()`,
        )
        move(slotPoint)
        await until(`${slot}.dataset.tray==='open'`)
        await shot('phase-4-tray-open.png')
        up(slotPoint)
        await until(`${scene}.dataset.inserting==='true'`)
        await until(
          `${scene}.dataset.inserting==='false' && previewPlayback.state.isPlaying && ${el('feedback')}.textContent.includes('正在播放')`,
        )
        assert.deepEqual(await run('previewPlayback.state.queue.map(t=>t.id)'), [1, 9])
        await until('!previewPlayback.isPlaybackPending.value && previewPlayback.state.isPlaying')
        assert.equal(await run('previewPlayback.state.currentTrackId'), 1)
        assert.equal(await run(`${slot}.dataset.tray`), 'closed')
        assert.equal(await run(`${ghost}.hidden`), true)
        checks.push(
          'real pointer drop plays complete available album [1,9], excludes missing first track 8 and starts track 1',
        )

        move(coverPoint)
        down()
        await until(`${scene}.dataset.coverDragging==='true'`)
        move({ x: 40, y: 100 })
        up({ x: 40, y: 100 })
        await until(`${ghost}.hidden===true && ${scene}.dataset.inserting==='false'`)
        assert.equal(await run(`${ghost}.hidden`), true)
        assert.equal(await run(`${scene}.dataset.inserting`), 'false')
        await run(`${el('load-album')}.click()`)
        await until(`${scene}.dataset.inserting==='true'`)
        await run(`${el('album-stage')}.focus()`)
        win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' })
        win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' })
        await until(`${scene}.dataset.inserting==='false'`)
        await wait(1100)
        assert.equal(await run(`${el('feedback')}.textContent.includes('已取消')`), true)
        assert.equal(await run(`${ghost}.hidden`), true)
        checks.push(
          'outside drop returns cover; Escape aborts tray animation without stale completion',
        )

        await run(`${el('load-album')}.click();${el('day-prev')}.click()`)
        await until(`${el('date-trigger')}.textContent.includes('${yesterday}')`)
        assert.equal(await run(`${scene}.dataset.inserting`), 'false')
        await run(`${el('day-next')}.click()`)
        await until(`${el('load-album')}.disabled===false`)
        await wait(1800)
        await run(`${slot}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`)
        await until(`${scene}.dataset.inserting==='true'`)
        await run(`${el('stage-next')}.click()`)
        await until(`${scene}.dataset.inserting==='false'`)
        await run(`${el('stage-selectors')}.children[0].click()`)
        await until(`${el('load-album')}.disabled===false`)
        await wait(600)
        await run(
          `${el('load-album')}.click();${el('rig')}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`,
        )
        await until(`${scene}.dataset.inserting==='false'`)
        await wait(1300)
        await run(`${el('bezel-return')}.click()`)
        await wait(800)
        assert.equal(await run(`${slot}.dataset.tray`), 'closed')
        checks.push(
          'date, selection and view changes cancel insertion; keyboard slot equivalent works',
        )
        await run(`${el('load-album')}.click();location.hash='/archive'`)
        await until(`!${root}`)
        await wait(1100)
        await run("document.querySelector('.archive-canvas-mac-btn').click()")
        await until(`${el('load-album')}.disabled===false`)
        await wait(1800)
        assert.equal(await run(`${scene}.dataset.inserting`), 'false')
        assert.equal(await run(`${ghost}.hidden`), true)
        checks.push('leaving during insertion disposes the operation; reentry starts idle')
      }
      await shot('preview-1180x760-machine.png')
      const point = await run(
        `(()=>{const b=${root}.querySelector('.crt-glass').getBoundingClientRect();return {x:Math.round(b.left+b.width/2),y:Math.round(b.top+b.height/2)}})()`,
      )
      win.webContents.sendInputEvent({ type: 'mouseDown', button: 'left', clickCount: 2, ...point })
      win.webContents.sendInputEvent({ type: 'mouseUp', button: 'left', clickCount: 2, ...point })
      await until(`${el('archive-mac-shell')}.classList.contains('is-screen-focused')`)
      await wait(250)
      assert.notEqual(await run(`getComputedStyle(${el('crt-logic-plane')}).filter`), 'none')
      await shot('preview-1180x760-denoise.png')
      await wait(1100)
      assert.equal(await run(`getComputedStyle(${el('crt-logic-plane')}).filter`), 'none')
      await shot('preview-1180x760-screen-focused.png')
      await run(`${root}.querySelector('[data-entry="track"]').click()`)
      assert.equal(await run(`${el('crt-entry-status')}.textContent`), '单曲统计尚未开放')
      assert.equal(
        await run(`${root}.querySelector('[data-entry="track"]').getAttribute('aria-pressed')`),
        'true',
      )
      await run(`${root}.querySelector('[data-entry="album"]').click()`)
      await until(`${el('album-list')}?.children.length===5`)
      assert.equal(await run(`${el('album-list')}.querySelector('.row-name b')!==null`), false)
      await run(`${el('album-list')}.children[4].click()`)
      await until(`${el('stage-title')}.textContent==='Album 5'`)
      await wait(500)
      assert.equal(await run(`${el('stage-position')}.textContent`), '05 / 05')
      await shot('preview-1180x760-album-stats.png')
      await run(`${el('date-trigger')}.click()`)
      await shot('preview-1180x760-calendar-dropdown.png')
      await run(`${el('mac-calendar-year-select')}.click()`)
      await shot('preview-1180x760-year-dropdown.png')
      await run(`${el('mac-calendar-years')}.children[2].click()`)
      await until(
        `${el('date-trigger')}.textContent.includes('${historic}') && ${el('stage-selectors')}.children.length===2`,
      )
      await run(`${el('mac-cal-close')}.click();${el('bezel-return')}.click()`)
      await wait(800)
      assert.equal(
        await run(`${root}.querySelector('.crt-glass').classList.contains('mac-album-open')`),
        true,
      )
      assert.equal(await run(`${el('date-trigger')}.textContent.includes('${historic}')`), true)
      checks.push(
        'real double click, gradual denoise, selection, year/calendar, return preserves album page',
      )
      await run(`${el('stage-selectors')}.children[1].click()`)
      await wait(500)
      const title = await run(`${el('stage-title')}.textContent`)
      const db2 = new Database(info.databasePath)
      db2
        .prepare(
          'UPDATE daily_track_play_stats SET play_count=play_count+1 WHERE play_date=? AND track_id=2',
        )
        .run(historic)
      db2.close()
      win.webContents.send('library:changed', {
        reason: 'play-stats-updated',
        trackIds: [2],
        filePaths: [],
      })
      await wait(600)
      assert.equal(await run(`${el('stage-title')}.textContent`), title)
      assert.equal(await run(`${el('date-trigger')}.textContent.includes('${historic}')`), true)
      checks.push('library refresh preserves date and selected album')
      await run(`${el('date-trigger')}.click()`)
      await run(`${el('mac-cal-next-month')}.click()`)
      await until(`${el('mac-calendar-status')}.textContent.includes('有圆点')`)
      assert.equal(await run(`${el('date-trigger')}.textContent.includes('${historic}')`), true)
      assert.equal(await run(`${el('stage-selectors')}.children.length`), 2)
      assert.equal(await run(`${el('stage-title')}.textContent`), title)
      const january = `${year - 1}-01-01`
      await run(
        `${el('mac-calendar-grid')}.querySelector('[data-date="${january}"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}))`,
      )
      await until(`${el('mac-calendar-year-select')}.textContent.includes('${year - 2}')`)
      assert.equal(await run(`${el('date-trigger')}.textContent.includes('${historic}')`), true)
      assert.equal(await run(`${el('stage-selectors')}.children.length`), 2)
      await run(`${el('mac-cal-close')}.click()`)
      checks.push('cross-year month and keyboard browsing preserve the selected date and stage')
      win.setContentSize(900, 620)
      await wait(400)
      await shot('preview-900x620-machine.png')
      if (phase4) {
        await until(`${el('load-album')}.disabled===false`)
        await run(`${el('load-album')}.click()`)
        await until(`${el('scene')}.dataset.inserting==='true'`)
        win.setContentSize(910, 630)
        await until(`${el('scene')}.dataset.inserting==='false'`)
        win.setContentSize(900, 620)
        await wait(300)
        await run(`${el('load-album')}.click()`)
        await until(`${el('scene')}.dataset.inserting==='true'`)
        await run("window.dispatchEvent(new Event('blur'))")
        await until(`${el('scene')}.dataset.inserting==='false'`)
        await run(`${el('load-album')}.click()`)
        await until(`${el('scene')}.dataset.inserting==='true'`)
        await until(
          `${el('scene')}.dataset.inserting==='false' && ${el('feedback')}.textContent.includes('正在播放')`,
        )
        await until('previewPlayback.state.currentTrackId===2 && previewPlayback.state.isPlaying')
        const emptyDb = new Database(info.databasePath)
        emptyDb.prepare("UPDATE tracks SET availability='missing' WHERE id=2").run()
        const preservedQueue = await run('previewPlayback.state.queue.map(t=>t.id)')
        await run(`${el('load-album')}.click()`)
        await until(`${el('feedback')}.textContent.includes('没有可播放曲目')`)
        assert.deepEqual(await run('previewPlayback.state.queue.map(t=>t.id)'), preservedQueue)
        assert.equal(await run('previewPlayback.state.isPlaying'), true)
        emptyDb.prepare("UPDATE tracks SET availability='available' WHERE id=2").run()
        emptyDb.close()
        await run(`${el('load-album')}.click()`)
        await until(
          `${el('scene')}.dataset.inserting==='false' && previewPlayback.state.isPlaying && ${el('feedback')}.textContent.includes('正在播放')`,
        )
        continuityBefore = await run(playbackProbe)
        assert.equal(await run(`${el('ghost')}.hidden`), true)
        await shot('phase-4-900x620-loaded.png')
        checks.push(
          '900×620 insertion completes; actual resize and blur event cancel the pending operation',
        )
        checks.push(
          'album becomes entirely missing before query: existing queue and playback are preserved; retry works',
        )
      }
      await run(
        `${el('rig')}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`,
      )
      await wait(1250)
      await run(
        `${el('date-trigger')}.click();${el('mac-calendar-year-select')}.click();${el('mac-calendar-years')}.children[0].click()`,
      )
      await until(`${el('stage-selectors')}.children.length===5`)
      await run(`${el('mac-cal-close')}.click()`)
      await shot('preview-900x620-screen.png')
      const geometry = await run(
        `(()=>{const r=${root},p=r.getElementById('crt-logic-plane'),l=r.getElementById('album-list');return {logical:[p.offsetWidth,p.offsetHeight],listFits:l.scrollHeight<=l.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth,clock:r.getElementById('crt-clock').textContent,local:new Date().toTimeString().slice(0,5)}})()`,
      )
      assert.deepEqual(geometry.logical, [512, 342])
      assert.equal(geometry.listFits, true)
      assert.equal(geometry.overflow, false)
      assert.equal(geometry.clock, geometry.local)
      assert.equal(await run(`${el('album-list')}.children.length`), 5)
      checks.push('900×620: logical plane, visible rows, local clock and no horizontal overflow')
      await run(
        `${el('date-trigger')}.click();${el('mac-calendar-year-select')}.click();${el('mac-calendar-years')}.children[1].click()`,
      )
      await until(
        `${el('stage-selectors')}.children.length===0 && ${el('screen-status')}.textContent==='无记录'`,
      )
      checks.push('empty historical year defaults to January 1 and clears the stage')
      const resetDb = new Database(info.databasePath)
      resetDb.transaction(() => {
        resetDb.prepare('DELETE FROM daily_track_play_stats').run()
        resetDb.prepare('DELETE FROM daily_play_stats').run()
      })()
      resetDb.close()
      win.webContents.send('library:changed', {
        reason: 'play-stats-reset',
        trackIds: [],
        filePaths: [],
      })
      await until(
        `${el('date-trigger')}.textContent.includes('${today}') && ${el('mac-calendar-years')}.children.length===1`,
      )
      assert.equal(await run(`${el('stage-selectors')}.children.length`), 0)
      checks.push('history reset corrects the date, year menu and empty stage together')
      await run("document.querySelector('.archive-mac-back-btn').click()")
      await until(
        "document.querySelector('.archive-canvas-page') && !document.querySelector('.archive-mac-page')",
      )
      await shot('preview-archive-return.png')
      const playbackAfter = await run(playbackProbe)
      assert.equal(playbackAfter.id, continuityBefore.id)
      assert.equal(playbackAfter.playing, true)
      assert.ok(playbackAfter.time > continuityBefore.time + (phase4 ? 1 : 5))
      assert.equal(playbackAfter.mode, continuityBefore.mode)
      assert.equal(playbackAfter.queue, continuityBefore.queue)
      assert.equal(playbackAfter.error, null)
      checks.push('real WAV continues through route/focus/return; queue and mode unchanged')
      for (let i = 0; i < 3; i++) {
        await run("document.querySelector('.archive-canvas-mac-btn').click()")
        // The fixture's history was cleared above; wait for the empty-date query to finish.
        await until(
          `${el('rig')} && ${el('stage-selectors')}?.children.length===0 && ${el('screen-status')}?.textContent==='无记录'`,
        )
        await run(
          `${el('rig')}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));document.querySelector('.archive-mac-back-btn').click()`,
        )
        await until(
          "document.querySelector('.archive-canvas-page') && !document.querySelector('.archive-mac-page')",
        )
      }
      await run('previewPlayback.pause()')
      await wait(100)
      await wait(500)
      assert.deepEqual(errors, [])
      checks.push(
        'three creation/disposal cycles, including unfinished zoom, without renderer errors',
      )
      const result = {
        ok: true,
        profile,
        checks,
        captures,
        geometry,
        playback: { before: playbackBefore, continuityBefore, after: playbackAfter },
        errors,
      }
      writeFileSync(
        join(output, phase4 ? 'phase-4-results.json' : 'phase-3-results.json'),
        JSON.stringify(result, null, 2),
      )
      console.log(JSON.stringify(result, null, 2))
      clearTimeout(watchdog)
      win.destroy()
    } catch (error) {
      const playbackFailure = await run(
        'window.previewPlayback ? ({playing:previewPlayback.state.isPlaying,time:previewPlayback.state.currentTime,error:previewPlayback.state.error,track:previewPlayback.state.currentTrackId}) : null',
      ).catch(() => null)
      console.error('Playback probe', playbackFailure)
      await shot('preview-failure.png').catch(() => {})
      writeFileSync(
        join(output, phase4 ? 'phase-4-results.json' : 'phase-3-results.json'),
        JSON.stringify(
          { ok: false, profile, checks, captures, errors, playbackFailure, error: String(error) },
          null,
          2,
        ),
      )
      console.error(error)
      clearTimeout(watchdog)
      app.exit(1)
    }
  })
})
await import(pathToFileURL(join(workspace, 'out/main/index.js')).href)
