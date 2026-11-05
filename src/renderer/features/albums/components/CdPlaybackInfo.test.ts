import { afterEach, describe, expect, it, vi } from 'vitest'
import { h, nextTick, reactive } from 'vue'
import {
  ShellTestElement,
  shellTestRenderer as renderer,
} from '@renderer/testUtils/rendererTestHost'
import CdPlaybackInfo from './CdPlaybackInfo.vue'

vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))
vi.mock('@renderer/features/appearance/components/PreferredPlayingIndicator.vue', () => ({
  default: {
    props: ['playing'],
    setup(props: { playing: boolean }) {
      return () => h('svg', { 'data-playing': props.playing })
    },
  },
}))
vi.mock('vue', async (original) => {
  const actual = await original<typeof import('vue')>()
  return {
    ...actual,
    Transition: {
      inheritAttrs: false,
      setup: (_: unknown, { slots }: { slots: { default: () => unknown } }) => slots.default,
    },
  }
})

let unmount: (() => void) | null = null
function text(node: ShellTestElement | null): string {
  return node ? node.text + node.children.map(text).join('') : ''
}
afterEach(() => {
  unmount?.()
  unmount = null
  vi.useRealTimers()
})

function mount(focused = false) {
  const props = reactive({
    information: { id: 1, title: '夜曲', artist: 'Artist A & Artist B', album: '另一张专辑' },
    identity: 'album-a:1',
    focused,
    isPlaying: true,
    currentTime: 60,
    duration: 240,
    albumAvailable: true,
  })
  const toggle = vi.fn()
  const locate = vi.fn()
  const root = new ShellTestElement('main')
  const app = renderer.createApp({
    render: () => h(CdPlaybackInfo, { ...props, onTogglePlayback: toggle, onLocateAlbum: locate }),
  })
  app.directive('tooltip', {})
  app.mount(root)
  unmount = () => app.unmount()
  const find = (selector: string) => root.querySelector(selector)
  const click = (selector: string) => (find(selector)!.props.onClick as () => void)()
  return { props, root, find, click, toggle, locate }
}

describe('CD current playback information', () => {
  it('separates title and artist, keeps the album link and exposes playback controls', () => {
    const view = mount()
    expect(text(view.find('.cd-current-track-title'))).toBe('夜曲')
    expect(text(view.find('.cd-current-track-artist'))).toBe('Artist A & Artist B')
    expect(text(view.find('.cd-current-track-album-name'))).toBe('另一张专辑')
    expect(view.find('.cd-current-track-toggle')?.props['aria-label']).toBe('player.pause')
    view.click('.cd-current-track-toggle')
    expect(view.toggle).toHaveBeenCalledOnce()
    view.click('.cd-current-track-album-link')
    expect(view.locate).toHaveBeenCalledOnce()
    expect(view.root.querySelectorAll('.cd-current-track-time').map(text)).toEqual(['1:00', '4:00'])
  })

  it('retains the song and paused marker after auto-collapse, with details available on demand', async () => {
    vi.useFakeTimers()
    const view = mount(true)
    view.props.isPlaying = false
    await vi.advanceTimersByTimeAsync(4000)
    await nextTick()
    expect(text(view.find('.cd-current-track-title'))).toBe('夜曲')
    expect(view.find('.cd-current-track-artist')).toBeNull()
    expect(view.find('.cd-current-track-album')).toBeNull()
    expect(view.find('.cd-current-track-progress')).toBeNull()
    expect(view.find('.cd-current-track-indicator')?.props['data-playing']).toBe('false')
    expect(view.find('.cd-current-track-handle')?.props['aria-expanded']).toBe(false)
    view.click('.cd-current-track-handle')
    await nextTick()
    await vi.advanceTimersByTimeAsync(5000)
    expect(text(view.find('.cd-current-track-artist'))).toBe('Artist A & Artist B')
    expect(text(view.find('.cd-current-track-album'))).toBe('另一张专辑')
    expect(view.find('.cd-current-track-handle')?.props['aria-expanded']).toBe(true)
    expect(view.toggle).not.toHaveBeenCalled()
    expect(view.locate).not.toHaveBeenCalled()
  })

  it('resets the collapse timer for the latest song and clears it on unmount', async () => {
    vi.useFakeTimers()
    const view = mount(true)
    await vi.advanceTimersByTimeAsync(3000)
    view.props.information = { ...view.props.information, id: 2, title: '下一首' }
    await nextTick()
    await vi.advanceTimersByTimeAsync(1500)
    expect(text(view.find('.cd-current-track-title'))).toBe('下一首')
    expect(view.find('.cd-current-track-handle')?.props['aria-expanded']).toBe(true)
    unmount?.()
    unmount = null
    expect(vi.getTimerCount()).toBe(0)
  })

  it('does not reopen collapsed details when playback time or pause state changes', async () => {
    vi.useFakeTimers()
    const view = mount(true)
    await vi.advanceTimersByTimeAsync(4000)
    view.props.currentTime = 80
    view.props.isPlaying = false
    await nextTick()
    expect(view.find('.cd-current-track-handle')?.props['aria-expanded']).toBe(false)
    expect(text(view.find('.cd-current-track-title'))).toBe('夜曲')
    expect(view.find('.cd-current-track-artist')).toBeNull()
  })

  it('keeps progress bounded and disables unavailable album navigation', async () => {
    const view = mount()
    view.props.currentTime = 500
    view.props.albumAvailable = false
    await nextTick()
    const fill = () => view.find('.cd-current-track-progress')!.children[1]
    expect(fill().props['stroke-dasharray']).toBe('100 100')
    expect(view.find('.cd-current-track-album-link')?.props.disabled).toBe(true)
    view.props.duration = 0
    await nextTick()
    expect(fill().props['stroke-dasharray']).toBe('0 100')
  })
})
