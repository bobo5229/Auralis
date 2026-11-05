import type { BrowserWindow } from 'electron'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { isAbsolute, join } from 'node:path'

/** Real renderer/IPC checks, restricted to the disposable smoke library. */
export async function runMetadataReadOnlySmokeChecks(window: BrowserWindow): Promise<void> {
  const profile = process.env.AURALIS_SMOKE_USER_DATA
  if (process.env.AURALIS_SMOKE_TEST !== '1' || !profile)
    throw new Error('Metadata smoke requires an isolated profile')
  const musicPath = join(profile, 'initial-music', 'Initial Smoke.wav')
  const lyricPath = join(profile, 'initial-music', 'Initial Smoke.lrc')
  const music = await readFile(musicPath),
    lyrics = await readFile(lyricPath)
  window.setContentSize(1360, 800)
  const result = await window.webContents.executeJavaScript(
    `(async () => {
    const until = async (description, predicate) => {
      const deadline = Date.now() + 5000
      while (Date.now() < deadline) {
        if (await predicate()) return
        await new Promise(resolve => setTimeout(resolve, 20))
      }
      throw new Error('Read-only metadata smoke timed out: ' + description)
    }
    const press = key => document.activeElement.dispatchEvent(new KeyboardEvent('keydown', {
      key, bubbles: true, cancelable: true,
    }))
    const context = element => {
      element.focus()
      const rect = element.getBoundingClientRect()
      element.dispatchEvent(new MouseEvent('contextmenu', {
        bubbles: true, cancelable: true, clientX: rect.left + 20, clientY: rect.top + 10,
      }))
    }
    const api = window.auralis
    const metadataKeys = Object.keys(api.metadata).sort()
    const expected = ['refreshTrack', 'refreshTracks', 'refreshLyricsMissing', 'getRefreshStatus',
      'listRefreshFailures', 'clearRefreshFailures', 'onRefreshProgress'].sort()
    if (JSON.stringify(metadataKeys) !== JSON.stringify(expected) ||
        JSON.stringify(Object.keys(api.lyrics)) !== JSON.stringify(['getByTrackId']))
      throw new Error('Preload still exposes editing capabilities')
    await until('wide lyrics controls', () => document.querySelector('[data-testid="player-lyrics-button"]'))

    const row = document.querySelector('.library-page [data-track-id]')
    context(row)
    await until('library menu focus', () => document.querySelector('.library-context-menu-main-panel')?.contains(document.activeElement))
    const libraryMenu = document.querySelector('.library-context-menu-main-panel')
    if (libraryMenu.querySelector('.i-lucide-pencil')) throw new Error('Library edit action remains')
    press('End')
    await until('Explorer keyboard focus', () => document.activeElement.querySelector('.i-lucide-folder-open'))
    press('Escape')
    await until('library focus return', () => document.activeElement === row && !document.querySelector('.library-context-menu-main-panel'))

    row.dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true }))
    const toggle = document.querySelector('[data-testid="player-lyrics-button"]')
    if (toggle?.getAttribute('aria-expanded') === 'false') toggle.click()
    await until('lyrics loaded', () => document.querySelector('.now-playing-panel .synced-lyrics-scroll')?.textContent.includes('繁体歌词'))
    const scroll = document.querySelector('.now-playing-panel .synced-lyrics-scroll')
    context(scroll)
    await until('lyrics menu focus', () => document.querySelector('#normal-lyrics-context-menu')?.contains(document.activeElement))
    const menu = document.querySelector('#normal-lyrics-context-menu')
    if (menu.querySelectorAll('button').length !== 1 || menu.querySelector('[role="separator"]'))
      throw new Error('Lyrics editing action or separator remains')
    press('Enter')
    await until('traditional lyrics and focus', () => scroll.textContent.includes('繁體歌詞') && document.activeElement === scroll)
    context(scroll)
    await until('lyrics menu reopens', () => document.querySelector('#normal-lyrics-context-menu')?.contains(document.activeElement))
    press(' ')
    await until('simplified lyrics and focus', () => scroll.textContent.includes('繁体歌词') && document.activeElement === scroll)

    const tracks = await api.library.getTracks()
    const job = await api.metadata.refreshTrack(tracks[0].id)
    await until('manual metadata refresh', async () => (await api.metadata.getRefreshStatus(job.jobId))?.status === 'completed')
    if ((await api.lyrics.getByTrackId(tracks[0].id))?.lyricsText?.trim() !== '[00:00.01]繁體歌詞')
      throw new Error('Lyric read changed source text')

    location.hash = '#/albums'
    await until('album card', () => document.querySelector('.album-card'))
    context(document.querySelector('.album-card .cover-stage'))
    await until('album menu focus', () => document.querySelector('[data-album-menu-action]')?.closest('[role="menu"]')?.contains(document.activeElement))
    const albumMenu = document.querySelector('[data-album-menu-action]').closest('[role="menu"]')
    if (albumMenu.querySelector('[data-album-menu-action="edit-album"]')) throw new Error('Album edit action remains')
    press('End')
    await until('album Explorer keyboard focus', () => document.activeElement.dataset.albumMenuAction === 'open-in-explorer')
    press('Escape')
    await until('album menu closes', () => !document.querySelector('[data-album-menu-action]'))
    location.hash = '#/songs'
    await until('return to songs', () => document.querySelector('.library-page [data-track-id]'))
  })().catch(error => ({ error: String(error.stack || error) }))`,
    true,
  )
  const captures = process.env.AURALIS_SMOKE_CAPTURE_DIR
  if (captures) {
    if (!isAbsolute(captures)) throw new Error('Smoke capture directory must be absolute')
    await mkdir(captures, { recursive: true })
    await writeFile(
      join(captures, 'metadata-read-only.png'),
      (await window.webContents.capturePage()).toPNG(),
    )
  }
  if (result?.error) throw new Error(result.error)
  if (!(await readFile(musicPath)).equals(music) || !(await readFile(lyricPath)).equals(lyrics))
    throw new Error('Scanning, refreshing or playback modified the isolated source files')
}
