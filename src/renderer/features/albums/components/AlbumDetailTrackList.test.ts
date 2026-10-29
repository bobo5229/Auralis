import { afterEach, expect, it, vi } from 'vitest'
import { h, nextTick, ref } from 'vue'
import type { TrackListItem } from '@shared/types/libraryScan'
import { ShellTestElement, shellTestRenderer } from '@renderer/testUtils/rendererTestHost'
import AlbumDetailTrackList from '@renderer/features/albums/components/AlbumDetailTrackList.vue'

const presentationCalls = vi.hoisted(() => ({ count: 0 }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/features/appearance/composables/useChineseTextDisplay', () => ({
  useChineseTextDisplay: () => ({
    songText: (value: string | null) => value ?? '',
    songValues: (value: string | null) => value ?? '',
  }),
}))
vi.mock('@renderer/features/appearance/components/PreferredPlayingIndicator.vue', () => ({
  default: { render: () => null },
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
  it(`mounts all ${count} real album track rows and recomputes them on current-track change`, async () => {
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
    expect(rows).toHaveLength(count)
    expect(mountCalls).toBe(count)

    presentationCalls.count = 0
    currentTrackId.value = Math.ceil(count / 2)
    await nextTick()
    const updateCalls = presentationCalls.count
    expect(root.querySelectorAll('button.album-detail-track')).toHaveLength(count)
    expect(updateCalls).toBe(count)
    console.log(JSON.stringify({ count, mountedRows: rows.length, mountCalls, updateCalls }))
  })
}
