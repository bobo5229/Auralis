import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createRenderer, h, nextTick, ref } from 'vue'
import PlaybackSettings from './PlaybackSettings.vue'

const nativeAvailability = vi.hoisted(() => vi.fn(async () => ({ available: true })))
vi.mock('@renderer/shared/ipc/client', () => ({
  auralis: { playback: { nativeAvailability } },
}))
vi.mock('vue-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: { seconds: number }) => (params ? `${params.seconds} 秒` : key),
  }),
}))
const playback = {
  gaplessPlaybackEnabled: ref(true),
  skipDigitalSilenceEnabled: ref(false),
  softTransitionEnabled: ref(true),
  softTransitionDurationSeconds: ref(2),
  setGaplessPlaybackEnabled: vi.fn(),
  setSkipDigitalSilenceEnabled: vi.fn(),
  setSoftTransitionEnabled: vi.fn(),
  setSoftTransitionDurationSeconds: vi.fn((seconds: number) => {
    playback.softTransitionDurationSeconds.value = seconds
  }),
}
vi.mock('@renderer/features/playback/composables/usePlayback', () => ({
  usePlayback: () => playback,
}))

class TestNode {
  parent: TestNode | null = null
  children: TestNode[] = []
  props: Record<string, unknown> = {}
  text = ''
  constructor(public type: string) {}
}
const renderer = createRenderer<TestNode, TestNode>({
  createElement: (type) => new TestNode(type),
  createText: (text) => Object.assign(new TestNode('text'), { text }),
  createComment: () => new TestNode('comment'),
  insert(child, parent, anchor) {
    if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    child.parent = parent
    const index = anchor ? parent.children.indexOf(anchor) : -1
    if (index < 0) parent.children.push(child)
    else parent.children.splice(index, 0, child)
  },
  remove(child) {
    child.parent?.children.splice(child.parent.children.indexOf(child), 1)
  },
  setText: (node, text) => {
    node.text = text
  },
  setElementText: (node, text) => {
    node.text = text
  },
  parentNode: (node) => node.parent,
  nextSibling: (node) => node.parent?.children[node.parent.children.indexOf(node) + 1] ?? null,
  patchProp: (node, key, _old, value) => {
    node.props[key] = value
  },
})
function find(node: TestNode, type: string): TestNode | undefined {
  if (node.type === type) return node
  for (const child of node.children) {
    const match = find(child, type)
    if (match) return match
  }
  return undefined
}
const mounted: Array<ReturnType<typeof renderer.createApp>> = []
async function mount() {
  const root = new TestNode('root')
  const app = renderer.createApp({ render: () => h(PlaybackSettings) })
  app.mount(root)
  mounted.push(app)
  await Promise.resolve()
  await nextTick()
  return { slider: find(root, 'input')!, output: find(root, 'output')! }
}
beforeEach(() => {
  nativeAvailability.mockResolvedValue({ available: true })
  playback.gaplessPlaybackEnabled.value = true
  playback.softTransitionEnabled.value = true
  playback.softTransitionDurationSeconds.value = 2
  playback.setSoftTransitionDurationSeconds.mockClear()
})
afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount())
})

it('previews the duration while dragging and commits only on change', async () => {
  const { slider, output } = await mount()
  expect(slider.props).toMatchObject({
    min: 1,
    max: 6,
    step: 0.5,
    value: 2,
    disabled: false,
    'aria-valuetext': '2 秒',
  })
  ;(slider.props.onInput as (event: unknown) => void)({ target: { value: '5.5' } })
  await nextTick()
  expect(output.text).toBe('5.5 秒')
  expect(slider.props['aria-valuetext']).toBe('5.5 秒')
  expect(playback.setSoftTransitionDurationSeconds).not.toHaveBeenCalled()
  ;(slider.props.onChange as (event: unknown) => void)({ target: { value: '5.5' } })
  expect(playback.setSoftTransitionDurationSeconds).toHaveBeenCalledExactlyOnceWith(5.5)
  playback.softTransitionDurationSeconds.value = 1
  await nextTick()
  expect(output.text).toBe('1 秒')
})

it.each(['soft-transition', 'gapless', 'native'] as const)(
  'disables the slider when %s is unavailable without losing the value',
  async (reason) => {
    playback.softTransitionDurationSeconds.value = 6
    if (reason === 'soft-transition') playback.softTransitionEnabled.value = false
    if (reason === 'gapless') playback.gaplessPlaybackEnabled.value = false
    if (reason === 'native') nativeAvailability.mockResolvedValueOnce({ available: false })
    const { slider, output } = await mount()
    expect(slider.props.disabled).toBe(true)
    expect(slider.props.value).toBe(6)
    expect(output.text).toBe('6 秒')
    expect(playback.setSoftTransitionDurationSeconds).not.toHaveBeenCalled()
  },
)
