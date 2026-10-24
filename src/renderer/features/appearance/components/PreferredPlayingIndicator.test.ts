import { h, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { shellTestRenderer, ShellTestElement } from '@renderer/testUtils/rendererTestHost'
import { setPlayingIconPreset } from '../composables/usePlayingIconPreference'
import PreferredPlayingIndicator from './PreferredPlayingIndicator.vue'

vi.mock('@renderer/shared/components/PlayingIndicator.vue', () => ({
  default: {
    props: ['playing', 'size', 'preset'],
    setup: (props: { playing: boolean; size?: number; preset: string }) => () =>
      h('svg', {
        'data-preset': props.preset,
        'data-playing': props.playing,
        'data-size': props.size,
      }),
  },
}))

afterEach(() => {
  setPlayingIconPreset('equalizer')
  vi.unstubAllGlobals()
})

it('applies reactive appearance preferences while forwarding playback, size and attributes', async () => {
  vi.stubGlobal('localStorage', { setItem: vi.fn() })
  const root = new ShellTestElement('root')
  const app = shellTestRenderer.createApp({
    render: () =>
      h(PreferredPlayingIndicator, { playing: true, size: 18, class: 'existing-row-bars' }),
  })
  app.mount(root)
  const svg = root.children[0]!
  expect(svg.props).toMatchObject({
    'data-preset': 'equalizer',
    'data-playing': 'true',
    'data-size': '18',
    class: 'existing-row-bars',
  })
  setPlayingIconPreset('blocks-wave')
  await nextTick()
  expect(svg.props['data-preset']).toBe('blocks-wave')
  app.unmount()
})
