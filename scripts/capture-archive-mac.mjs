// electron scripts/capture-archive-mac.mjs — run after npm run build.
// Production main/preload/renderer with an isolated database; no mocked IPC handlers.
import { app, BrowserWindow } from 'electron'
import assert from 'node:assert/strict'
import { createRequire } from 'node:module'
import { mkdirSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const workspace = resolve(import.meta.dirname, '..')
const require = createRequire(join(workspace, 'package.json'))
const profile = mkdtempSync(join(tmpdir(), 'auralis-mac-preview-'))
const output = join(workspace, '.electron-home/archive-mac-only')
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

      const assets = readdirSync(join(workspace, 'out/renderer/assets'))
      assert.equal(
        assets.some((f) => /^coverQuantize\.worker-/.test(f)),
        false,
      )
      assert.equal(
        assets.some((f) => /^ArchiveCanvasPage-/.test(f)),
        false,
      )
      const playbackFile = assets.find((f) => /^usePlayback-.*\.js$/.test(f))
      const playbackUrl = pathToFileURL(join(workspace, 'out/renderer/assets', playbackFile)).href
      await run(
        `(async()=>{window.previewPlayback=(await import(${JSON.stringify(playbackUrl)})).u();previewPlayback.setVolume(0);const a=await auralis.playback.getAlbumTracks(${JSON.stringify(daily.items[0].albumKey)});await previewPlayback.playTrackFromQueue(a.tracks,a.tracks[0].id)})()`,
      )
      await until('previewPlayback.state.isPlaying && previewPlayback.state.currentTime>0')
      const probe =
        '({id:previewPlayback.state.currentTrackId,time:previewPlayback.state.currentTime,playing:previewPlayback.state.isPlaying,mode:previewPlayback.state.playbackMode,queue:previewPlayback.state.queue.map(t=>t.id),error:previewPlayback.state.error})'
      const before = await run(probe)
      await run("location.hash='/songs'")
      await until("location.hash==='#/songs'")
      await wait(150)
      await run("location.hash='/archive'")
      await until(`${el('album-list')}?.children.length===5`)
      win.setContentSize(1180, 760)
      await wait(450)
      assert.equal(
        await run(
          `Boolean(${root}.querySelector('#sky,#stage,#cable,#ghost,.footer,#load-album'))`,
        ),
        false,
      )
      assert.equal(await run(`${root}.querySelectorAll('.load-tray').length`), 1)
      assert.equal(await run(`${root}.querySelector('.floppy').dataset.tray`), 'closed')
      assert.equal(
        await run(
          "Boolean(document.querySelector('.player-bar')||document.querySelector('.sidebar')||document.querySelector('.lyrics-panel'))",
        ),
        false,
      )
      const geometry = await run(
        `(()=>{const r=${el('studio')}.getBoundingClientRect();return {width:innerWidth,height:innerHeight,dpr:devicePixelRatio,centerX:r.left+r.width/2}})()`,
      )
      assert.ok(Math.abs(geometry.centerX - geometry.width / 2) < 2)
      await shot('mac-machine-1180x760.png')
      checks.push(
        'formal archive route, centered Mac and closed tray; no sky/stage/cable/drag surface or cover worker bundle',
      )
      const yaw1 = await run(`${el('rig')}.style.getPropertyValue('--tilt-y')`)
      await wait(200)
      assert.notEqual(await run(`${el('rig')}.style.getPropertyValue('--tilt-y')`), yaw1)
      await run(`${el('rig')}.dispatchEvent(new MouseEvent('dblclick',{bubbles:true,button:0}))`)
      await until(
        `${el('archive-mac-shell')}.classList.contains('is-screen-focused') && !${el('rig')}.classList.contains('is-transitioning')`,
      )
      await wait(900)
      await shot('mac-desktop-1180x760.png')
      await run(`${root}.querySelector('[data-entry="album"]').click()`)
      await until(`${root}.querySelector('.crt-glass').classList.contains('mac-album-open')`)
      assert.equal(await run(`${el('album-list')}.querySelectorAll('.album-row').length`), 5)
      assert.equal(await run(`${el('album-list')}.querySelector('b')===null`), true)
      await shot('mac-stats-1180x760.png')
      await run(`${el('day-prev')}.click()`)
      await until(`${el('album-list')}.querySelectorAll('.album-row').length===2`)
      await run(`${el('date-trigger')}.click()`)
      await until(`${el('mac-date-popup')}.hidden===false`)
      await shot('mac-calendar-1180x760.png')
      await run(`${el('mac-cal-close')}.click();${el('bezel-return')}.click()`)
      await until(
        `!${el('archive-mac-shell')}.classList.contains('is-screen-focused') && !${el('rig')}.classList.contains('is-transitioning')`,
      )
      assert.equal(
        await run(`${root}.querySelector('.crt-glass').classList.contains('mac-album-open')`),
        true,
      )
      checks.push(
        'rotation, double-click focus, desktop album entry, real Top5/day switch/calendar, preserve album window after returning to machine',
      )
      win.setContentSize(900, 620)
      await wait(350)
      await shot('mac-machine-900x620.png')
      await run(
        `${el('rig')}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}))`,
      )
      await until(
        `${el('archive-mac-shell')}.classList.contains('is-screen-focused') && !${el('rig')}.classList.contains('is-transitioning')`,
      )
      await wait(900)
      await shot('mac-stats-900x620.png')
      const screen = await run(
        `(()=>{const p=${el('crt-logic-plane')},r=p.getBoundingClientRect();return {w:p.offsetWidth,h:p.offsetHeight,left:r.left,right:r.right,top:r.top,bottom:r.bottom,vw:innerWidth,vh:innerHeight}})()`,
      )
      assert.equal(screen.w, 512)
      assert.equal(screen.h, 342)
      assert.ok(
        screen.left >= 0 &&
          screen.right <= screen.vw &&
          screen.top >= 0 &&
          screen.bottom <= screen.vh,
      )
      const after = await run(probe)
      assert.equal(after.id, before.id)
      assert.equal(after.mode, before.mode)
      assert.deepEqual(after.queue, before.queue)
      assert.equal(after.playing, true)
      assert.equal(after.error, null)
      assert.ok(after.time > before.time + 2)
      await run("document.querySelector('.archive-mac-back-btn').click()")
      await until("location.hash==='#/songs' && !document.querySelector('.archive-mac-host')")
      await run("location.hash='/archive/mac'")
      await until(`location.hash==='#/archive' && ${el('rig')}`)
      await run("document.querySelector('.archive-mac-back-btn').click()")
      await until("location.hash==='#/songs' && !document.querySelector('.archive-mac-host')")
      checks.push(
        '900x620 CRT fit, continuous real playback and unchanged queue/mode, compatibility redirect and return to player',
      )
      for (let i = 0; i < 3; i++) {
        await run("location.hash='/archive'")
        await until(`${el('rig')}`)
        await run(
          `${el('rig')}.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));document.querySelector('.archive-mac-back-btn').click()`,
        )
        await until("!document.querySelector('.archive-mac-host')")
      }
      await wait(600)
      assert.deepEqual(errors, [])
      checks.push('three exit-during-transition cycles without renderer errors')
      await run('previewPlayback.pause()')
      const result = {
        ok: true,
        profile,
        checks,
        captures,
        geometry,
        screen,
        playback: { before, after },
        errors,
      }
      writeFileSync(join(output, 'results.json'), JSON.stringify(result, null, 2))
      console.log(JSON.stringify(result, null, 2))
      clearTimeout(watchdog)
      win.destroy()
    } catch (error) {
      await shot('failure.png').catch(() => {})
      writeFileSync(
        join(output, 'results.json'),
        JSON.stringify(
          { ok: false, profile, checks, captures, errors, error: String(error) },
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
