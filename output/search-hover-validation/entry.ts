import { createApp } from 'vue'
import { browserPreviewApi } from '../../src/renderer/shared/ipc/browserPreviewApi'
import '@unocss/reset/tailwind.css'
import 'virtual:uno.css'
import '../../src/renderer/app/styles/main.css'

const tracks = Array.from({ length: 30 }, (_, index) => ({
  id: index + 1, title: `Hover regression track ${index + 1}`, artist: 'Artist', album: 'Album',
  albumArtist: null, trackNo: index + 1, discNo: 1, releaseDate: null, copyright: null,
  composer: null, durationSeconds: 272, bitrateBps: 320000, artworkCacheKey: null,
  genre: null, availability: 'available', playCount: 0, lastPlayedAt: null,
  createdAt: '2026-10-11T00:00:00.000Z',
}))
window.auralis = new Proxy(browserPreviewApi, {
  get(target, group) {
    if (group === 'library') return new Proxy(target.library, {
      get(library, method) {
        if (method === 'getTrackPage') return async () => ({ snapshotId: 'hover-fixture', totalTracks: tracks.length, tracks, nextCursor: null, diagnostics: { snapshotBuildMs: 0, pageSliceMs: 0 } })
        return Reflect.get(library, method)
      },
    })
    return Reflect.get(target, group)
  },
})
const params = new URLSearchParams(location.search)
localStorage.setItem('auralis-library-view-mode', params.get('mode') ?? 'flat')
localStorage.setItem('auralis-lyrics-panel-expanded', params.get('lyrics') ?? 'true')
const [{ default: App }, { router }, { i18n }] = await Promise.all([
  import('../../src/renderer/App.vue'),
  import('../../src/renderer/app/router'),
  import('../../src/renderer/i18n'),
])
await router.push('/songs')
await router.isReady()
const app = createApp(App)
app.use(router).use(i18n).directive('tooltip', {}).mount('#app')
document.addEventListener('mousemove', (event) => {
  window.__lastHover = { x: event.clientX, y: event.clientY }
})
