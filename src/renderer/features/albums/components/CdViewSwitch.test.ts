import { createRenderer, h, nextTick, reactive, ref, type CSSProperties } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import CdViewSwitch from './CdViewSwitch.vue'
import { hasCdViewSwitchTransition } from '../utils/cdViewSwitchTransition'

const navigation = vi.hoisted(() => ({ push: vi.fn() }))
vi.mock('vue-router', () => ({ useRouter: () => navigation }))
vi.mock('vue-i18n', () => ({ useI18n: () => ({ t: (key: string) => key }) }))

// Exercise the real component; only DOM geometry, animation frames and routing are simulated.
interface TestNode {
  props: Record<string, unknown>
  children: TestNode[]
  parent: TestNode | null
  offsetWidth: number
  offsetLeft: number
  getBoundingClientRect: () => DOMRect
  querySelector: (selector: string) => TestNode | null
  querySelectorAll: (selector: string) => TestNode[]
}

function findAll(root: TestNode, predicate: (node: TestNode) => boolean): TestNode[] {
  return [
    ...(predicate(root) ? [root] : []),
    ...root.children.flatMap((child) => findAll(child, predicate)),
  ]
}

function node(): TestNode {
  const element: TestNode = {
    props: {},
    children: [],
    parent: null,
    get offsetWidth() {
      return element.props['data-cd-view'] === 'browse' ? 40 : 80
    },
    get offsetLeft() {
      return element.props['data-cd-view'] === 'index' ? 64 : 0
    },
    getBoundingClientRect: () =>
      ({ left: element.offsetLeft, width: element.offsetWidth }) as DOMRect,
    querySelectorAll: () => findAll(element, (child) => !!child.props['data-cd-view']),
    querySelector: (selector) =>
      findAll(element, (child) => selector.includes(`"${child.props['data-cd-view']}"`))[0] ?? null,
  }
  return element
}

const frames = new Map<number, FrameRequestCallback>()
let frameId = 0
let cleanup: (() => void) | undefined
let media: EventTarget & { matches: boolean }
const disconnect = vi.fn()

beforeEach(() => {
  frames.clear()
  frameId = 0
  media = Object.assign(new EventTarget(), { matches: false })
  vi.stubGlobal('matchMedia', () => media)
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++frameId, callback)
    return frameId
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {}
      disconnect = disconnect
    },
  )
})

afterEach(() => {
  cleanup?.()
  cleanup = undefined
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function mountSwitch() {
  const props = reactive({ current: 'browse' as 'browse' | 'index', transitioning: true })
  const component = ref<InstanceType<typeof CdViewSwitch> | null>(null)
  const renderer = createRenderer<TestNode, TestNode>({
    createElement: node,
    createText: node,
    createComment: node,
    insert(child, parent, anchor) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
      child.parent = parent
      const index = anchor ? parent.children.indexOf(anchor) : -1
      parent.children.splice(index < 0 ? parent.children.length : index, 0, child)
    },
    remove(child) {
      if (child.parent) child.parent.children.splice(child.parent.children.indexOf(child), 1)
    },
    setText() {},
    setElementText() {},
    parentNode: (element) => element.parent,
    nextSibling: (element) =>
      element.parent?.children[element.parent.children.indexOf(element) + 1] ?? null,
    patchProp: (element, key, _previous, value) => {
      element.props[key] = value
    },
  })
  const root = node()
  const app = renderer.createApp({ render: () => h(CdViewSwitch, { ...props, ref: component }) })
  app.mount(root)
  cleanup = () => app.unmount()
  await nextTick()
  const indicator = findAll(root, (element) => element.props.class === 'cd-view-switch-indicator')[0]
  return { root, props, component, indicator }
}

function style(element: TestNode): CSSProperties {
  return element.props.style as CSSProperties
}

async function nextFrame() {
  const callbacks = [...frames.values()]
  frames.clear()
  callbacks.forEach((callback) => callback(0))
  await nextTick()
}

describe('fixed CD view navigation', () => {
  it('retains one navigation and moves its indicator on the page transition start frames', async () => {
    const { root, props, component, indicator } = await mountSwitch()
    const group = root.children[0]
    expect(style(indicator).transform).toBe('translateX(0px)')
    props.current = 'index'
    await nextTick()
    expect(root.children[0]).toBe(group)
    expect(style(indicator).transform).toBe('translateX(0px)')
    component.value!.syncToCurrent(true)
    await nextFrame()
    expect(style(indicator).transform).toBe('translateX(0px)')
    await nextFrame()
    expect(style(indicator).transform).toBe('translateX(64px)')
    expect(style(indicator).width).toBe('80px')
  })

  it('cancels a pending indicator move when the page direction reverses', async () => {
    const { props, component, indicator } = await mountSwitch()
    props.current = 'index'
    await nextTick()
    component.value!.syncToCurrent(true)
    await nextFrame()
    props.current = 'browse'
    await nextTick()
    component.value!.syncToCurrent(true)
    await nextFrame()
    await nextFrame()
    expect(style(indicator).transform).toBe('translateX(0px)')
    expect(style(indicator).width).toBe('40px')
  })

  it('settles directly for reduced motion and cancels scheduled work on unmount', async () => {
    const { props, component, indicator } = await mountSwitch()
    media.matches = true
    props.current = 'index'
    await nextTick()
    component.value!.syncToCurrent(true)
    await nextTick()
    expect(frames.size).toBe(0)
    expect(style(indicator).transform).toBe('translateX(64px)')
    media.matches = false
    component.value!.syncToCurrent(true)
    cleanup!()
    cleanup = undefined
    expect(frames.size).toBe(0)
    expect(disconnect).toHaveBeenCalledOnce()
  })

  it('keeps the selection and indicator unchanged when navigation fails', async () => {
    navigation.push.mockRejectedValueOnce(new Error('cancelled'))
    const { root, indicator } = await mountSwitch()
    const button = findAll(root, (element) => element.props['data-cd-view'] === 'index')[0]
    ;(button.props.onClick as () => void)()
    await Promise.resolve()
    await nextTick()
    expect(button.props['aria-pressed']).toBe(false)
    expect(style(indicator).transform).toBe('translateX(0px)')
    expect(hasCdViewSwitchTransition('browse', 'index')).toBe(false)
    expect(frames.size).toBe(0)
  })
})
