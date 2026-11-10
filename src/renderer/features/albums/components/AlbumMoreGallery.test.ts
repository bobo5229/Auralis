import { afterEach, expect, it, vi } from 'vitest'
import { h, nextTick } from 'vue'
import type { AlbumSummary } from '@shared/types/albumSummary'
import { ShellTestElement, shellTestRenderer } from '@renderer/testUtils/rendererTestHost'
import AlbumMoreGallery from './AlbumMoreGallery.vue'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, locale: { value: 'en' } }),
}))
vi.mock('@renderer/shared/preferences/useChineseTextDisplay', () => ({
  useChineseTextDisplay: () => ({ songText: (value: string) => value }),
}))

const unmounts: Array<() => void> = []
afterEach(() => {
  unmounts.splice(0).forEach((unmount) => unmount())
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(ShellTestElement.prototype, 'clientWidth')
})

it.each([true, false])(
  'keeps recommendations stable with a CSS clamp gap (single row: %s)',
  async (singleRow) => {
    let resize: ResizeObserverCallback | undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'ResizeObserver',
      class {
        constructor(callback: ResizeObserverCallback) {
          resize = callback
        }
        observe() {}
        disconnect = disconnect
      },
    )
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', vi.fn())
    let width = 1068
    let measurements = 0
    // Return the responsive CSS expression that Chromium exposes, rather than a pixel value.
    vi.stubGlobal('getComputedStyle', () => {
      measurements += 1
      return {
        paddingLeft: '16px',
        paddingRight: '16px',
        columnGap: 'clamp(14px, 20% - 192px, 24px)',
        getPropertyValue: (name: string) =>
          name === '--gallery-card-min-width' ? '150px' : '14px',
      }
    })
    Object.defineProperty(ShellTestElement.prototype, 'clientWidth', {
      configurable: true,
      get: () => width,
    })
    const albums: AlbumSummary[] = Array.from({ length: 12 }, (_, index) => ({
      key: String(index),
      title: 'Album ' + index,
      albumArtist: 'Artist ' + index,
      releaseDate: '2024',
      artworkCacheKey: null,
      tracks: [],
    }))
    const root = new ShellTestElement('div')
    const opened = vi.fn()
    const app = shellTestRenderer.createApp({
      render: () =>
        h(AlbumMoreGallery, {
          albums,
          artistLabel: 'Artist',
          genreLabel: 'Pop',
          singleRow,
          onOpen: opened,
        }),
    })
    app.directive('tooltip', {})
    app.mount(root)
    unmounts.push(() => {
      app.unmount()
    })
    await nextTick()
    await nextTick()
    expect(root.querySelectorAll('.album-more-gallery-card')).toHaveLength(singleRow ? 6 : 12)
    const settled = measurements
    await nextTick()
    await nextTick()
    expect(measurements).toBe(settled)
    width = 674
    resize?.([], {} as ResizeObserver)
    await nextTick()
    await nextTick()
    const cards = root.querySelectorAll('.album-more-gallery-card')
    expect(cards).toHaveLength(singleRow ? 4 : 12)
    ;(cards[0].props.onClick as () => void)()
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ key: expect.any(String) }))
  },
)
