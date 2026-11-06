import { afterEach, describe, expect, it } from 'vitest'
import { h, nextTick, reactive } from 'vue'
import {
  ShellTestElement,
  shellTestRenderer as renderer,
} from '@renderer/testUtils/rendererTestHost'
import CdPlaybackInfo from './CdPlaybackInfo.vue'

let unmount: (() => void) | null = null
function text(node: ShellTestElement | null): string {
  return node ? node.text + node.children.map(text).join('') : ''
}
afterEach(() => {
  unmount?.()
  unmount = null
})

describe('CD current playback information', () => {
  it('shows track details without controls and reserves the album row when hidden', async () => {
    const props = reactive({
      information: { title: '夜曲', artist: 'Artist', album: '专辑' },
      hideAlbum: false,
    })
    const root = new ShellTestElement('main')
    const app = renderer.createApp({ render: () => h(CdPlaybackInfo, props) })
    app.directive('tooltip', {})
    app.mount(root)
    unmount = () => app.unmount()
    const find = (selector: string) => root.querySelector(selector)
    expect(text(find('.cd-current-track-title'))).toBe('夜曲')
    expect(text(find('.cd-current-track-artist'))).toBe('Artist')
    expect(text(find('.cd-current-track-album'))).toBe('专辑')
    expect(find('button')).toBeNull()
    props.hideAlbum = true
    await nextTick()
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(true)
    expect(find('.cd-current-track-album')?.props.class).toContain('cd-current-track-album--hidden')
    props.information = { title: '下一首', artist: 'Another', album: '另一张' }
    props.hideAlbum = false
    await nextTick()
    expect(text(find('.cd-current-track-title'))).toBe('下一首')
    expect(text(find('.cd-current-track-album'))).toBe('另一张')
    expect(find('.cd-current-track-album')?.props['aria-hidden']).toBe(false)
  })
})
