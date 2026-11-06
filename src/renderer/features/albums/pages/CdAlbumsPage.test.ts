import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive, ref } from 'vue'
import { ShellTestElement, shellTestRenderer } from '@renderer/testUtils/rendererTestHost'
import CdAlbumsPage from './CdAlbumsPage.vue'

const focused = ref(false)
const focusSettled = ref(false)
const playbackInfoFocused = ref(false)
const track = { id: 1, title: 'Song A', artist: 'Artist', album: 'Album A', albumArtist: 'Artist' }
const other = { id: 2, title: 'Song B', artist: 'Artist', album: 'Album B', albumArtist: 'Artist' }
const state = reactive({
  currentTrack: null as typeof track | null,
  currentTrackId: null as number | null,
  isPlaying: false,
  duration: 0,
  currentTime: 0,
  queue: [],
  error: null,
})
const albums = ref([
  { key: '', title: 'Album A', artist: 'Artist', tracks: [track], trackCount: 1 },
])
const element = () => ref(null)
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('vue-router', () => ({
  useRoute: () => ({ query: {} }),
  useRouter: () => ({ push: vi.fn(), currentRoute: ref({ name: 'cd-albums' }) }),
}))
vi.mock('@renderer/shared/animation/motionPreference', () => ({
  createReducedMotionQuery: () => ({ matches: false }),
}))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { app: { claimCdStartupEntry: vi.fn() } },
}))
vi.mock('../composables/cdAlbumCatalogSession', () => ({
  cdAlbumCatalogSession: { subscribe: () => () => {}, clear: vi.fn() },
}))
vi.mock('../composables/useCdAlbumLoadSession', () => ({
  useCdAlbumLoadSession: () => ({
    albumInfo: albums,
    loading: ref(false),
    failed: ref(false),
    count: ref(1),
    loadAlbums: async () => false,
  }),
}))
vi.mock('../composables/useCdRoomScene', () => ({
  useCdRoomScene: () => ({
    pageRef: element(),
    stageRef: element(),
    trackPanelRef: element(),
    controlsRef: element(),
    surfaceSwitchRef: element(),
    surfaceIndicatorRef: element(),
    playbackInfoRef: element(),
    playbackInfoFocused,
    focused,
    focusSettled,
    selected: ref(0),
    infoSelected: ref(0),
    starting: ref(false),
    repeatEntry: ref(false),
    discSurface: ref('cd'),
    motionReduced: ref(false),
    returnToBrowse: vi.fn(),
    setDiscSurface: vi.fn(),
    onKeydown: vi.fn(),
    onBrowseFocusOut: vi.fn(),
    setVibrationOffset: vi.fn(),
    mount: () => false,
    dispose: vi.fn(),
  }),
}))
vi.mock('../composables/useCdInfoTransition', () => ({
  useCdInfoTransition: () => ({
    displayedAlbum: ref(null),
    infoSuppressed: ref(false),
    transitionInfo: vi.fn(),
    settleInfo: vi.fn(),
    setRapidBrowse: vi.fn(),
  }),
}))
vi.mock('../composables/useCdViewSwitchVisibility', () => ({ useCdViewSwitchVisibility: vi.fn() }))
vi.mock('../composables/useCdCanvasColors', () => ({ useCdCanvasColors: vi.fn() }))
vi.mock('../composables/useCdCanvasTheme', () => ({
  useCdCanvasTheme: () => ({ cdCanvasTheme: ref('light'), setCdCanvasTheme: vi.fn() }),
}))
vi.mock('../composables/useCdVibration', () => ({
  useCdVibration: () => ({
    cdVibrationEnabled: ref(false),
    cdVibrationStyle: ref('smooth'),
    toggleCdVibration: vi.fn(),
    setCdVibrationStyle: vi.fn(),
  }),
}))
vi.mock('../composables/useCdPlaybackVibration', () => ({
  useCdPlaybackVibration: () => ({ spectrumFrame: ref(null), stopVibration: vi.fn() }),
}))
vi.mock('@renderer/features/playback/composables/useArtworkPalette', () => ({
  useArtworkPalette: () => ({ palette: ref({ quality: 'fallback', accents: [] }) }),
}))
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => ({
    state,
    queueSession: ref(null),
    togglePlayPause: vi.fn(),
    playTrackFromQueue: vi.fn(),
    replaceCurrentPlaybackQueue: vi.fn(),
  }),
}))
vi.mock('../components/CdTrackList.vue', () => ({ default: { render: () => null } }))
vi.mock('../components/CdFocusLyrics.vue', () => ({ default: { render: () => null } }))
vi.mock('../components/CdSpectrumPreview.vue', () => ({ default: { render: () => null } }))

let unmount: (() => void) | undefined
afterEach(() => {
  unmount?.()
  unmount = undefined
  focused.value = false
  focusSettled.value = false
  playbackInfoFocused.value = false
  state.currentTrack = null
  state.currentTrackId = null
})
function text(node: ShellTestElement | null): string {
  return node ? node.text + node.children.map(text).join('') : ''
}
describe('CD page playback information wiring', () => {
  it('tracks playback and focused album across browsing, pause and song changes', async () => {
    const root = new ShellTestElement('main')
    const app = shellTestRenderer.createApp({ render: () => h(CdAlbumsPage) })
    app.directive('tooltip', {})
    app.mount(root)
    unmount = () => app.unmount()
    const find = (selector: string) => root.querySelector(selector)
    expect(find('.cd-playback-info')).toBeNull()
    state.currentTrack = track
    state.currentTrackId = track.id
    state.isPlaying = true
    await nextTick()
    expect(text(find('.cd-current-track-title'))).toBe('Song A')
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(false)
    state.isPlaying = false
    await nextTick()
    expect(text(find('.cd-current-track-title'))).toBe('Song A')
    focused.value = true
    focusSettled.value = true
    playbackInfoFocused.value = true
    await nextTick()
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(true)
    state.currentTrack = other
    state.currentTrackId = other.id
    await nextTick()
    expect(text(find('.cd-current-track-title'))).toBe('Song B')
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(false)
    state.currentTrack = track
    state.currentTrackId = track.id
    await nextTick()
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(true)
    focused.value = false
    focusSettled.value = false
    playbackInfoFocused.value = false
    await nextTick()
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(false)
    state.currentTrack = null
    state.currentTrackId = null
    await nextTick()
    expect(find('.cd-playback-info')).toBeNull()
  })

  it('keeps the playback dock independent from the disc target during fading', async () => {
    const root = new ShellTestElement('main')
    const app = shellTestRenderer.createApp({ render: () => h(CdAlbumsPage) })
    app.directive('tooltip', {})
    state.currentTrack = track
    state.currentTrackId = track.id
    app.mount(root)
    unmount = () => app.unmount()
    const info = () => root.querySelector('.cd-now-playing')
    expect(info()?.classList.contains('cd-now-playing--focused')).toBe(false)

    focused.value = true
    await nextTick()
    expect(info()?.classList.contains('cd-now-playing--focused')).toBe(false)
    focusSettled.value = true
    playbackInfoFocused.value = true
    await nextTick()
    expect(info()?.classList.contains('cd-now-playing--focused')).toBe(true)

    focusSettled.value = false
    await nextTick()
    expect(info()?.classList.contains('cd-now-playing--focused')).toBe(true)
    focused.value = false
    playbackInfoFocused.value = false
    await nextTick()
    expect(info()?.classList.contains('cd-now-playing--focused')).toBe(false)
  })
})
