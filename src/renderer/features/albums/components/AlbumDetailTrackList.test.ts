import { afterEach, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { ShellTestElement, shellTestRenderer } from '@renderer/testUtils/rendererTestHost'
import AlbumDetailTrackList from '@renderer/features/albums/components/AlbumDetailTrackList.vue'

const presentationCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/shared/preferences/useChineseTextDisplay', () => ({
  useChineseTextDisplay: () => ({
    songText: (value: string | null) => value ?? '',
    songValues: (value: string | null) => value ?? '',
  }),
}))
vi.mock('@renderer/features/appearance/components/PreferredPlayingIndicator.vue', () => ({
  default: { render: () => null },
}))
vi.mock('@renderer/shared/components/SettingsSelect.vue', () => ({
  default: {
    props: ['modelValue', 'options'],
    emits: ['update:modelValue'],
    render(this: { $emit: (event: string, value: string) => void }) {
      return h('select', {
        class: 'settings-select',
        onChange: (event: { target: { value: string } }) =>
          this.$emit('update:modelValue', event.target.value),
      })
    },
  },
}))
vi.mock('@renderer/features/albums/utils/albumTrackPresentation', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@renderer/features/albums/utils/albumTrackPresentation')>()
  return {
    ...actual,
    resolveAlbumTrackPresentation: (
      ...args: Parameters<typeof actual.resolveAlbumTrackPresentation>
    ) => {
      presentationCalls.count += 1
      return actual.resolveAlbumTrackPresentation(...args)
    },
  }
})

const unmounts: Array<() => void> = []
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  presentationCalls.count = 0
})

function makeTracks(count: number): TrackListItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index + 1,
    title: `Track ${index + 1}`,
    artist: 'Artist',
    trackNo: index + 1,
    durationSeconds: 180,
  })) as TrackListItem[]
}

for (const count of [12, 200, 1000]) {
  it(`limits a ${count}-track album to one page and updates the visible rows`, async () => {
    const root = new ShellTestElement('div')
    const currentTrackId = ref<number | null>(null)
    const tracks = makeTracks(count)
    const app = shellTestRenderer.createApp({
      render: () =>
        h(AlbumDetailTrackList, {
          groups: [{ discNo: null, tracks }],
          albumArtist: 'Artist',
          selectedTrackId: null,
          currentTrackId: currentTrackId.value,
          isPlaying: true,
          highlightedTrackId: null,
        }),
    })
    app.mount(root)
    unmounts.push(() => app.unmount())
    await nextTick()

    const rows = root.querySelectorAll('button.album-detail-track')
    const mountCalls = presentationCalls.count
    expect(rows).toHaveLength(10)
    expect(mountCalls).toBe(10)

    presentationCalls.count = 0
    currentTrackId.value = Math.ceil(count / 2)
    await nextTick()
    const updateCalls = presentationCalls.count
    expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(10)
    expect(updateCalls).toBe(10)
    console.log(JSON.stringify({ count, mountedRows: rows.length, mountCalls, updateCalls }))
  })
}

it('marks the last track of each disc, including a single-track disc', async () => {
  const root = new ShellTestElement('div')
  const tracks = makeTracks(3)
  const app = shellTestRenderer.createApp({
    render: () =>
      h(AlbumDetailTrackList, {
        groups: [
          { discNo: 1, tracks: tracks.slice(0, 2) },
          { discNo: 2, tracks: tracks.slice(2) },
        ],
        albumArtist: 'Artist',
        selectedTrackId: null,
        currentTrackId: null,
        isPlaying: false,
        highlightedTrackId: null,
      }),
  })
  app.mount(root)
  unmounts.push(() => app.unmount())
  await nextTick()
  const rows = root.querySelectorAll('button.album-detail-track')
  expect(root.querySelector('.album-track-pagination')).toBeNull()
  expect(rows.map((row) => row.classList.contains('album-detail-track--disc-end'))).toEqual([
    false,
    true,
    true,
  ])
})

it('navigates within and across discs and jumps to the playing track', async () => {
  const root = new ShellTestElement('div')
  const tracks = makeTracks(24)
  const app = shellTestRenderer.createApp({
    render: () =>
      h(AlbumDetailTrackList, {
        groups: [
          { discNo: 1, tracks: tracks.slice(0, 12) },
          { discNo: 2, tracks: tracks.slice(12, 18) },
          { discNo: 3, tracks: tracks.slice(18) },
        ],
        albumArtist: 'Artist',
        selectedTrackId: null,
        currentTrackId: 22,
        isPlaying: true,
        highlightedTrackId: null,
      }),
  })
  app.mount(root)
  unmounts.push(() => app.unmount())
  await nextTick()
  expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(10)
  const arrows = root.querySelectorAll('button.album-track-pagination-arrow')
  ;(arrows[1].props.onClick as () => void)()
  await nextTick()
  expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(2)
  ;(arrows[1].props.onClick as () => void)()
  await nextTick()
  expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(6)
  const select = root.querySelector('.settings-select')!
  ;(select.props.onChange as (event: unknown) => void)({ target: { value: '0' } })
  await nextTick()
  expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(10)
  ;(root.querySelector('.album-track-playing-jump')!.props.onClick as () => void)()
  await nextTick()
  expect(root.querySelector('[data-track-id="22"]')).not.toBeNull()
})

it('shows a searched track on its page', async () => {
  const root = new ShellTestElement('div')
  const highlighted = ref<number | null>(null)
  const tracks = makeTracks(25)
  const groups = [{ discNo: null, tracks }]
  const app = shellTestRenderer.createApp({
    render: () =>
      h(AlbumDetailTrackList, {
        groups,
        albumArtist: 'Artist',
        selectedTrackId: null,
        currentTrackId: null,
        isPlaying: false,
        highlightedTrackId: highlighted.value,
      }),
  })
  app.mount(root)
  unmounts.push(() => app.unmount())
  highlighted.value = 23
  await nextTick()
  expect(root.querySelector('[data-track-id="23"]')).not.toBeNull()
})

it('shows all discs together when the available height fits and paginates after shrinking', async () => {
  let onResize: ResizeObserverCallback | undefined
  vi.stubGlobal(
    'ResizeObserver',
    class {
      constructor(callback: ResizeObserverCallback) {
        onResize = callback
      }
      observe() {}
      disconnect() {}
    },
  )
  const root = new ShellTestElement('div')
  root.className = 'album-detail-scroll-wrapper'
  Object.assign(root, { clientHeight: 1000 })
  const tracks = makeTracks(12)
  const app = shellTestRenderer.createApp({
    render: () =>
      h(AlbumDetailTrackList, {
        groups: [
          { discNo: 1, tracks: tracks.slice(0, 6) },
          { discNo: 2, tracks: tracks.slice(6) },
        ],
        albumArtist: 'Artist',
        selectedTrackId: null,
        currentTrackId: null,
        isPlaying: false,
        highlightedTrackId: null,
      }),
  })
  app.mount(root)
  unmounts.push(() => app.unmount())
  await nextTick()
  expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(12)
  expect(root.querySelectorAll('.album-detail-disc-header')).toHaveLength(2)
  expect(root.querySelector('.album-track-pagination')).toBeNull()
  Object.assign(root, { clientHeight: 600 })
  onResize?.([], {} as ResizeObserver)
  await nextTick()
  expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(6)
  expect(root.querySelector('.album-track-pagination')).not.toBeNull()
  vi.unstubAllGlobals()
})
