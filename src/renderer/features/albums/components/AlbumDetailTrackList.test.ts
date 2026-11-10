import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import {
  ShellTestElement,
  ShellTestRect,
  shellTestRenderer,
} from '@renderer/testUtils/rendererTestHost'
import AlbumDetailTrackList from '@renderer/features/albums/components/AlbumDetailTrackList.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, values?: { number: string }) =>
      key === 'albums.detail.disc' ? 'Disc ' + values?.number : key,
  }),
}))
vi.mock('@renderer/shared/preferences/useChineseTextDisplay', () => ({
  useChineseTextDisplay: () => ({
    songText: (value: string | null) => value ?? '',
    songValues: (value: string | null) => value ?? '',
  }),
}))
vi.mock('@renderer/features/appearance/components/PlayingIndicator.vue', () => ({
  default: {
    props: ['playing'],
    render(this: { playing: boolean }) {
      return h('span', { class: 'test-playing-indicator', 'data-playing': this.playing })
    },
  },
}))

const unmounts: Array<() => void> = []
let resize: ResizeObserverCallback | undefined
const matches = ShellTestElement.prototype.matches
beforeEach(() => {
  vi.stubGlobal('getComputedStyle', () => ({ paddingTop: '4px', paddingBottom: '4px' }))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        resize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  vi.spyOn(ShellTestElement.prototype, 'matches').mockImplementation(function (
    this: ShellTestElement,
    selector: string,
  ) {
    return (
      matches.call(this, selector) &&
      [...selector.matchAll(/\[([\w-]+)="([^"]*)"\]/gu)].every(
        ([, name, value]) => String(this.props[name]) === value,
      )
    )
  })
})
afterEach(() => {
  unmounts.splice(0).forEach((fn) => fn())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})
function makeTracks(count: number): TrackListItem[] {
  return Array.from({ length: count }, (_, i) => ({
    id: i + 1,
    title: 'Track ' + i,
    artist: 'Artist',
    trackNo: i + 1,
    durationSeconds: 180,
  })) as TrackListItem[]
}
function mountList(count: number, maxVisibleTracks = 10) {
  const root = new ShellTestElement('div')
  const highlighted = ref<number | null>(null),
    onPlay = vi.fn()
  const tracks = makeTracks(count)
  const app = shellTestRenderer.createApp({
    render: () =>
      h(AlbumDetailTrackList, {
        groups: [
          { discNo: 1, tracks: tracks.slice(0, 3) },
          { discNo: 2, tracks: tracks.slice(3) },
        ],
        albumArtist: 'Artist',
        isPlaying: false,
        currentTrackId: 1,
        highlightedTrackId: highlighted.value,
        maxVisibleTracks,
        onPlay,
      }),
  })
  app.directive('tooltip', {})
  app.mount(root)
  unmounts.push(() => app.unmount())
  const rows = root.querySelectorAll('.album-detail-track')
  rows.forEach((row, i) => {
    row.rect = new ShellTestRect(0, 100 + i * 44, 320, i % 4 === 0 ? 44 : 40)
  })
  root.querySelectorAll('.album-detail-disc-header').forEach((header) => {
    header.rect = new ShellTestRect(0, 0, 320, 36)
  })
  resize?.([], {} as ResizeObserver)
  return { root, rows, highlighted, onPlay }
}
it.each([1, 8, 10, 12, 1000])(
  'keeps all %i tracks in one list without Disc controls',
  async (count) => {
    const { root, rows, onPlay } = mountList(count)
    await nextTick()
    expect(rows).toHaveLength(count)
    expect(root.querySelectorAll('.album-detail-disc-header').map((header) => header.text)).toEqual(
      count > 3 ? ['Disc 01', 'Disc 02'] : [],
    )
    expect(root.querySelector('.album-track-navigation')).toBeNull()
    const list = root.querySelector('.album-detail-track-list')!
    expect(list.style.maxHeight).toBe(count > 10 ? '492px' : undefined)
    expect(rows[0].classList.contains('album-detail-track--start')).toBe(true)
    expect(rows[count - 1].classList.contains('album-detail-track--end')).toBe(true)
    if (count > 3) {
      expect(rows[2].classList.contains('album-detail-track--end')).toBe(true)
      expect(rows[3].classList.contains('album-detail-track--start')).toBe(true)
      expect(rows[1].classList.contains('album-detail-track--start')).toBe(false)
    }
    ;(rows[count - 1].props.onDblclick as () => void)()
    expect(onPlay).toHaveBeenCalledWith(count)
  },
)
it('starts capping at the seventeenth track with the chosen sixteen-row limit', async () => {
  const short = mountList(16, 16)
  const long = mountList(17, 16)
  await nextTick()
  expect(short.root.querySelector('.album-detail-track-list')!.style.maxHeight).toBeUndefined()
  expect(long.root.querySelector('.album-detail-track-list')!.style.maxHeight).toBe('736px')
  expect(long.rows).toHaveLength(17)
})

it('scrolls a searched track inside the capped list', async () => {
  const { root, rows, highlighted } = mountList(12)
  const list = root.querySelector('.album-detail-track-list')!
  list.rect = new ShellTestRect(0, 100, 320, 420)
  const scrollTo = vi.fn(),
    scrollIntoView = vi.fn()
  Object.assign(list, { clientHeight: 420, scrollHeight: 600, scrollTo, scrollIntoView })
  highlighted.value = 12
  await nextTick()
  expect(scrollTo).toHaveBeenCalled()
  expect(scrollIntoView).toHaveBeenCalled()
  expect(rows[11].classList.contains('album-detail-track--search-highlight')).toBe(true)
})
it('identifies only the current track while playing or paused', async () => {
  const root = new ShellTestElement('div')
  const isPlaying = ref(true)
  const currentTrackId = ref<number | null>(1)
  const selectedTrackId = ref(2)
  const tracks = makeTracks(3)
  const app = shellTestRenderer.createApp({
    render: () =>
      h(AlbumDetailTrackList, {
        maxVisibleTracks: 10,
        groups: [{ discNo: null, tracks }],
        albumArtist: 'Artist',
        currentTrackId: currentTrackId.value,
        isPlaying: isPlaying.value,
        highlightedTrackId: null,
        selectedTrackId: selectedTrackId.value,
      }),
  })
  app.directive('tooltip', {
    mounted: (element: ShellTestElement, binding: { value?: string }) => {
      element.props.tooltip = binding.value
    },
    updated: (element: ShellTestElement, binding: { value?: string }) => {
      element.props.tooltip = binding.value
    },
  })
  app.mount(root)
  unmounts.push(() => app.unmount())
  await nextTick()
  const rows = root.querySelectorAll('button.album-detail-track')
  const current = rows[0]
  expect(current.classList.contains('album-detail-track--current')).toBe(true)
  expect(current.props['aria-current']).toBe('true')
  expect(current.props.tooltip).toBe('albums.detail.currentPlaying')
  expect(current.querySelector('.album-track-visually-hidden')?.text).toBe(
    'albums.detail.currentPlaying',
  )
  expect(current.querySelector('.test-playing-indicator')?.props['data-playing']).toBe('true')
  for (const row of rows.slice(1)) {
    expect(row.classList.contains('album-detail-track--current')).toBe(false)
    expect(row.classList.contains('album-detail-track--selected')).toBe(false)
    expect(row.props['aria-current']).toBeUndefined()
    expect(row.props.tooltip).toBeUndefined()
    expect(row.querySelector('.test-playing-indicator')).toBeNull()
    expect(row.querySelector('.album-track-visually-hidden')).toBeNull()
  }
  isPlaying.value = false
  selectedTrackId.value = 3
  await nextTick()
  expect(current.classList.contains('album-detail-track--current')).toBe(true)
  expect(current.props['aria-current']).toBe('true')
  expect(current.props.tooltip).toBe('albums.detail.currentPaused')
  expect(current.querySelector('.album-track-visually-hidden')?.text).toBe(
    'albums.detail.currentPaused',
  )
  expect(current.querySelector('.test-playing-indicator')?.props['data-playing']).toBe('false')
  expect(rows[2].classList.contains('album-detail-track--current')).toBe(false)
  currentTrackId.value = null
  await nextTick()
  expect(current.props['aria-current']).toBeUndefined()
  expect(current.querySelector('.test-playing-indicator')).toBeNull()
})
