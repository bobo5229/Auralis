import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive } from 'vue'
import {
  ShellTestElement,
  shellTestRenderer as renderer,
} from '@renderer/testUtils/rendererTestHost'
import type { TrackListItem } from '@shared/types/libraryScan'
import CdTrackList from './CdTrackList.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/features/appearance/components/PreferredPlayingIndicator.vue', () => ({
  default: {
    props: ['playing'],
    setup(props: { playing: boolean }) {
      return () => h('svg', { 'data-playing': props.playing })
    },
  },
}))
let unmount: (() => void) | null = null
afterEach(() => {
  unmount?.()
  unmount = null
})

function mount() {
  const props = reactive({
    tracks: [1, 2].map(
      (id) => ({ id, title: `Track ${id}`, artist: 'Artist', trackNo: id }) as TrackListItem,
    ),
    albumArtist: 'Artist',
    mode: 'sequential' as const,
    currentTrackId: 1 as number | null,
    isPlaying: true,
  })
  const play = vi.fn()
  const root = new ShellTestElement('main')
  const app = renderer.createApp({ render: () => h(CdTrackList, { ...props, onPlay: play }) })
  app.directive('tooltip', {})
  app.mount(root)
  unmount = () => app.unmount()
  const rows = () => root.querySelectorAll('.cd-track')
  return { props, rows, play }
}

describe('CD playing track rows', () => {
  it('retains current-track identity and number geometry while paused, then moves the marker on track change', async () => {
    const view = mount()
    const first = view.rows()[0]
    expect(first.props['aria-current']).toBe('true')
    expect(first.querySelector('.cd-track-number')?.className).toContain('cd-track-number--hidden')
    view.props.isPlaying = false
    await nextTick()
    expect(view.rows()[0]).toBe(first)
    expect(first.props['aria-current']).toBe('true')
    expect(first.querySelector('.cd-playing-bars')?.props['data-playing']).toBe('false')
    view.props.currentTrackId = 2
    await nextTick()
    expect(first.props['aria-current']).toBeUndefined()
    expect(first.querySelector('.cd-playing-bars')).toBeNull()
    expect(view.rows()[1].props['aria-current']).toBe('true')
    expect(view.play).not.toHaveBeenCalled()
  })

  it('shows no local marker for a track from another album and preserves click-to-play', async () => {
    const view = mount()
    view.props.currentTrackId = 99
    await nextTick()
    expect(view.rows().every((row) => row.props['aria-current'] === undefined)).toBe(true)
    ;(view.rows()[1].props.onClick as () => void)()
    expect(view.play).toHaveBeenCalledExactlyOnceWith(2)
  })
})
